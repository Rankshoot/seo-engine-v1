"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { Keyword, KeywordStatus, TARGET_REGIONS } from "@/lib/types";
import {
  useAppDispatch,
  useAppSelector,
  selectKeywordPrefs,
  selectKeywordStatuses,
  selectKeywordsCache,
  selectBriefCache,
} from "@/lib/redux/hooks";
import {
  bulkKeywordStatusChanged,
  briefLoaded,
  keywordStatusChanged,
  keywordsLoaded,
  clearKeywordsCache,
  clearBriefCache,
  mergeKeywordStatuses,
  rememberKeywordFilter,
  rememberKeywordSort,
  removeKeywordStatus,
} from "@/lib/redux/keyword-workspace-slice";
import {
  discoverKeywords,
  getKeywords,
  loadMoreKeywords,
  updateKeywordStatus,
  bulkUpdateKeywordStatus,
  deleteKeyword,
  deleteAllKeywords,
} from "@/app/actions/keyword-actions";
import {
  getBusinessBrief,
  generateBusinessBrief,
} from "@/app/actions/brief-actions";
import { getProject } from "@/app/actions/project-actions";
import type { BusinessBrief } from "@/lib/business-brief";
import type { DataForSEOTraceEntry } from "@/lib/dataforseo";
import { TableSkeleton, BusinessBriefSkeleton } from "@/components/Skeleton";
import { KeywordDetailModal } from "@/components/KeywordDetailModal";
import { KeywordRowMenu } from "@/components/keywords/KeywordRowMenu";
import { Tooltip, InfoIcon } from "@/components/Tooltip";

type KeywordsResponse = Awaited<ReturnType<typeof getKeywords>>;
type BriefResponse = Awaited<ReturnType<typeof getBusinessBrief>>;
type ProjectResponse = Awaited<ReturnType<typeof getProject>>;

function regionName(code: string): string {
  return TARGET_REGIONS.find(r => r.code === code.toLowerCase())?.name ?? code.toUpperCase();
}

const STATUS_COLORS: Record<KeywordStatus, string> = {
  approved: "bg-brand-action/10 text-brand-action border-brand-action/20",
  rejected: "bg-brand-coral/10 text-brand-coral border-brand-coral/20",
  pending: "bg-surface-secondary text-text-tertiary border-border-subtle",
};

const KD_COLOR = (kd: number) =>
  kd < 30 ? "text-[#10b981]" : kd < 60 ? "text-[#f59e0b]" : "text-brand-coral";
const KD_LABEL = (kd: number) =>
  kd === 0 ? "—" : kd < 30 ? "Easy" : kd < 60 ? "Medium" : "Hard";

type FilterTab = "all" | KeywordStatus;

type TableSortColumn =
  | "keyword"
  | "volume"
  | "kd"
  | "cpc"
  | "intent"
  | "ai_score"
  | "analysis_score"
  | "status";

type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<KeywordStatus, number> = { pending: 0, approved: 1, rejected: 2 };

/** Default first-click direction when activating a column. */
function defaultDirForSortColumn(col: TableSortColumn): SortDir {
  return col === "keyword" || col === "intent" ? "asc" : "desc";
}

function compareKeywords(a: Keyword, b: Keyword, col: TableSortColumn, dir: SortDir): number {
  const m = dir === "asc" ? 1 : -1;
  switch (col) {
    case "keyword":
      return m * a.keyword.localeCompare(b.keyword);
    case "volume":
      return m * ((a.volume || 0) - (b.volume || 0));
    case "kd":
      return m * ((a.kd || 0) - (b.kd || 0));
    case "cpc":
      return m * ((a.cpc || 0) - (b.cpc || 0));
    case "intent":
      return m * ((a.intent || "").localeCompare(b.intent || ""));
    case "ai_score":
      return m * ((a.ai_score || 0) - (b.ai_score || 0));
    case "analysis_score":
      return m * ((a.keyword_analysis_score ?? 0) - (b.keyword_analysis_score ?? 0));
    case "status":
      return m * (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
    default:
      return 0;
  }
}

export default function KeywordsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const keywordPrefs = useAppSelector(state => selectKeywordPrefs(state, projectId));
  const keywordStatuses = useAppSelector(state => selectKeywordStatuses(state, projectId));

  // Redux caches are backed by localStorage, which isn't available during SSR.
  // We read them here but only apply them as React Query initialData AFTER the
  // client has hydrated (mounted = true). This prevents the server/client HTML
  // mismatch that would otherwise fire a hydration warning.
  const reduxKeywordsCache = useAppSelector(state => selectKeywordsCache(state, projectId));
  const reduxBriefCache = useAppSelector(state => selectBriefCache(state, projectId));
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // After mount, pull from Redux so navigating back to this page is instant.
  const keywordsCache = mounted ? reduxKeywordsCache : null;
  const briefCache = mounted ? reduxBriefCache : null;

  const PAGE_SIZE = 20;
  const KEYWORDS_KEY = qk.keywords(projectId, { limit: PAGE_SIZE, offset: 0 });
  const BRIEF_KEY = qk.brief(projectId);
  const PROJECT_KEY = qk.project(projectId);

  // Build React Query initialData from the Redux caches. When present, React Query
  // uses the data immediately AND treats it as fresh (staleTime: Infinity + initialDataUpdatedAt),
  // so no network call fires on revisit or page refresh.
  const keywordsInitialData: KeywordsResponse | undefined = keywordsCache
    ? { success: true, data: keywordsCache.keywords, total: keywordsCache.total }
    : undefined;

  const briefInitialData: BriefResponse | undefined = briefCache
    ? { success: true, brief: briefCache.brief, updated_at: briefCache.updatedAt ?? undefined }
    : undefined;

  const [discovering, setDiscovering] = useState(false);
  const filter = keywordPrefs.filter as FilterTab;
  const tableSort = keywordPrefs.tableSort as { column: TableSortColumn; dir: SortDir };
  const [error, setError] = useState("");

  const [refreshingBrief, setRefreshingBrief] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);

  const [loadingMore, setLoadingMore] = useState(false);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [massSelectMode, setMassSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keyword drilldown modal. Stored as id (not a `Keyword` object) so the
  // modal always reflects the latest row state — including approve/reject
  // updates that happen via `handleStatusUpdate`.
  const [modalKeywordId, setModalKeywordId] = useState<string | null>(null);

  const { data: keywordsData, isLoading: loading } = useQuery<KeywordsResponse>({
    queryKey: KEYWORDS_KEY,
    queryFn: () => getKeywords(projectId, { limit: PAGE_SIZE, offset: 0 }),
    enabled: !!projectId,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    initialData: keywordsInitialData,
    initialDataUpdatedAt: keywordsCache?.loadedAt,
  });
  const serverKeywords: Keyword[] =
    keywordsData && "success" in keywordsData && keywordsData.success ? keywordsData.data : [];
  const keywords: Keyword[] = useMemo(
    () =>
      serverKeywords.map(keyword =>
        keywordStatuses[keyword.id] ? { ...keyword, status: keywordStatuses[keyword.id] } : keyword
      ),
    [serverKeywords, keywordStatuses]
  );
  const pendingTotal =
    keywordsData && "success" in keywordsData && keywordsData.success
      ? keywordsData.total ?? keywordsData.data.length
      : 0;

  useEffect(() => {
    if (serverKeywords.length === 0) return;
    dispatch(
      mergeKeywordStatuses({
        projectId,
        statuses: Object.fromEntries(serverKeywords.map(kw => [kw.id, kw.status])),
      })
    );
    const total =
      keywordsData && "success" in keywordsData && keywordsData.success
        ? keywordsData.total ?? serverKeywords.length
        : serverKeywords.length;
    dispatch(keywordsLoaded({ projectId, keywords: serverKeywords, total }));
  }, [dispatch, projectId, serverKeywords, keywordsData]);

  const { data: briefData, isLoading: loadingBrief } = useQuery<BriefResponse>({
    queryKey: BRIEF_KEY,
    queryFn: () => getBusinessBrief(projectId),
    enabled: !!projectId,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    initialData: briefInitialData,
    initialDataUpdatedAt: briefCache?.loadedAt,
  });

  // Keep Redux brief cache in sync so page-refresh is instant.
  useEffect(() => {
    if (!briefData?.success) return;
    dispatch(
      briefLoaded({
        projectId,
        brief: briefData.brief ?? null,
        updatedAt: briefData.updated_at ?? null,
      })
    );
  }, [dispatch, projectId, briefData]);

  const { data: projectData } = useQuery<ProjectResponse>({
    queryKey: PROJECT_KEY,
    queryFn: () => getProject(projectId),
    enabled: !!projectId,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
  const brief: BusinessBrief | null =
    briefData && briefData.success ? briefData.brief ?? null : null;
  const briefUpdatedAt: string | null =
    briefData && briefData.success ? briefData.updated_at ?? null : null;

  const project =
    projectData && "success" in projectData && projectData.success && projectData.data
      ? projectData.data
      : null;

  const pushToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  };

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  const modalKeyword = useMemo(
    () => keywords.find(k => k.id === modalKeywordId) ?? null,
    [keywords, modalKeywordId]
  );

  /** Optimistically patch the cached keywords list. */
  const patchKeywords = (mutator: (list: Keyword[]) => Keyword[]) => {
    queryClient.setQueryData<KeywordsResponse>(KEYWORDS_KEY, prev => {
      if (!prev || !("success" in prev) || !prev.success) return prev;
      return { ...prev, data: mutator(prev.data) };
    });
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    const currentPending = keywords.filter(k => k.status === "pending").length;
    const res = await loadMoreKeywords(projectId, currentPending, PAGE_SIZE);
    if (res.success) {
      queryClient.setQueryData<KeywordsResponse>(KEYWORDS_KEY, prev => {
        if (!prev || !("success" in prev) || !prev.success) return prev;
        const seen = new Set(prev.data.map(k => k.id));
        const fresh = res.data.filter(k => !seen.has(k.id));
        const merged = [...prev.data, ...fresh];
        // Keep the Redux cache in sync with the expanded list.
        dispatch(keywordsLoaded({ projectId, keywords: merged, total: res.total ?? prev.total ?? merged.length }));
        return { ...prev, data: merged, total: res.total ?? prev.total };
      });
    }
    setLoadingMore(false);
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    setError("");
    // Clear caches so fresh discovery results are fetched instead of stale data.
    dispatch(clearKeywordsCache({ projectId }));
    dispatch(clearBriefCache({ projectId }));
    const res = await discoverKeywords(projectId);
    const typed = res as {
      discoveryTrace?: DataForSEOTraceEntry[];
      briefSummary?: {
        summary: string;
        seed_count: number;
        scraped_urls: string[];
        scraped_chars: number;
        generated_at: string;
      } | null;
      relevance?: { kept: number; dropped: number; threshold: number; reason?: string } | null;
    };
    if (typed.briefSummary) {
      console.groupCollapsed(`[Keywords] Business brief — seeds used to drive this run`);
      console.log("summary", typed.briefSummary.summary);
      console.log("seed_count", typed.briefSummary.seed_count);
      console.log("scraped_urls", typed.briefSummary.scraped_urls);
      console.log("scraped_chars", typed.briefSummary.scraped_chars);
      console.log("brief_generated_at", typed.briefSummary.generated_at);
      console.groupEnd();
    }
    if (typed.relevance) {
      console.groupCollapsed(
        `[Keywords] Relevance filter — kept ${typed.relevance.kept}, dropped ${typed.relevance.dropped}`
      );
      console.log("threshold", typed.relevance.threshold);
      if (typed.relevance.reason) console.log("reason", typed.relevance.reason);
      console.groupEnd();
    }
    if (typed.discoveryTrace?.length) {
      console.groupCollapsed(
        `[Keywords] DataForSEO — this Discover / Re-discover run (${typed.discoveryTrace.length} calls)`
      );
      for (const t of typed.discoveryTrace) {
        console.groupCollapsed(`${t.label}  HTTP ${t.httpStatus}${t.ok ? "" : " ✗"}`);
        console.log("url", t.url);
        console.log("request body", t.requestBody);
        if (typeof t.cost === "number") console.log("cost (credits)", t.cost);
        if (t.fetchError) console.warn("fetchError", t.fetchError);
        if (t.parseError) console.warn("parseError", t.parseError);
        console.log("rawText", t.rawText);
        console.log("parsed JSON", t.parsed);
        console.groupEnd();
      }
      console.groupEnd();
    }
    if (res.success) {
      // Refresh both the keyword list and the brief that drove the run.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.keywordsAll(projectId) }),
        queryClient.invalidateQueries({ queryKey: BRIEF_KEY }),
        queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) }),
      ]);
    } else setError(res.error ?? "Discovery failed");
    setDiscovering(false);
  };

  const handleRefreshBrief = async () => {
    setRefreshingBrief(true);
    setError("");
    const res = await generateBusinessBrief(projectId, { force: true });
    if (res.trace?.length) {
      console.groupCollapsed(
        `[Brief] Refresh — scraped ${res.trace.filter(t => t.label === "jina_read" && t.ok).length} pages`
      );
      for (const t of res.trace) {
        console.log(t.label, { url: t.url, ok: t.ok, length: t.length, error: t.error });
      }
      console.groupEnd();
    }
    if (res.success && res.brief) {
      const updatedAt = new Date().toISOString();
      // Update React Query cache immediately so the UI reflects fresh brief data.
      queryClient.setQueryData<BriefResponse>(BRIEF_KEY, {
        success: true,
        brief: res.brief,
        updated_at: updatedAt,
      });
      // Sync to Redux so the next page refresh serves from cache.
      dispatch(briefLoaded({ projectId, brief: res.brief, updatedAt }));
    } else {
      setError(res.error ?? "Failed to refresh business brief");
    }
    setRefreshingBrief(false);
  };

  const handleStatusUpdate = async (kwId: string, status: KeywordStatus, phrase?: string) => {
    const keyword = keywords.find(k => k.id === kwId);
    const previousStatus = keyword?.status;
    const label = phrase ?? keyword?.keyword ?? "Keyword";
    setError("");
    const previousData = queryClient.getQueryData<KeywordsResponse>(KEYWORDS_KEY);

    // Optimistic update — fire immediately so the row reflects the new state
    // without waiting for the network round-trip.
    patchKeywords(list => list.map(k => (k.id === kwId ? { ...k, status } : k)));
    dispatch(
      keywordStatusChanged({
        projectId,
        keywordId: kwId,
        previousStatus,
        nextStatus: status,
      })
    );

    // Show the toast now so it feels instant, then fire the API in the background.
    if (status === "approved") {
      pushToast(`"${label}" added to your calendar`);
    } else if (status === "pending") {
      pushToast(`"${label}" removed from your calendar`);
    }

    // Keep the menu button blocked only for a brief moment while the row
    // re-renders — then release so the user can interact again.
    setBusyRowId(kwId);
    const res = await updateKeywordStatus(kwId, status);
    setBusyRowId(null);

    if (!res.success) {
      // Roll back on failure.
      if (previousData) queryClient.setQueryData(KEYWORDS_KEY, previousData);
      if (previousStatus) {
        dispatch(
          keywordStatusChanged({
            projectId,
            keywordId: kwId,
            previousStatus: status,
            nextStatus: previousStatus,
          })
        );
      }
      setError(res.error ?? "Could not update keyword status");
    } else {
      queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
      queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
      queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
    }
  };

  const handleKeywordRemove = async (kwId: string, phrase: string) => {
    if (!confirm(`Remove “${phrase}” from this project? This cannot be undone.`)) return;
    setBusyRowId(kwId);
    setError("");
    const snapshot = queryClient.getQueryData<KeywordsResponse>(KEYWORDS_KEY);
    const previousStatus = keywords.find(k => k.id === kwId)?.status;
    patchKeywords(list => list.filter(k => k.id !== kwId));
    const res = await deleteKeyword(kwId);
    if (!res.success) {
      if (snapshot) queryClient.setQueryData(KEYWORDS_KEY, snapshot);
      setError(("error" in res && res.error) || "Could not delete keyword");
    } else {
      dispatch(removeKeywordStatus({ projectId, keywordId: kwId, previousStatus }));
      queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
    }
    setBusyRowId(null);
  };

  const filtered = useMemo(() => {
    const list = keywords.filter(k => {
      if (filter === "all") return true;
      return k.status === filter;
    });
    return [...list].sort((a, b) => compareKeywords(a, b, tableSort.column, tableSort.dir)).slice(0, 100);
  }, [keywords, filter, tableSort]);

  const toggleSortColumn = (column: TableSortColumn) =>
    dispatch(
      rememberKeywordSort({
        projectId,
        tableSort:
          tableSort.column === column
            ? { column, dir: tableSort.dir === "asc" ? "desc" : "asc" }
            : { column, dir: defaultDirForSortColumn(column) },
      })
    );

  const exitMassSelect = () => {
    setMassSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleRowSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkApproveToCalendar = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setError("");
    const previousData = queryClient.getQueryData<KeywordsResponse>(KEYWORDS_KEY);
    const previousStatuses = Object.fromEntries(
      ids.map(id => [id, keywords.find(keyword => keyword.id === id)?.status ?? "pending"])
    ) as Record<string, KeywordStatus>;
    setBulkApproving(true);
    patchKeywords(list =>
      list.map(k => (ids.includes(k.id) ? { ...k, status: "approved" as const } : k))
    );
    dispatch(bulkKeywordStatusChanged({ projectId, keywordIds: ids, nextStatus: "approved" }));
    console.log("[Keywords] Bulk approve → calendar", { count: ids.length, ids });
    try {
      const res = await bulkUpdateKeywordStatus(ids, "approved");
      if (!res.success) {
        if (previousData) queryClient.setQueryData(KEYWORDS_KEY, previousData);
        for (const [keywordId, previousStatus] of Object.entries(previousStatuses)) {
          dispatch(
            keywordStatusChanged({
              projectId,
              keywordId,
              previousStatus: "approved",
              nextStatus: previousStatus,
            })
          );
        }
        setError(res.error ?? "Could not approve keywords");
      } else {
        queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
        queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
        queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        pushToast(
          ids.length === 1 ? "1 keyword added to your calendar" : `${ids.length} keywords added to your calendar`
        );
        exitMassSelect();
      }
    } finally {
      setBulkApproving(false);
    }
  };

  const counts = {
    all: keywords.length,
    pending: keywords.filter(k => k.status === "pending").length,
    approved: keywords.filter(k => k.status === "approved").length,
    rejected: keywords.filter(k => k.status === "rejected").length,
  };

  const sortMark = (col: TableSortColumn) =>
    tableSort.column !== col ? (
      <span className="ml-1 text-[11px] font-normal normal-case tracking-normal text-text-tertiary/40" aria-hidden>
        ↕
      </span>
    ) : (
      <span className="ml-1 text-brand-action" aria-hidden>
        {tableSort.dir === "asc" ? "↑" : "↓"}
      </span>
    );

  const FILTER_TABS: { tab: FilterTab; label: string }[] = [
    { tab: "all", label: "All" },
    { tab: "pending", label: "Pending" },
    { tab: "approved", label: "Approved" },
    { tab: "rejected", label: "Rejected" },
  ];

  const thBtn =
    "group inline-flex items-center gap-0.5 rounded-[6px] px-1 py-0.5 -mx-1 text-left uppercase tracking-widest hover:bg-surface-hover/80 hover:text-text-secondary transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-action/40";

  return (
    <div className="space-y-10 pb-16 pl-4 pr-4 relative">
      {/* ── HEADER (match project overview chrome) ─────────────────────────── */}
      <div className="pt-4 pb-8 border-b border-border-subtle">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-[14px] text-text-tertiary">
          <span className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-secondary px-3 py-1 font-mono text-[12px] uppercase tracking-widest text-text-secondary">
            <span className="h-2 w-2 rounded-full bg-brand-action" />
            Keyword discovery
          </span>
          {project ? (
            <>
              <span className="font-mono text-text-primary">{project.domain}</span>
              <span className="opacity-30">/</span>
              <span>{regionName(project.target_region)}</span>
              {project.niche ? (
                <>
                  <span className="opacity-30">/</span>
                  <span>{project.niche}</span>
                </>
              ) : null}
            </>
          ) : (
            <span className="text-text-tertiary">…</span>
          )}
        </div>

        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="text-[48px] font-normal tracking-[-0.96px] leading-none text-text-primary font-display">
              {project?.name ?? "…"}
            </h1>
            {project?.company && project.company !== project.name ? (
              <p className="mt-3 text-[16px] text-text-tertiary">{project.company}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/projects/${projectId}`}
              className="rounded-[4px] px-4 py-2 text-[14px] text-text-secondary hover:text-text-primary hover:underline"
            >
              Overview
            </Link>
            <Link
              href={`/projects/${projectId}/competitors`}
              className="inline-flex items-center gap-2 rounded-[30px] border border-border-subtle bg-surface-elevated px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              Competitors
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <Link
              href={`/projects/${projectId}/audit`}
              className="inline-flex items-center gap-2 rounded-[30px] border border-border-subtle bg-surface-elevated px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              Content health
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            {counts.approved >= 5 ? (
              <Link
                href={`/projects/${projectId}/calendar`}
                className="inline-flex items-center gap-2 rounded-[30px] border border-border-subtle bg-surface-elevated px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                Calendar
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            ) : null}
            <button
              type="button"
              onClick={handleDiscover}
              disabled={discovering}
              className="inline-flex items-center gap-2 rounded-[32px] bg-brand-primary px-5 py-2.5 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {discovering ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-on-primary/30 border-t-brand-on-primary" />
                  Discovering…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  {keywords.length > 0 ? "Re-discover" : "Discover keywords"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── BUSINESS BRIEF ─────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-[28px] font-normal tracking-[-0.28px] text-text-primary font-display">Business brief</h2>
          <p className="mt-1.5 text-[14px] text-text-tertiary max-w-3xl">
            Scraped context from your domain that seeds discovery — refresh when your site or positioning changes.
          </p>
        </div>
        {loadingBrief ? (
          <BusinessBriefSkeleton />
        ) : (
          <div className="rounded-[16px] border border-border-subtle bg-surface-elevated p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-surface-tertiary text-text-primary">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
              </svg>
            </div>
            <div>
              {brief ? (
                <p className="text-[13px] text-text-tertiary">
                  {brief.seed_phrases.length} seeds · scraped {brief.source_urls.length} pages
                  {briefUpdatedAt ? ` · updated ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(briefUpdatedAt))}` : ""}
                </p>
              ) : (
                <p className="text-[13px] text-text-tertiary">
                  No brief yet — we'll auto-build one on your first Discover click.
                </p>
              )}
              {brief?.summary ? (
                <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-text-secondary line-clamp-2">
                  {brief.summary}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {brief ? (
              <button
                type="button"
                onClick={() => setBriefOpen(o => !o)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,colors] duration-200 hover:border-border-strong hover:text-text-primary hover:-translate-y-px active:scale-95"
              >
                {briefOpen ? "Hide details" : "View details"}
              </button>
            ) : null}
            <div className="flex flex-col items-end gap-0.5">
              <button
                type="button"
                onClick={handleRefreshBrief}
                disabled={refreshingBrief}
                title="Re-scrape your domain and regenerate the business brief. Uses Jina Reader."
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,colors] duration-200 hover:border-border-strong hover:text-text-primary hover:-translate-y-px active:scale-95 disabled:pointer-events-none disabled:opacity-50"
              >
                {refreshingBrief ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-text-tertiary border-t-text-primary" />
                    Scraping…
                  </>
                ) : (
                  <>
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                    {brief ? "Refresh brief" : "Generate brief"}
                  </>
                )}
              </button>
              {briefUpdatedAt && (
                <span className="text-[10px] text-text-tertiary" title={briefUpdatedAt}>
                  Updated {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(briefUpdatedAt))}
                </span>
              )}
            </div>
          </div>
        </div>

        {briefOpen && brief ? (
          <div className="mt-6 grid grid-cols-1 gap-6 border-t border-border-subtle pt-6 md:grid-cols-2">
            {brief.products.length ? (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">Products</p>
                <div className="flex flex-wrap gap-2">
                  {brief.products.map(p => (
                    <span key={p} className="rounded-[4px] bg-surface-secondary px-2.5 py-1 text-[13px] text-text-secondary">{p}</span>
                  ))}
                </div>
              </div>
            ) : null}
            {brief.entities.length ? (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">Entities</p>
                <div className="flex flex-wrap gap-2">
                  {brief.entities.slice(0, 18).map(e => (
                    <span key={e} className="rounded-[4px] bg-surface-secondary px-2.5 py-1 text-[13px] text-text-secondary">{e}</span>
                  ))}
                </div>
              </div>
            ) : null}
            {brief.audiences.length ? (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">Audiences</p>
                <ul className="space-y-1 text-[13px] text-text-secondary">
                  {brief.audiences.map(a => <li key={a}>· {a}</li>)}
                </ul>
              </div>
            ) : null}
            {brief.usps.length ? (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">USPs</p>
                <ul className="space-y-1 text-[13px] text-text-secondary">
                  {brief.usps.map(u => <li key={u}>· {u}</li>)}
                </ul>
              </div>
            ) : null}
            {brief.seed_phrases.length ? (
              <div className="md:col-span-2">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
                  Seed phrases ({brief.seed_phrases.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {brief.seed_phrases.map(s => (
                    <span key={s} className="rounded-[4px] border border-brand-action/20 bg-brand-action/10 px-2.5 py-1 text-[13px] text-brand-action">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {brief.source_urls.length ? (
              <div className="md:col-span-2">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">Scraped pages</p>
                <ul className="space-y-1 text-[13px]">
                  {brief.source_urls.map(u => (
                    <li key={u} className="truncate">
                      <a href={u} target="_blank" rel="noopener noreferrer" className="text-brand-action hover:underline">{u}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      )}
      </section>

      {/* ── KEYWORD LIST ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[28px] font-normal tracking-[-0.28px] text-text-primary font-display">Keyword list</h2>
            {keywords.length === 0 ? (
              <p className="mt-1.5 text-[14px] text-text-tertiary">Run Discover to load keywords.</p>
            ) : null}
          </div>
        </div>

          {error && (
            <div className="flex items-center gap-3 rounded-[16px] border border-brand-coral/20 bg-brand-coral/10 p-5 text-[14px] text-brand-coral">
              {error}
            </div>
          )}

          {keywords.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1 rounded-[8px] border border-border-subtle bg-surface-secondary p-1 w-fit transition-shadow duration-200">
                {FILTER_TABS.map(({ tab, label }) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => dispatch(rememberKeywordFilter({ projectId, filter: tab }))}
                    className={`rounded-[6px] px-4 py-1.5 text-[13px] font-medium capitalize transition-all duration-150 ${
                      filter === tab
                        ? "bg-surface-elevated text-text-primary shadow-sm ring-1 ring-border-subtle/80"
                        : "text-text-tertiary hover:text-text-secondary"
                    }`}
                  >
                    {label} ({counts[tab]})
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!massSelectMode ? (
                  <button
                    type="button"
                    aria-label="Mass select keywords"
                    onClick={() => {
                      setMassSelectMode(true);
                      setSelectedIds(new Set());
                    }}
                    className="inline-flex h-8 shrink-0 cursor-pointer flex-row items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,opacity,colors] duration-200 ease-out hover:border-border-strong hover:text-text-primary hover:-translate-y-px active:scale-95 motion-safe:hover:scale-105"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3 w-3 shrink-0 opacity-75"
                      aria-hidden
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.85}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="3" width="7" height="7" rx="1.25" opacity="0.65" />
                      <rect x="14" y="3" width="7" height="7" rx="1.25" opacity="0.65" />
                      <rect x="3" y="14" width="7" height="7" rx="1.25" opacity="0.65" />
                      <path d="M14 17.5 16 19.5 21 13.5" />
                    </svg>
                    <span>Mass select</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleBulkApproveToCalendar()}
                      disabled={bulkApproving || selectedIds.size === 0}
                      className={`inline-flex h-8 w-38 shrink-0 cursor-pointer flex-col justify-center whitespace-nowrap rounded-full border border-brand-action/70 bg-brand-action px-2 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide text-brand-on-primary shadow-sm transition-[transform,box-shadow,opacity] duration-200 ease-out hover:-translate-y-px hover:shadow-md hover:shadow-brand-action/20 active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-35 motion-safe:hover:scale-105 ${
                        bulkApproving ? "animate-pulse cursor-wait" : ""
                      }`}
                    >
                      <span
                        className={`block max-w-full overflow-hidden truncate text-center ${bulkApproving ? "text-[13px] leading-none" : "tabular-nums"}`}
                      >
                        {bulkApproving ? "…" : selectedIds.size > 0 ? `Approve (${selectedIds.size})` : "Approve"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={exitMassSelect}
                      disabled={bulkApproving}
                      className="inline-flex h-8 min-w-19 shrink-0 cursor-pointer flex-col justify-center whitespace-nowrap rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,opacity,colors] duration-200 ease-out hover:border-border-strong hover:text-text-primary hover:-translate-y-px active:scale-95 disabled:opacity-35 motion-safe:hover:scale-105"
                      title="Leave mass-select mode"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated">
              <TableSkeleton rows={8} columns={6} />
            </div>
          ) : filtered.length > 0 ? (
            <div className="rounded-[16px] border border-border-subtle bg-surface-elevated">
              <div className="overflow-x-auto overflow-hidden">
                <table className="w-full min-w-[940px] text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-surface-secondary text-[12px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                    <tr>
                      <th
                        scope="col"
                        className={`border-border-subtle align-middle transition-[width,padding] duration-300 ease-out ${
                          massSelectMode ? "w-12 px-4 py-3 opacity-100" : "w-0 max-w-0 border-0 p-0 opacity-0"
                        } overflow-hidden`}
                      >
                        <span
                          className={`block min-h-5 transition-all duration-300 ease-out ${massSelectMode ? "opacity-100" : "opacity-0"}`}
                          aria-hidden
                        />
                      </th>
                      <th scope="col" className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button type="button" className={thBtn} onClick={() => toggleSortColumn("keyword")}>
                            Keyword{sortMark("keyword")}
                          </button>
                          <Tooltip placement="below" content={`The search query. Live data from DataForSEO in ${projectData?.success && projectData.data ? regionName(projectData.data.target_region) : "your region"}.`}>
                            <InfoIcon />
                          </Tooltip>
                        </div>
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" className={thBtn} onClick={() => toggleSortColumn("volume")}>
                            Volume{sortMark("volume")}
                          </button>
                          <Tooltip placement="below" content="Average monthly searches over the last 12 months.">
                            <InfoIcon />
                          </Tooltip>
                        </div>
                      </th>
                      <th scope="col" className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button type="button" className={thBtn} onClick={() => toggleSortColumn("kd")}>
                            KD{sortMark("kd")}
                          </button>
                          <Tooltip placement="below" content="Keyword Difficulty (0-100). Higher means harder to rank in top 10.">
                            <InfoIcon />
                          </Tooltip>
                        </div>
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" className={thBtn} onClick={() => toggleSortColumn("cpc")}>
                            CPC{sortMark("cpc")}
                          </button>
                          <Tooltip placement="below" content="Cost Per Click (USD). Indicates commercial value of the keyword.">
                            <InfoIcon />
                          </Tooltip>
                        </div>
                      </th>
                      <th scope="col" className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button type="button" className={thBtn} onClick={() => toggleSortColumn("intent")}>
                            Intent{sortMark("intent")}
                          </button>
                          <Tooltip placement="below" content="Search intent (informational, commercial, transactional, navigational).">
                            <InfoIcon />
                          </Tooltip>
                        </div>
                      </th>
                      <th scope="col" className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button type="button" className={thBtn} onClick={() => toggleSortColumn("ai_score")}>
                            AI{sortMark("ai_score")}
                          </button>
                          <Tooltip placement="below" content="AI relevance score (1-10) matching the keyword to your business brief.">
                            <InfoIcon />
                          </Tooltip>
                        </div>
                      </th>
                      <th scope="col" className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button type="button" className={thBtn} onClick={() => toggleSortColumn("analysis_score")}>
                            Analysis{sortMark("analysis_score")}
                          </button>
                          <Tooltip placement="below" content="Overall opportunity score based on volume, KD, CPC, and AI relevance.">
                            <InfoIcon />
                          </Tooltip>
                        </div>
                      </th>
                      <th scope="col" className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button type="button" className={thBtn} onClick={() => toggleSortColumn("status")}>
                            Status{sortMark("status")}
                          </button>
                        </div>
                      </th>
                      <th scope="col" className="w-14 px-2 py-3 text-center">
                        <span className="sr-only">Actions menu</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/60">
                    {filtered.map(kw => (
                      <tr
                        key={kw.id}
                        onClick={e => {
                          const t = e.target as HTMLElement;
                          if (
                            t.closest("button, input, [role='menu'], [role='menuitem'], a") ||
                            t.closest("[data-row-no-mass]")
                          )
                            return;
                          if (massSelectMode && !bulkApproving) {
                            toggleRowSelected(kw.id);
                            return;
                          }
                          if (!massSelectMode && !busyRowId) setModalKeywordId(kw.id);
                        }}
                        className={`group transition-colors duration-200 ease-out hover:bg-surface-hover/90 ${
                          kw.status === "approved" ? "bg-brand-action/[0.07]" : ""
                        } ${selectedIds.has(kw.id) ? "bg-surface-secondary/95 ring-1 ring-inset ring-brand-action/25" : ""} ${
                          massSelectMode && !bulkApproving ? "cursor-pointer" : ""
                        } ${!massSelectMode && !busyRowId ? "cursor-pointer" : ""}`}
                      >
                        <td
                          data-row-no-mass
                          className={`border-border-subtle align-middle transition-[width,padding] duration-300 ease-out ${
                            massSelectMode ? "w-12 px-4 py-3 opacity-100" : "w-0 max-w-0 border-0 p-0 opacity-0"
                          } overflow-hidden`}
                        >
                          <span
                            className={`flex justify-center transition-all duration-300 ease-out ${massSelectMode ? "opacity-100 scale-100 translate-x-0" : "pointer-events-none -translate-x-2 scale-90 opacity-0"}`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedIds.has(kw.id)}
                              onChange={() => toggleRowSelected(kw.id)}
                              onClick={e => e.stopPropagation()}
                              disabled={bulkApproving || !massSelectMode}
                              aria-label={`Select keyword ${kw.keyword}`}
                              className="rounded border-border-subtle text-brand-action focus:ring-brand-action"
                            />
                          </span>
                        </td>
                        <td className="px-4 py-3 align-middle max-w-[260px]">
                          <p className="truncate text-[14px] font-medium text-text-primary">{kw.keyword}</p>
                          {(typeof kw.relevance_score === "number" && kw.relevance_score > 0) ||
                          (typeof kw.business_fit_score === "number" && kw.business_fit_score > 0) ? (
                            <p
                              className="mt-1 text-[11px] text-text-tertiary"
                              title="Relevance = syntactic match to niche/phrase anchors. Fit = tiered business-fit (100 = niche × buying-intent match)."
                            >
                              Rel {typeof kw.relevance_score === "number" ? kw.relevance_score : "—"} ·
                              Fit {typeof kw.business_fit_score === "number" ? kw.business_fit_score : "—"}
                            </p>
                          ) : null}
                          {kw.secondary_keywords?.length ? (
                            <p className="mt-1 max-w-xs truncate text-[11px] text-text-tertiary">
                              {kw.secondary_keywords.slice(0, 3).join(" · ")}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right align-middle text-[14px] font-mono text-text-secondary tabular-nums">
                          {kw.volume ? kw.volume.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-center align-middle">
                          {kw.kd > 0 ? (
                            <div className="flex items-center justify-center gap-2">
                              <div className="h-1.5 w-10 overflow-hidden rounded-full bg-surface-tertiary">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    kw.kd < 30 ? "bg-[#10b981]" : kw.kd < 60 ? "bg-[#f59e0b]" : "bg-brand-coral"
                                  }`}
                                  style={{ width: `${kw.kd}%` }}
                                />
                              </div>
                              <span className={`text-[12px] font-bold ${KD_COLOR(kw.kd)}`}>{KD_LABEL(kw.kd)}</span>
                            </div>
                          ) : (
                            <span className="text-[13px] text-text-tertiary">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right align-middle text-[13px] font-mono text-text-tertiary tabular-nums">
                          {kw.cpc > 0 ? `$${kw.cpc.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-center align-middle">
                          {kw.intent ? (
                            <span
                              className={`rounded-[4px] border px-2 py-0.5 text-[11px] font-bold capitalize ${
                                kw.intent === "commercial" || kw.intent === "transactional"
                                  ? "border-brand-action/20 bg-brand-action/10 text-brand-action"
                                  : kw.intent === "informational"
                                    ? "border-[#10b981]/20 bg-[#10b981]/10 text-[#10b981]"
                                    : "border-border-subtle bg-surface-secondary text-text-tertiary"
                              }`}
                            >
                              {kw.intent}
                            </span>
                          ) : (
                            <span className="text-[13px] text-text-tertiary">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center align-middle">
                          <span className="inline-block rounded-[4px] border border-border-subtle bg-surface-secondary px-2 py-0.5 text-[12px] font-mono text-text-secondary tabular-nums">
                            {kw.ai_score}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center align-middle">
                          {typeof kw.keyword_analysis_score === "number" && kw.keyword_analysis_score > 0 ? (
                            <span className="inline-block rounded-[4px] border border-brand-action/20 bg-brand-action/10 px-2 py-0.5 text-[12px] font-mono text-brand-action tabular-nums">
                              {Math.round(kw.keyword_analysis_score)}
                            </span>
                          ) : (
                            <span className="text-[13px] text-text-tertiary">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center align-middle">
                          <span
                            className={`inline-block rounded-[4px] border px-2.5 py-1 text-[11px] font-bold capitalize ${STATUS_COLORS[kw.status]}`}
                          >
                            {kw.status}
                          </span>
                        </td>
                        <td className="px-2 py-3 align-middle" onClick={e => e.stopPropagation()}>
                          <KeywordRowMenu
                            status={kw.status}
                            phrase={kw.keyword}
                            busy={busyRowId === kw.id}
                            onExplore={() => setModalKeywordId(kw.id)}
                            onApproveCalendar={() => handleStatusUpdate(kw.id, "approved", kw.keyword)}
                            onReject={() => handleStatusUpdate(kw.id, "rejected")}
                            onResetPending={() => handleStatusUpdate(kw.id, "pending", kw.keyword)}
                            onRemove={() => handleKeywordRemove(kw.id, kw.keyword)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(() => {
                const pendingShown = keywords.filter(k => k.status === "pending").length;
                if (pendingTotal <= pendingShown) return null;
                return (
                  <div className="flex flex-col items-center gap-3 border-t border-border-subtle px-6 py-6 bg-surface-secondary/50">
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="rounded-[30px] border border-border-subtle bg-surface-elevated px-6 py-2.5 text-[14px] font-medium text-text-secondary transition-colors hover:text-text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loadingMore
                        ? "Loading more keywords…"
                        : `Load more (${pendingTotal - pendingShown} remaining)`}
                    </button>
                    <span className="text-[12px] text-text-tertiary">
                      Showing top {pendingShown} of {pendingTotal} Ahrefs-scored keywords
                    </span>
                  </div>
                );
              })()}
            </div>
          ) : (
            !discovering && (
              <div className="rounded-[22px] border border-dashed border-border-strong bg-surface-secondary py-24 text-center">
                <div className="mb-6 flex justify-center">
                  <div className="w-16 h-16 rounded-[16px] bg-surface-tertiary flex items-center justify-center text-text-primary border border-border-subtle">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                  </div>
                </div>
                <h3 className="mb-3 text-[24px] font-normal tracking-[-0.24px] text-text-primary font-display">No keywords yet</h3>
                <p className="mb-8 text-[16px] text-text-tertiary max-w-md mx-auto">
                  Run discovery to pull real search data for your niche from your business brief.
                </p>
                <button
                  type="button"
                  onClick={handleDiscover}
                  className="rounded-[32px] bg-brand-primary px-8 py-3 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90"
                >
                  Discover keywords
                </button>
              </div>
            )
          )}
      </section>

      {toast ? (
        <div
          role="status"
          className="fixed bottom-8 right-6 z-90 max-w-sm rounded-[12px] border border-brand-action/30 bg-surface-elevated px-4 py-3 text-[14px] text-text-primary shadow-lg ring-1 ring-brand-action/20 transition-opacity duration-150"
        >
          {toast}
        </div>
      ) : null}

      <KeywordDetailModal
        open={!!modalKeyword}
        projectId={projectId}
        keyword={modalKeyword}
        onClose={() => setModalKeywordId(null)}
        onStatusChange={(id, status) =>
          handleStatusUpdate(id, status, modalKeyword?.keyword ?? undefined)
        }
      />
    </div>
  );
}
