"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, keywordsListQueryOptions, useProject } from "@/lib/query";
import { Keyword, KeywordStatus, TARGET_REGIONS } from "@/lib/types";
import {
  useAppDispatch,
  useAppSelector,
  selectKeywordPrefs,
  selectKeywordStatuses,
  selectAiSuggestedKeywordIds,
} from "@/lib/redux/hooks";
import {
  bulkKeywordStatusChanged,
  keywordStatusChanged,
  mergeKeywordStatuses,
  rememberKeywordDiscoverySourceTab,
  rememberKeywordFilter,
  rememberKeywordSort,
  removeKeywordStatus,
} from "@/lib/redux/keyword-workspace-slice";
import { keywordsApi } from "@/frontend/api/keywords";
import type { CompetitorKeywordsForSiteRow } from "@/lib/dataforseo";
import type { DataForSEOTraceEntry } from "@/lib/dataforseo";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { KeywordDetailModal } from "@/components/KeywordDetailModal";
import { KeywordActionDropdown } from "@/components/keywords/KeywordActionDropdown";
import { PillTabFilterBar } from "@/components/filters/PillTabFilterBar";
import { Tooltip, InfoIcon } from "@/components/Tooltip";
import { PageTitle } from "@/components/common";
import { toast } from "react-hot-toast";
import { scoreKeywordsWithAI, type AiEvalData } from "@/app/actions/keyword-actions";
type KeywordsResponse = Awaited<ReturnType<typeof keywordsApi.list>>;

function regionName(code: string): string {
  return TARGET_REGIONS.find(r => r.code === code.toLowerCase())?.name ?? code.toUpperCase();
}

function fmtIsoDateLocal(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Shown after approve when the server auto-schedules on the calendar. */
function calendarApproveSuffix(cal: {
  scheduledDate?: string;
  calendarSkipped?: boolean;
  calendarError?: string;
}): string {
  if (cal.calendarError) return ` — ${cal.calendarError}`;
  if (cal.calendarSkipped && cal.scheduledDate) return ` — already on calendar (${fmtIsoDateLocal(cal.scheduledDate)})`;
  if (cal.scheduledDate) return ` — scheduled ${fmtIsoDateLocal(cal.scheduledDate)}`;
  return "";
}

function MonthlySearchesChart({ data }: { data: { month: string; volume: number }[] }) {
  if (!data || data.length === 0) return <span className="block p-3 text-text-tertiary">No monthly data</span>;
  
  const sorted = [...data].sort((a, b) => a.month.localeCompare(b.month));
  const max = Math.max(...sorted.map(d => d.volume));

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="text-[11px] font-semibold text-text-primary text-left">Monthly Search Trend</div>
      <div className="flex items-end gap-[2px] h-12 w-40">
        {sorted.map((d, i) => {
          const heightPct = max > 0 ? (d.volume / max) * 100 : 0;
          const [year, month] = d.month.split('-');
          const date = new Date(parseInt(year), parseInt(month) - 1);
          const formattedMonth = date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
          
          return (
            <div
              key={i}
              className="flex-1 bg-brand-action/60 hover:bg-brand-action rounded-t-[2px] transition-colors relative group/bar"
              style={{ height: `${Math.max(4, heightPct)}%` }}
            >
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/bar:block z-50 bg-surface-elevated border border-border-subtle text-[10px] px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap text-text-primary">
                {formattedMonth}: {d.volume.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const KD_COLOR = (kd: number) =>
  kd < 30 ? "text-[#10b981]" : kd < 60 ? "text-[#f59e0b]" : "text-brand-coral";

function AI_SCORE_CATEGORY(score: number): { icon: string; cls: string; label: string } {
  if (score >= 75) return { icon: "★", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", label: "High opportunity" };
  if (score >= 55) return { icon: "◆", cls: "border-brand-action/30 bg-brand-action/10 text-brand-action", label: "Good fit" };
  if (score >= 35) return { icon: "●", cls: "border-amber-500/30 bg-amber-500/10 text-amber-400", label: "Moderate" };
  return { icon: "▼", cls: "border-border-subtle bg-surface-tertiary text-text-tertiary", label: "Low priority" };
}

function AiScoreTooltip({ data, score }: { data: AiEvalData; score: number }) {
  const cat = AI_SCORE_CATEGORY(score);
  const dims: [keyof AiEvalData["analysis"], string][] = [
    ["businessRelevance", "Business relevance"],
    ["intentQuality", "Intent quality"],
    ["trafficPotential", "Traffic potential"],
    ["keywordDifficulty", "KD opportunity"],
    ["serpWeakness", "SERP weakness"],
    ["contentDepth", "Content depth"],
    ["trendGrowth", "Trend growth"],
    ["conversionPotential", "Conversion potential"],
  ];
  return (
    <div className="w-80 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cat.cls}`}>
          {cat.label}
        </span>
        <span className={`text-2xl font-black tabular-nums ${cat.cls.split(' ').find(c => c.startsWith('text-')) ?? ''}`}>{score}</span>
      </div>
      {/* Dimension bars */}
      <div className="space-y-1.5">
        {dims.map(([key, label]) => {
          const val = data.analysis[key] ?? 0;
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-[10px] text-text-tertiary truncate">{label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-surface-tertiary overflow-hidden">
                <div className="h-full rounded-full bg-brand-action/60" style={{ width: `${val * 10}%` }} />
              </div>
              <span className="w-4 text-right text-[10px] font-mono text-text-tertiary">{val}</span>
            </div>
          );
        })}
      </div>
      {/* Reasoning */}
      <div className="border-t border-border-subtle pt-2 space-y-2">
        <p className="text-[11px] text-text-secondary leading-relaxed">{data.reasoning.summary}</p>
        {data.reasoning.strengths?.length > 0 && (
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 mb-1">Strengths</p>
            <ul className="space-y-0.5">
              {data.reasoning.strengths.slice(0, 2).map((s, i) => (
                <li key={i} className="flex items-start gap-1 text-[10px] text-text-secondary">
                  <span className="text-emerald-400 shrink-0 mt-0.5">+</span>{s}
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.reasoning.weaknesses?.length > 0 && (
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-rose-400 mb-1">Weaknesses</p>
            <ul className="space-y-0.5">
              {data.reasoning.weaknesses.slice(0, 2).map((w, i) => (
                <li key={i} className="flex items-start gap-1 text-[10px] text-text-secondary">
                  <span className="text-rose-400 shrink-0 mt-0.5">−</span>{w}
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.reasoning.rankingOpportunity && (
          <p className="text-[10px] text-text-tertiary italic leading-relaxed">
            <span className="not-italic font-semibold text-text-secondary">Ranking: </span>
            {data.reasoning.rankingOpportunity}
          </p>
        )}
        {data.reasoning.contentOpportunity && (
          <p className="text-[10px] text-text-tertiary italic leading-relaxed">
            <span className="not-italic font-semibold text-text-secondary">Content: </span>
            {data.reasoning.contentOpportunity}
          </p>
        )}
      </div>
    </div>
  );
}

type FilterTab = "all" | "ai" | KeywordStatus;

type SourceTab = "industry" | "domain";

function domainSelectId(phrase: string): string {
  return `domsel:${encodeURIComponent(phrase)}`;
}

function parseDomainSelectId(id: string): string | null {
  if (!id.startsWith("domsel:")) return null;
  try {
    return decodeURIComponent(id.slice(7));
  } catch {
    return null;
  }
}

function normKeywordPhrase(s: string): string {
  return (s ?? "").trim().toLowerCase();
}

type TableSortColumn =
  | "keyword"
  | "volume"
  | "kd"
  | "cpc"
  | "intent"
  | "analysis_score"
  | "ai_eval_score"
  | "status";

type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<KeywordStatus, number> = { pending: 0, approved: 1, rejected: 2 };

/** Default first-click direction when activating a column. */
function defaultDirForSortColumn(col: TableSortColumn): SortDir {
  return col === "keyword" || col === "intent" ? "asc" : "desc";
}

function compareDomainRows(
  a: CompetitorKeywordsForSiteRow,
  b: CompetitorKeywordsForSiteRow,
  col: TableSortColumn,
  dir: SortDir
): number {
  const m = dir === "asc" ? 1 : -1;
  switch (col) {
    case "keyword":
      return m * a.keyword.localeCompare(b.keyword);
    case "volume":
      return m * (a.volume - b.volume);
    case "kd":
      return m * (a.kd - b.kd);
    case "cpc":
      return m * (a.cpc - b.cpc);
    case "intent":
      return m * (a.intent || "").localeCompare(b.intent || "");
    case "analysis_score":
      return m * ((a.keyword_analysis_score ?? 0) - (b.keyword_analysis_score ?? 0));
    case "status": {
      const sa = STATUS_ORDER[(a.matched_status ?? "pending") as KeywordStatus];
      const sb = STATUS_ORDER[(b.matched_status ?? "pending") as KeywordStatus];
      return m * (sa - sb);
    }
    default:
      return 0;
  }
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
    case "analysis_score":
      return m * ((a.keyword_analysis_score ?? 0) - (b.keyword_analysis_score ?? 0));
    case "ai_eval_score":
      return m * ((a.ai_eval_score ?? 0) - (b.ai_eval_score ?? 0));
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
  const aiSuggestedKeywordIds = useAppSelector(state => selectAiSuggestedKeywordIds(state, projectId));

  const KEYWORDS_KEY = qk.keywords(projectId);

  const [discovering, setDiscovering] = useState(false);
  /** True while POST refresh hits DataForSEO (not the same as React Query `isFetching` for GET). */
  const [domainRefreshing, setDomainRefreshing] = useState(false);
  const filter = keywordPrefs.filter as FilterTab;
  const tableSort = keywordPrefs.tableSort as { column: TableSortColumn; dir: SortDir };
  const [error, setError] = useState("");

  // Industry vs domain DataForSEO paths — persisted so Re-discover matches the visible table.
  const sourceTab: SourceTab = keywordPrefs.discoverySourceTab === "domain" ? "domain" : "industry";
  const [dataSourceMenuOpen, setDataSourceMenuOpen] = useState(false);
  const dataSourceRef = useRef<HTMLDivElement>(null);

  const aiSuggestedIds = useMemo(() => new Set(aiSuggestedKeywordIds), [aiSuggestedKeywordIds]);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [massSelectMode, setMassSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [aiScoring, setAiScoring] = useState(false);
  /** Domain-tab optimistic status by normalized phrase (survives refetch/cache key mismatches). */
  const [domainPhraseStatusOverlay, setDomainPhraseStatusOverlay] = useState<Record<string, KeywordStatus>>({});

  // Keyword drilldown modal. Stored as id (not a `Keyword` object) so the
  // modal always reflects the latest row state — including approve/reject
  // updates that happen via `handleStatusUpdate`.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [modalKeywordId, setModalKeywordId] = useState<string | null>(null);

  const { data: keywordsData, isLoading: loading } = useQuery<KeywordsResponse>({
    ...keywordsListQueryOptions(projectId),
    enabled: !!projectId,
  });
  const serverKeywords: Keyword[] =
    keywordsData && "success" in keywordsData && keywordsData.success ? keywordsData.data : [];
  const keywords: Keyword[] = useMemo(
    () =>
      serverKeywords.map(keyword =>
        keywordStatuses[keyword.id] !== undefined
          ? { ...keyword, status: keywordStatuses[keyword.id]! }
          : keyword
      ),
    [serverKeywords, keywordStatuses]
  );
  useEffect(() => {
    if (serverKeywords.length === 0) return;
    dispatch(
      mergeKeywordStatuses({
        projectId,
        statuses: Object.fromEntries(serverKeywords.map(kw => [kw.id, kw.status])),
      })
    );
  }, [dispatch, projectId, serverKeywords]);

  const { data: projectData } = useProject(projectId);

  const project =
    projectData && "success" in projectData && projectData.success && projectData.data
      ? projectData.data
      : null;

  const {
    data: domainRes,
    isFetching: domainFetching,
    isError: domainIsError,
  } = useQuery({
    queryKey: qk.domainKeywords(projectId),
    queryFn: () => keywordsApi.domainKeywords(projectId),
    enabled: !!projectId,
    staleTime: Infinity,
  });
  const domainKeywords: CompetitorKeywordsForSiteRow[] =
    domainRes && "success" in domainRes && domainRes.success ? domainRes.data : [];
  const domainError =
    domainRes && !domainRes.success
      ? domainRes.error ?? "Failed to fetch domain keywords"
      : domainIsError
        ? "Failed to fetch domain keywords"
        : "";

  const effectiveDomainStatus = useCallback(
    (row: CompetitorKeywordsForSiteRow): KeywordStatus => {
      const nk = normKeywordPhrase(row.keyword);
      const overlay = domainPhraseStatusOverlay[nk];
      if (overlay !== undefined) return overlay;

      if (row.matched_keyword_id) {
        const st = keywordStatuses[row.matched_keyword_id];
        if (st !== undefined) return st;
      }

      const industry = keywords.find(k => normKeywordPhrase(k.keyword) === nk);
      if (industry) return industry.status;

      return (row.matched_status ?? "pending") as KeywordStatus;
    },
    [domainPhraseStatusOverlay, keywordStatuses, keywords]
  );

  useEffect(() => {
    if (domainFetching || domainRefreshing || domainKeywords.length === 0) return;
    setDomainPhraseStatusOverlay(prev => {
      const next = { ...prev };
      let changed = false;
      for (const phrase of Object.keys(prev)) {
        const row = domainKeywords.find(d => normKeywordPhrase(d.keyword) === phrase);
        if (row?.matched_status === prev[phrase]) {
          delete next[phrase];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [domainFetching, domainRefreshing, domainKeywords]);

  const industryCounts = useMemo(() => {
    let all = 0;
    let ai = 0;
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const k of keywords) {
      all += 1;
      if (aiSuggestedIds.has(k.id)) ai += 1;
      if (k.status === "pending") pending += 1;
      if (k.status === "approved") approved += 1;
      if (k.status === "rejected") rejected += 1;
    }
    return { all, ai, pending, approved, rejected };
  }, [keywords, aiSuggestedIds]);

  const domainCounts = useMemo(() => {
    let all = 0;
    let ai = 0;
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const d of domainKeywords) {
      all += 1;
      if (d.matched_keyword_id && aiSuggestedIds.has(d.matched_keyword_id)) ai += 1;
      const s = effectiveDomainStatus(d);
      if (s === "pending") pending += 1;
      if (s === "approved") approved += 1;
      if (s === "rejected") rejected += 1;
    }
    return { all, ai, pending, approved, rejected };
  }, [domainKeywords, aiSuggestedIds, effectiveDomainStatus]);

  const displayCounts = sourceTab === "industry" ? industryCounts : domainCounts;

  const sortedDomainKeywords = useMemo(() => {
    const list = [...domainKeywords];
    if (tableSort.column === "status") {
      const m = tableSort.dir === "asc" ? 1 : -1;
      list.sort(
        (a, b) => m * (STATUS_ORDER[effectiveDomainStatus(a)] - STATUS_ORDER[effectiveDomainStatus(b)])
      );
    } else {
      list.sort((a, b) => compareDomainRows(a, b, tableSort.column, tableSort.dir));
    }
    return list;
  }, [domainKeywords, tableSort.column, tableSort.dir, effectiveDomainStatus]);

  const filteredDomainKeywords = useMemo(() => {
    return sortedDomainKeywords.filter(row => {
      if (filter === "all") return true;
      if (filter === "ai") {
        const id = row.matched_keyword_id;
        return Boolean(id && aiSuggestedIds.has(id));
      }
      const st = effectiveDomainStatus(row);
      if (filter === "pending") return st === "pending";
      if (filter === "approved") return st === "approved";
      if (filter === "rejected") return st === "rejected";
      return true;
    });
  }, [sortedDomainKeywords, filter, aiSuggestedIds, effectiveDomainStatus]);

  useEffect(() => {
    if (sourceTab !== "domain") return;
    if (tableSort.column === "intent" || tableSort.column === "ai_eval_score") {
      dispatch(
        rememberKeywordSort({
          projectId,
          tableSort: { column: "volume", dir: "desc" },
        })
      );
    }
  }, [sourceTab, tableSort.column, dispatch, projectId]);

  useEffect(() => {
    if (!dataSourceMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (dataSourceRef.current && !dataSourceRef.current.contains(e.target as Node)) {
        setDataSourceMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [dataSourceMenuOpen]);

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

  const handleDiscover = async () => {
    setDiscovering(true);
    setError("");
    const res = await keywordsApi.discover(projectId);
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
      // Reload industry list, brief context, stats, and project row (niche/region seeds come from DB).
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.brief(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.project(projectId) }),
      ]);
    } else setError(res.error ?? "Discovery failed");
    setDiscovering(false);
  };

  const handleDomainRediscover = async () => {
    setDomainRefreshing(true);
    setError("");
    try {
      const res = await keywordsApi.domainKeywordsRefresh(projectId);
      if (res.discoveryTrace?.length) {
        console.groupCollapsed(
          `[Keywords] DataForSEO — domain keywords refresh (${res.discoveryTrace.length} calls)`
        );
        for (const t of res.discoveryTrace) {
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
        queryClient.setQueryData(qk.domainKeywords(projectId), res);
        void queryClient.invalidateQueries({ queryKey: qk.project(projectId) });
      } else setError(res.error ?? "Domain keyword refresh failed");
    } finally {
      setDomainRefreshing(false);
    }
  };

  /** Re-discover: industry tab → keyword_ideas pipeline + DB; domain tab → keywords_for_site + cache. */
  const handleRediscover = () => {
    if (sourceTab === "domain") void handleDomainRediscover();
    else void handleDiscover();
  };

  const handleStatusUpdate = async (kwId: string, status: KeywordStatus, phrase?: string): Promise<boolean> => {
    const keyword = keywords.find(k => k.id === kwId);
    const previousStatus = keyword?.status;
    const label = phrase ?? keyword?.keyword ?? "Keyword";
    setError("");
    const previousData = queryClient.getQueryData<KeywordsResponse>(KEYWORDS_KEY);

    if (keyword) {
      patchKeywords(list => list.map(k => (k.id === kwId ? { ...k, status } : k)));
      dispatch(
        keywordStatusChanged({
          projectId,
          keywordId: kwId,
          previousStatus,
          nextStatus: status,
        })
      );
    }

    setBusyRowId(kwId);
    const res = await keywordsApi.updateStatus(kwId, projectId, status);
    setBusyRowId(null);

    if (!res.success) {
      if (previousData) queryClient.setQueryData(KEYWORDS_KEY, previousData);
      if (keyword) {
        dispatch(
          keywordStatusChanged({
            projectId,
            keywordId: kwId,
            previousStatus: status,
            nextStatus: previousStatus ?? keyword.status,
          })
        );
      }
      setError(res.error ?? "Could not update keyword status");
      return false;
    }

    if (status === "pending") {
      toast(`"${label}" moved back to pending`, { icon: 'ℹ️' });
    } else if (status === "approved") {
      toast.success(`"${label}" approved${calendarApproveSuffix(res)}`);
      void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
    } else if (status === "rejected") {
      toast(`"${label}" rejected`, { icon: 'ℹ️' });
    }

    if (!keyword) {
      dispatch(
        keywordStatusChanged({
          projectId,
          keywordId: kwId,
          previousStatus: undefined,
          nextStatus: status,
        })
      );
    }
    return true;
  };

  const handleDomainStatusUpdate = async (row: CompetitorKeywordsForSiteRow, next: KeywordStatus) => {
    const label = row.keyword;
    const nk = normKeywordPhrase(label);
    const previousStatus = effectiveDomainStatus(row);
    const busyKey = row.matched_keyword_id ?? `dom:${row.keyword}`;

    const revertPhraseOverlay = () => {
      setDomainPhraseStatusOverlay(p => {
        if (!(nk in p)) return p;
        const q = { ...p };
        delete q[nk];
        return q;
      });
    };

    setDomainPhraseStatusOverlay(p => ({ ...p, [nk]: next }));

    if (row.matched_keyword_id) {
      const ok = await handleStatusUpdate(row.matched_keyword_id, next, label);
      if (!ok) revertPhraseOverlay();
      return;
    }
    setError("");
    setBusyRowId(busyKey);
    const res = await keywordsApi.upsertDomainKeyword(
      projectId,
      {
        keyword: row.keyword,
        volume: row.volume,
        kd: row.kd,
        cpc: row.cpc,
        intent: row.intent,
        estimated_monthly_traffic: row.estimated_monthly_traffic,
      },
      next
    );
    setBusyRowId(null);
    if (!res.success) {
      revertPhraseOverlay();
      setError(res.error ?? "Could not save keyword");
      return;
    }
    if ("id" in res && res.id) {
      // `mergeKeywordStatuses` spreads server map first then overlay, so an existing
      // `pending` entry would overwrite the payload — use a direct assignment instead.
      dispatch(
        keywordStatusChanged({
          projectId,
          keywordId: res.id,
          previousStatus,
          nextStatus: next,
        })
      );
      queryClient.setQueryData(qk.domainKeywords(projectId), (prev: unknown) => {
        if (!prev || typeof prev !== "object" || !("success" in prev)) return prev;
        const p = prev as { success: boolean; data?: CompetitorKeywordsForSiteRow[] };
        if (!p.success || !p.data) return prev;
        return {
          ...p,
          data: p.data.map(d =>
            normKeywordPhrase(d.keyword) === nk
              ? {
                  ...d,
                  matched_keyword_id: res.id,
                  matched_status: next,
                  keyword_analysis_score: d.keyword_analysis_score ?? null,
                }
              : d
          ),
        };
      });
    }
    if (next === "approved") {
      toast.success(`"${label}" approved${calendarApproveSuffix(res)}`);
      void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
    } else if (next === "pending") {
      toast(`"${label}" moved back to pending`, { icon: 'ℹ️' });
    } else if (next === "rejected") {
      toast(`"${label}" rejected`, { icon: 'ℹ️' });
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) }),
      queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) }),
    ]);
  };

  const handleKeywordRemove = async (kwId: string, phrase: string) => {
    if (!confirm(`Remove “${phrase}” from this project? This cannot be undone.`)) return;
    setBusyRowId(kwId);
    setError("");
    const snapshot = queryClient.getQueryData<KeywordsResponse>(KEYWORDS_KEY);
    const previousStatus = keywords.find(k => k.id === kwId)?.status;
    patchKeywords(list => list.filter(k => k.id !== kwId));
    const res = await keywordsApi.deleteKeyword(projectId, kwId);
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
      if (filter === "ai") return aiSuggestedIds.has(k.id);
      return k.status === filter;
    });
    return [...list].sort((a, b) => compareKeywords(a, b, tableSort.column, tableSort.dir));
  }, [keywords, filter, tableSort, aiSuggestedIds]);

  const toggleSortColumn = (columnId: string) => {
    const col = columnId as TableSortColumn;
    dispatch(
      rememberKeywordSort({
        projectId,
        tableSort:
          tableSort.column === col
            ? { column: col, dir: tableSort.dir === "asc" ? "desc" : "asc" }
            : { column: col, dir: defaultDirForSortColumn(col) },
      })
    );
  };

  const exitMassSelect = () => {
    setMassSelectMode(false);
    setSelectedIds(new Set());
  };

  useEffect(() => {
    setMassSelectMode(false);
    setSelectedIds(new Set());
  }, [projectId]);

  const toggleRowSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkApproveToCalendar = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const domPhrases = ids.map(parseDomainSelectId).filter((p): p is string => p !== null);
    const uuidIds = ids.filter(id => !id.startsWith("domsel:"));
    if (!domPhrases.length && !uuidIds.length) return;

    setError("");
    const previousData = queryClient.getQueryData<KeywordsResponse>(KEYWORDS_KEY);
    const previousStatuses = Object.fromEntries(
      uuidIds.map(id => [id, keywords.find(keyword => keyword.id === id)?.status ?? "pending"])
    ) as Record<string, KeywordStatus>;
    let bulkRes: Awaited<ReturnType<typeof keywordsApi.bulkStatus>> | undefined;
    setBulkApproving(true);
    try {
      for (const phrase of domPhrases) {
        const row = domainKeywords.find(d => d.keyword === phrase);
        if (!row) continue;
        const res = await keywordsApi.upsertDomainKeyword(
          projectId,
          {
            keyword: row.keyword,
            volume: row.volume,
            kd: row.kd,
            cpc: row.cpc,
            intent: row.intent,
            estimated_monthly_traffic: row.estimated_monthly_traffic,
          },
          "approved"
        );
        if (res.success && "id" in res && res.id) {
          dispatch(
            keywordStatusChanged({
              projectId,
              keywordId: res.id,
              previousStatus: effectiveDomainStatus(row),
              nextStatus: "approved",
            })
          );
        }
      }

      if (uuidIds.length > 0) {
        patchKeywords(list =>
          list.map(k => (uuidIds.includes(k.id) ? { ...k, status: "approved" as const } : k))
        );
        dispatch(bulkKeywordStatusChanged({ projectId, keywordIds: uuidIds, nextStatus: "approved" }));
        bulkRes = await keywordsApi.bulkStatus(projectId, uuidIds, "approved");
        if (!bulkRes.success) {
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
          setError(bulkRes.error ?? "Could not approve keywords");
          return;
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.domainKeywords(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) }),
      ]);

      toast.success(
        domPhrases.length && !uuidIds.length
          ? `${domPhrases.length} domain keyword(s) approved — placed on the next open calendar days`
          : uuidIds.length
            ? `${ids.length} keyword(s) approved${
                bulkRes?.calendarError
                  ? ` — ${bulkRes.calendarError}`
                  : bulkRes?.calendarScheduled != null
                    ? ` — ${bulkRes.calendarScheduled} scheduled${
                        (bulkRes.calendarSkipped ?? 0) > 0
                          ? `, ${bulkRes.calendarSkipped} already on calendar`
                          : ""
                      }${bulkRes.firstScheduledDate ? ` (first slot ${fmtIsoDateLocal(bulkRes.firstScheduledDate)})` : ""}`
                    : ""
              }`
            : `${ids.length} keyword(s) approved`
      );
      exitMassSelect();
    } finally {
      setBulkApproving(false);
    }
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

  const FILTER_TAB_ITEMS: Array<{ id: FilterTab; label: string; count: number }> = [
    { id: "all", label: "All", count: displayCounts.all },
    { id: "ai", label: "AI picks", count: displayCounts.ai },
    { id: "pending", label: "Pending", count: displayCounts.pending },
    { id: "approved", label: "Approved", count: displayCounts.approved },
    { id: "rejected", label: "Rejected", count: displayCounts.rejected },
  ];

  

  const domainColumns = useMemo<ColumnDef<CompetitorKeywordsForSiteRow>[]>(() => [
    {
      id: "keyword",
      header: "Keyword",
      sortable: true,
      tooltip: "Search query from Google Ads keywords for your domain.",
      cell: (kw: any) => (
        <div className="flex items-center gap-2 max-w-[260px]">
          <p className="truncate text-[14px] font-medium text-text-primary">{kw.keyword}</p>
          {kw.matched_keyword_id && aiSuggestedIds.has(kw.matched_keyword_id) ? (
            <span className="shrink-0 rounded-full border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8b5cf6]">
              AI pick
            </span>
          ) : null}
        </div>
      )
    },
    {
      id: "volume",
      header: "Volume",
      align: "right",
      sortable: true,
      tooltip: "Average monthly searches over the last 12 months.",
      cell: (kw: any) => (
        <span className="text-[14px] font-mono text-text-secondary tabular-nums">
          {kw.volume ? kw.volume.toLocaleString() : "—"}
        </span>
      )
    },
    {
      id: "kd",
      header: "KD",
      align: "center",
      sortable: true,
      tooltip: "Difficulty hint from Google Ads competition (0–100).",
      cell: (kw: any) => kw.kd > 0 ? (
        <div className="flex items-center justify-center gap-2">
          <div className="h-1.5 w-10 overflow-hidden rounded-full bg-surface-tertiary">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                kw.kd < 30 ? "bg-[#10b981]" : kw.kd < 60 ? "bg-[#f59e0b]" : "bg-brand-coral"
              }`}
              style={{ width: `${kw.kd}%` }}
            />
          </div>
          <span className={`text-[12px] font-bold tabular-nums ${KD_COLOR(kw.kd)}`}>{kw.kd}</span>
        </div>
      ) : (
        <span className="text-[13px] text-text-tertiary">—</span>
      )
    },
    {
      id: "cpc",
      header: "CPC",
      align: "right",
      sortable: true,
      tooltip: "Cost Per Click (USD) from Google Ads.",
      cell: (kw: any) => (
        <span className="text-[13px] font-mono text-text-tertiary tabular-nums">
          {kw.cpc > 0 ? `$${kw.cpc.toFixed(2)}` : "—"}
        </span>
      )
    },
    {
      id: "analysis_score",
      header: "Analysis",
      align: "center",
      sortable: true,
      tooltip: "When this phrase matches a saved industry keyword, you see that row’s analysis score. Otherwise we show an estimate from volume, difficulty, and intent so you can still sort and compare.",
      cell: (kw: any) => typeof kw.keyword_analysis_score === "number" && kw.keyword_analysis_score > 0 ? (
        <span
          className="inline-block rounded-[4px] border border-brand-action/20 bg-brand-action/10 px-2 py-0.5 text-[12px] font-mono text-brand-action tabular-nums"
          title={
            kw.analysis_score_is_industry
              ? "Analysis score from your matched industry keyword row"
              : "Estimated score from volume, difficulty, and intent"
          }
        >
          {Math.round(kw.keyword_analysis_score)}
        </span>
      ) : (
        <span className="text-[13px] text-text-tertiary">—</span>
      )
    },
    {
      id: "status",
      header: "Action",
      align: "center",
      sortable: true,
      cell: (kw: any) => {
        const effectiveStatus = effectiveDomainStatus(kw);
        const busyKey = kw.matched_keyword_id ?? `dom:${kw.keyword}`;
        return (
          <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
            <KeywordActionDropdown
              status={effectiveStatus}
              busy={busyRowId === busyKey}
              onChange={next => void handleDomainStatusUpdate(kw, next)}
            />
          </div>
        );
      }
    }
  ], [aiSuggestedIds, busyRowId, handleDomainStatusUpdate, effectiveDomainStatus]);

  const industryColumns = useMemo<ColumnDef<Keyword>[]>(() => [
    {
      id: "keyword",
      header: "Keyword",
      sortable: true,
      tooltip: `The search query. Live data from DataForSEO in ${projectData?.success && projectData.data ? regionName(projectData.data.target_region) : "your region"}.`,
      cell: (kw: any) => {
        const isAiPick = aiSuggestedIds.has(kw.id);
        return (
          <div className="max-w-[260px]">
            <div className="flex items-center gap-2">
              <p className="truncate text-[14px] font-medium text-text-primary">{kw.keyword}</p>
              {isAiPick ? (
                <span className="shrink-0 rounded-full border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8b5cf6]">
                  AI pick
                </span>
              ) : null}
            </div>
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
          </div>
        );
      }
    },
    {
      id: "volume",
      header: "Volume",
      align: "right",
      sortable: true,
      tooltip: "Average monthly searches over the last 12 months. Hover for trend chart.",
      cell: (kw: any) => (
        <Tooltip placement="above" content={<MonthlySearchesChart data={kw.monthly_searches} />}>
          <span className="text-[14px] font-mono text-text-secondary tabular-nums border-b border-dashed border-text-tertiary/40 cursor-help pb-0.5">
            {kw.volume ? kw.volume.toLocaleString() : "—"}
          </span>
        </Tooltip>
      )
    },
    {
      id: "kd",
      header: "KD",
      align: "center",
      sortable: true,
      tooltip: "Keyword Difficulty (0-100). Higher means harder to rank in top 10.",
      cell: (kw: any) => kw.kd > 0 ? (
        <div className="flex items-center justify-center gap-2">
          <div className="h-1.5 w-10 overflow-hidden rounded-full bg-surface-tertiary">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                kw.kd < 30 ? "bg-[#10b981]" : kw.kd < 60 ? "bg-[#f59e0b]" : "bg-brand-coral"
              }`}
              style={{ width: `${kw.kd}%` }}
            />
          </div>
          <span className={`text-[12px] font-bold tabular-nums ${KD_COLOR(kw.kd)}`}>{kw.kd}</span>
        </div>
      ) : (
        <span className="text-[13px] text-text-tertiary">—</span>
      )
    },
    {
      id: "cpc",
      header: "CPC",
      align: "right",
      sortable: true,
      tooltip: "Cost Per Click (USD). Indicates commercial value of the keyword.",
      cell: (kw: any) => (
        <span className="text-[13px] font-mono text-text-tertiary tabular-nums">
          {kw.cpc > 0 ? `$${kw.cpc.toFixed(2)}` : "—"}
        </span>
      )
    },
    {
      id: "intent",
      header: "Intent",
      align: "center",
      sortable: true,
      tooltip:
        "SERP-style search intent from keyword data: informational, commercial, transactional, or navigational.",
      cell: (kw: any) => kw.intent ? (
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
      )
    },
    {
      id: "analysis_score",
      header: "Analysis",
      align: "center",
      sortable: true,
      tooltip: "Composite opportunity score from volume, KD, CPC, and relevance signals.",
      cell: (kw: any) => typeof kw.keyword_analysis_score === "number" && kw.keyword_analysis_score > 0 ? (
        <span className="inline-block rounded-[4px] border border-brand-action/20 bg-brand-action/10 px-2 py-0.5 text-[12px] font-mono text-brand-action tabular-nums">
          {Math.round(kw.keyword_analysis_score)}
        </span>
      ) : (
        <span className="text-[13px] text-text-tertiary">—</span>
      )
    },
    {
      id: "ai_eval_score",
      header: "AI Score",
      align: "center",
      sortable: true,
      tooltip: "Strategic score from Gemini AI — evaluates business relevance, rankability, content depth, and conversion potential.",
      cell: (kw: any) => {
        const score = kw.ai_eval_score as number | null | undefined;
        const data = kw.ai_eval_data as AiEvalData | null | undefined;
        if (!score || !data) {
          return <span className="text-[13px] text-text-tertiary">—</span>;
        }
        const cat = AI_SCORE_CATEGORY(score);
        return (
          <Tooltip placement="above" content={<AiScoreTooltip data={data} score={score} />}>
            <span className={`inline-flex items-center gap-1 rounded-[6px] border px-2 py-0.5 text-[12px] font-bold tabular-nums cursor-help ${cat.cls}`}>
              <span>{cat.icon}</span>
              {score}
            </span>
          </Tooltip>
        );
      }
    },
    {
      id: "status",
      header: "Action",
      align: "center",
      sortable: true,
      cell: (kw: any) => (
        <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
          <KeywordActionDropdown
            status={kw.status}
            busy={busyRowId === kw.id}
            onChange={next => void handleStatusUpdate(kw.id, next)}
          />
        </div>
      )
    }
  ], [aiSuggestedIds, busyRowId, handleStatusUpdate, projectData]);

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
            <PageTitle>{project?.name ?? "…"}</PageTitle>
            {project?.company && project.company !== project.name ? (
              <p className="mt-3 text-[16px] text-text-tertiary">{project.company}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
          <button
              type="button"
              onClick={() => void handleRediscover()}
              disabled={discovering || domainRefreshing}
              className="inline-flex items-center gap-2 rounded-[30px] border border-border-subtle bg-surface-elevated px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-50"
            >
              {!mounted ? (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  Discover keywords
                </>
              ) : sourceTab === "domain" ? (
                domainRefreshing ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-text-tertiary/40 border-t-text-secondary" />
                    Fetching…
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                    {domainKeywords.length > 0 ? "Re-discover" : "Fetch domain keywords"}
                  </>
                )
              ) : discovering ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-text-tertiary/40 border-t-text-secondary" />
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
            {/* AI Score button — only shown for industry tab with keywords */}
            {sourceTab === "industry" && keywords.length > 0 && (
              <button
                onClick={async () => {
                  setAiScoring(true);
                  const res = await scoreKeywordsWithAI(projectId);
                  setAiScoring(false);
                  if (res.success) {
                    toast.success(`AI scored ${res.scored} keyword${res.scored !== 1 ? "s" : ""}${res.skipped ? ` (${res.skipped} already scored)` : ""}`);
                    void queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
                  } else {
                    toast.error(res.error ?? "AI scoring failed");
                  }
                }}
                disabled={aiScoring || discovering}
                className="inline-flex items-center gap-2 rounded-[32px] border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-[13px] font-semibold text-violet-300 transition-all hover:bg-violet-500/20 hover:border-violet-500/50 disabled:opacity-50"
              >
                {aiScoring ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-400/40 border-t-violet-300" />
                    Scoring…
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.847-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                    </svg>
                    AI Score
                  </>
                )}
              </button>
            )}
            <ProjectNavLink
              href={`/projects/${projectId}/calendar`}
              className="inline-flex items-center gap-2 rounded-[32px] bg-brand-primary px-4 py-2 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90"
            >
              Calendar
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </ProjectNavLink>
           
          </div>
        </div>
      </div>

      {/* ── KEYWORD LIST ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
    

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {keywords.length > 0 || domainKeywords.length > 0 ? (
              <PillTabFilterBar<FilterTab>
                items={FILTER_TAB_ITEMS}
                activeId={filter}
                onChange={tab => dispatch(rememberKeywordFilter({ projectId, filter: tab }))}
              />
            ) : (
              <p className="text-[13px] text-text-tertiary">
                Run Discover for industry keywords. Switch data source to Domain to see Google Ads keywords for your site.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {((sourceTab === "industry" && keywords.length > 0) ||
              (sourceTab === "domain" && domainKeywords.length > 0)) ? (
              !massSelectMode ? (
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
              )
            ) : null}
            <div className="relative" ref={dataSourceRef}>
              <button
                type="button"
                onClick={() => setDataSourceMenuOpen(o => !o)}
                className="inline-flex h-8 items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,colors] duration-200 hover:border-border-strong hover:text-text-primary"
                aria-expanded={dataSourceMenuOpen}
                aria-haspopup="listbox"
              >
                {sourceTab === "industry" ? "Industry data" : "Domain data"}
                <svg className="h-3.5 w-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {dataSourceMenuOpen ? (
                <div
                  role="listbox"
                  className="absolute right-0 top-full z-50 mt-1 min-w-48 rounded-[8px] border border-border-subtle bg-surface-elevated py-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={sourceTab === "industry"}
                    className="block w-full px-3 py-2 text-left text-[13px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                    onClick={() => {
                      dispatch(rememberKeywordDiscoverySourceTab({ projectId, tab: "industry" }));
                      setDataSourceMenuOpen(false);
                    }}
                  >
                    Data via industry
                  </button>
                  <button
                    type="button"
                    role="option"
                    aria-selected={sourceTab === "domain"}
                    className="block w-full px-3 py-2 text-left text-[13px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                    onClick={() => {
                      dispatch(rememberKeywordDiscoverySourceTab({ projectId, tab: "domain" }));
                      setDataSourceMenuOpen(false);
                    }}
                  >
                    Data via domain
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── DATA VIA DOMAIN ─────────────────────────────────────────── */}
        {sourceTab === "domain" && (
          <div className="space-y-4">
            {domainError && (
              <div className="flex items-center gap-3 rounded-[16px] border border-brand-coral/20 bg-brand-coral/10 p-5 text-[14px] text-brand-coral">
                {domainError}
              </div>
            )}
            {error && (
              <div className="flex items-center gap-3 rounded-[16px] border border-brand-coral/20 bg-brand-coral/10 p-5 text-[14px] text-brand-coral">
                {error}
              </div>
            )}
        

            {domainFetching || domainRefreshing ? (
              <DataTable<CompetitorKeywordsForSiteRow>
                data={[]}
                columns={domainColumns}
                keyExtractor={kw => domainSelectId(kw.keyword)}
                isLoading={true}
                loadingRows={10}
                loadingColumns={6}
                minWidth="920px"
              />
            ) : domainKeywords.length > 0 ? (
              filteredDomainKeywords.length === 0 ? (
                <div className="rounded-[16px] border border-border-subtle bg-surface-elevated px-5 py-6 text-center">
                  <p className="text-[14px] font-medium text-text-secondary">No keywords match this filter.</p>
                  <p className="mt-1 text-[12px] text-text-tertiary">Switch to another tab to see domain rows.</p>
                </div>
              ) : (
                <DataTable<CompetitorKeywordsForSiteRow>
                  data={filteredDomainKeywords}
                  columns={domainColumns}
                  keyExtractor={kw => domainSelectId(kw.keyword)}
                  sortColumn={tableSort.column}
                  sortDirection={tableSort.dir}
                  onSortToggle={toggleSortColumn}
                  massSelectMode={massSelectMode}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleRowSelected}
                  selectionDisabled={bulkApproving}
                  isSelectable={kw => true}
                  rowClassName={(kw) => {
                    const effectiveStatus = effectiveDomainStatus(kw);
                    const domainRowSelectId = domainSelectId(kw.keyword);
                    return `${effectiveStatus === "approved" ? "bg-brand-action/[0.07]" : ""} ${
                      selectedIds.has(domainRowSelectId)
                        ? "bg-surface-secondary/95 ring-1 ring-inset ring-brand-action/25"
                        : ""
                    }`;
                  }}
                  minWidth="920px"
                  footer={
                    <div className="border-t border-border-subtle bg-surface-secondary px-5 py-3">
                      <span className="text-[12px] text-text-tertiary">
                        Showing {filteredDomainKeywords.length} of {sortedDomainKeywords.length} for {project?.domain ?? "your domain"}
                        {filteredDomainKeywords.length < sortedDomainKeywords.length ? " (filter active)" : ""} · use column headers to sort
                      </span>
                    </div>
                  }
                />
              )
            ) : (
              !(domainFetching || domainRefreshing) && (
                <div className="rounded-[22px] border border-dashed border-border-strong bg-surface-secondary py-24 text-center">
                  <div className="mb-6 flex justify-center">
                    <div className="w-16 h-16 rounded-[16px] bg-surface-tertiary flex items-center justify-center text-text-primary border border-border-subtle">
                      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                      </svg>
                    </div>
                  </div>
                  <h3 className="mb-3 text-[24px] font-normal tracking-[-0.24px] text-text-primary font-display">No domain keywords found</h3>
                  <p className="mb-8 text-[16px] text-text-tertiary max-w-md mx-auto">
                    No Google Ads keyword data was returned for your domain. Try refreshing or check that your domain is correct.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleDomainRediscover()}
                    className="rounded-[32px] bg-brand-primary px-8 py-3 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90"
                  >
                    Fetch domain keywords
                  </button>
                </div>
              )
            )}
          </div>
        )}

        {/* ── DATA VIA INDUSTRY ───────────────────────────────────────── */}
        {sourceTab === "industry" && (
          <div className="space-y-4">
            {keywords.length === 0 ? (
              <p className="text-[14px] text-text-tertiary">Run Discover to load keywords.</p>
            ) : null}

          {error && (
            <div className="flex items-center gap-3 rounded-[16px] border border-brand-coral/20 bg-brand-coral/10 p-5 text-[14px] text-brand-coral">
              {error}
            </div>
          )}

          {loading || discovering ? (
            <DataTable<Keyword>
              data={[]}
              columns={industryColumns}
              keyExtractor={kw => kw.id}
              isLoading={true}
              loadingRows={8}
              loadingColumns={9}
              minWidth="1180px"
            />
          ) : filtered.length > 0 ? (
            <DataTable<Keyword>
              data={filtered}
              columns={industryColumns}
              keyExtractor={kw => kw.id}
              sortColumn={tableSort.column}
              sortDirection={tableSort.dir}
              onSortToggle={toggleSortColumn}
              massSelectMode={massSelectMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleRowSelected}
              selectionDisabled={bulkApproving}
              isSelectable={kw => true}
              onRowClick={kw => {
                if (!massSelectMode && !busyRowId) setModalKeywordId(kw.id);
              }}
              rowClassName={(kw) => {
                const isAiPick = aiSuggestedIds.has(kw.id);
                return `group transition-colors duration-200 ease-out hover:bg-surface-hover/90 ${
                  kw.status === "approved" ? "bg-brand-action/[0.07]" : ""
                } ${isAiPick ? "bg-[#8b5cf6]/[0.07] ring-1 ring-inset ring-[#8b5cf6]/20" : ""} ${
                  selectedIds.has(kw.id) ? "bg-surface-secondary/95 ring-1 ring-inset ring-brand-action/25" : ""
                }`;
              }}
              minWidth="1180px"
            />
          ) : keywords.length > 0 ? (
            <div className="rounded-[16px] border border-border-subtle bg-surface-elevated px-5 py-6 text-center">
              <p className="text-[14px] font-medium text-text-secondary">No keywords match this filter.</p>
              <p className="mt-1 text-[12px] text-text-tertiary">Switch to another tab to see keywords.</p>
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
          </div>
        )}
      
      </section>

      <KeywordDetailModal
        open={!!modalKeyword}
        projectId={projectId}
        keyword={modalKeyword}
        onClose={() => setModalKeywordId(null)}
        onStatusChange={async (id, status) => {
          await handleStatusUpdate(id, status, modalKeyword?.keyword ?? undefined);
        }}
      />
    </div>
  );
}
