"use client";

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, keywordsListQueryOptions, useProject, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
import { Keyword, KeywordStatus, TARGET_REGIONS, KeywordSourceType, ContentType } from "@/lib/types";
import {
  useAppDispatch,
  useAppSelector,
  selectKeywordPrefs,
  selectKeywordStatuses,
} from "@/lib/redux/hooks";
import {
  bulkKeywordStatusChanged,
  keywordStatusChanged,
  mergeKeywordStatuses,
  rememberKeywordDiscoverySourceTab,
  rememberKeywordFilter,
  rememberKeywordSort,
  type KeywordFilterTab,
} from "@/lib/redux/keyword-workspace-slice";
import { keywordsApi } from "@/frontend/api/keywords";
import { calendarApi } from "@/frontend/api/calendar";
import { useGeneratedContentMap, generatedContentKey } from "@/hooks/useGeneratedContentMap";
import type { CompetitorKeywordsForSiteRow } from "@/lib/dataforseo";
import type { DataForSEOTraceEntry } from "@/lib/dataforseo";
import { ColumnDef, SharedKeywordTable } from "../_components/SharedKeywordTable";
import { KeywordTableSkeleton } from "@/components/Skeleton";
import { KeywordDetailModal } from "@/components/KeywordDetailModal";
import { KeywordActionCell } from "@/components/keywords/KeywordActionCell";
import { PillTabFilterBar } from "@/components/filters/PillTabFilterBar";
import { Tooltip } from "@/components/Tooltip";
import { toast } from "react-hot-toast";
import { scoreKeywordsWithAI, type AiEvalData } from "@/app/actions/keyword-actions";
import { useKeywordTableState } from "../_hooks/useKeywordTableState";

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

type FilterTab = "all" | "unscheduled" | "scheduled" | "generated";

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

export default function OrganicKeywordsTab({ projectId }: { projectId: string }) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const router = useRouter();
  const keywordPrefs = useAppSelector(state => selectKeywordPrefs(state, projectId));
  const keywordStatuses = useAppSelector(state => selectKeywordStatuses(state, projectId));

  const { generatedMap } = useGeneratedContentMap(projectId);

  const { data: calendarRes } = useQuery({
    queryKey: qk.calendarWithBlogs(projectId),
    queryFn: () => calendarApi.withBlogs(projectId),
    enabled: !!projectId,
    ...DEFAULT_QUERY_OPTIONS,
  });
  const calendarEntries = useMemo(() => calendarRes?.success ? calendarRes.data : [], [calendarRes]);

  const calendarMap = useMemo(() => {
    const map = new Map<string, typeof calendarEntries[number]>();
    if (!calendarEntries) return map;
    for (const entry of calendarEntries) {
      if (entry.keyword_id) {
        map.set(entry.keyword_id, entry);
      }
      if (entry.focus_keyword) {
        map.set(entry.focus_keyword.toLowerCase(), entry);
      }
    }
    return map;
  }, [calendarEntries]);

  const articleTypeToContentType = (articleType: string): ContentType => {
    const typeMap: Record<string, ContentType> = {
      "Blog article": "blog",
      "Ebook": "ebook",
      "Whitepaper": "whitepaper",
      "LinkedIn post": "linkedin",
    };
    return typeMap[articleType] ?? "blog";
  };

  const resolveContentType = useCallback((keywordText: string, keywordId?: string, aiEvalData?: { recommended_content_type?: string } | null, rowContentTypes?: Record<string, ContentType>) => {
    const entry = (keywordId ? calendarMap.get(keywordId) : null) || calendarMap.get(keywordText.toLowerCase());
    if (entry) {
      return articleTypeToContentType(entry.article_type);
    }
    const recommended = aiEvalData?.recommended_content_type as ContentType | undefined;
    const supportedTypes = ["blog", "ebook", "whitepaper", "linkedin"];
    if (recommended && supportedTypes.includes(recommended)) {
      return (rowContentTypes && rowContentTypes[keywordText.toLowerCase()]) ?? recommended;
    }
    return (rowContentTypes && rowContentTypes[keywordText.toLowerCase()]) ?? "blog";
  }, [calendarMap]);

  const KEYWORDS_KEY = qk.keywords(projectId);

  const [discovering, setDiscovering] = useState(false);
  const [domainRefreshing, setDomainRefreshing] = useState(false);
  const filter = keywordPrefs.filter as FilterTab;
  const tableSort = keywordPrefs.tableSort as { column: TableSortColumn; dir: SortDir };
  const [error, setError] = useState("");

  const sourceTab: SourceTab = keywordPrefs.discoverySourceTab === "domain" ? "domain" : "industry";
  const [dataSourceMenuOpen, setDataSourceMenuOpen] = useState(false);
  const dataSourceRef = useRef<HTMLDivElement>(null);
  const keywordTableScrollRef = useRef<HTMLDivElement>(null);

  const [bulkScheduling, setBulkScheduling] = useState(false);
  const [aiScoring, setAiScoring] = useState(false);
  const [domainPhraseStatusOverlay, setDomainPhraseStatusOverlay] = useState<Record<string, KeywordStatus>>({});
  const [loadingMoreAhrefs, setLoadingMoreAhrefs] = useState(false);

  const handleLoadMoreFromAhrefs = async () => {
    setLoadingMoreAhrefs(true);
    const toastId = toast.loading("Loading more keywords from Ahrefs...");
    try {
      const res = await keywordsApi.loadMoreFromAhrefs(projectId);
      if (res.success) {
        toast.success(`Loaded ${res.count ?? 0} new keywords from Ahrefs`, { id: toastId });
        await queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
      } else {
        toast.error(res.error ?? "Failed to load more keywords from Ahrefs", { id: toastId });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg, { id: toastId });
    } finally {
      setLoadingMoreAhrefs(false);
    }
  };

  const [modalKeywordId, setModalKeywordId] = useState<string | null>(null);

  const { data: keywordsData, isLoading: loading } = useQuery<KeywordsResponse>({
    ...keywordsListQueryOptions(projectId),
    enabled: !!projectId,
  });
  const serverKeywords: Keyword[] = useMemo(() =>
    keywordsData && "success" in keywordsData && keywordsData.success ? keywordsData.data : [],
    [keywordsData]
  );
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

  const projectDomain =
    projectData && "success" in projectData && projectData.success && projectData.data
      ? projectData.data.domain
      : "";

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
  const domainKeywords: CompetitorKeywordsForSiteRow[] = useMemo(() =>
    domainRes && "success" in domainRes && domainRes.success ? domainRes.data : [],
    [domainRes]
  );
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

  // State calculations with Hook consolidation
  const tableState = useKeywordTableState<Keyword>({
    data: keywords,
    filter,
    keyExtractor: kw => kw.id,
    checkScheduled: kw => calendarMap.has(kw.id) || calendarMap.has(kw.keyword.toLowerCase()),
    checkGenerated: kw => !!(calendarMap.get(kw.id)?.blog || calendarMap.get(kw.keyword.toLowerCase())?.blog),
    getSearchString: kw => kw.keyword,
    externalSortColumn: tableSort.column,
    externalSortDirection: tableSort.dir,
    onSortToggle: toggleSortColumn,
    compareFn: (a, b, col, dir) => compareKeywords(a, b, col as TableSortColumn, dir),
  });

  const domainTableState = useKeywordTableState<CompetitorKeywordsForSiteRow>({
    data: domainKeywords,
    filter,
    keyExtractor: kw => domainSelectId(kw.keyword),
    checkScheduled: kw => calendarMap.has(kw.matched_keyword_id || "") || calendarMap.has(kw.keyword.toLowerCase()),
    checkGenerated: kw => !!(calendarMap.get(kw.matched_keyword_id || "")?.blog || calendarMap.get(kw.keyword.toLowerCase())?.blog),
    getSearchString: kw => kw.keyword,
    externalSortColumn: tableSort.column,
    externalSortDirection: tableSort.dir,
    onSortToggle: toggleSortColumn,
    compareFn: (a, b, col, dir) => {
      if (col === "status") {
        const m = dir === "asc" ? 1 : -1;
        const sa = calendarMap.has(a.matched_keyword_id || "") || calendarMap.has(a.keyword.toLowerCase()) ? 1 : 0;
        const sb = calendarMap.has(b.matched_keyword_id || "") || calendarMap.has(b.keyword.toLowerCase()) ? 1 : 0;
        return m * (sa - sb);
      }
      return compareDomainRows(a, b, col as TableSortColumn, dir);
    },
  });

  const activeState = sourceTab === "domain" ? domainTableState : tableState;
  const displayCounts = sourceTab === "industry" ? tableState.counts : domainTableState.counts;

  const handleBulkScheduleToCalendar = async () => {
    const ids = [...activeState.selectedIds];
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
    setBulkScheduling(true);
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
          setError(bulkRes.error ?? "Could not schedule keywords");
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
          ? `${domPhrases.length} domain keyword(s) scheduled — placed on the next open calendar days`
          : uuidIds.length
            ? `${ids.length} keyword(s) scheduled${
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
            : `${ids.length} keyword(s) scheduled`
      );
      activeState.exitMassSelect();
      router.push(`/projects/${projectId}/content-calendar`);
    } finally {
      setBulkScheduling(false);
    }
  };

  const renderContentTypeSelect = useCallback((
    keywordText: string,
    keywordId: string | undefined,
    aiEvalData: { recommended_content_type?: string } | null | undefined,
    stateObj: typeof activeState
  ) => {
    const entry = (keywordId ? calendarMap.get(keywordId) : null) || calendarMap.get(keywordText.toLowerCase());
    const isScheduled = !!entry;
    const isGenerated = !!entry?.blog;
    const currentType = resolveContentType(keywordText, keywordId, aiEvalData, stateObj.rowContentTypes);

    const recommended = aiEvalData?.recommended_content_type;
    const options: ContentType[] = ["blog", "ebook", "whitepaper", "linkedin"];
    const labels: Record<ContentType, string> = {
      blog: "Blog article",
      ebook: "Ebook",
      whitepaper: "Whitepaper",
      linkedin: "LinkedIn post",
    };

    return (
      <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
        <select
          value={currentType}
          onChange={(e) => stateObj.setRowContentType(keywordText, e.target.value as ContentType)}
          disabled={isScheduled || isGenerated}
          className="w-36 h-8 text-[12px] bg-surface-secondary border border-border-subtle hover:border-border-strong rounded-md transition-colors px-2 outline-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {options.map(type => (
            <option key={type} value={type}>
              {labels[type]}{type === recommended ? " ✨" : ""}
            </option>
          ))}
        </select>
      </div>
    );
  }, [calendarMap, resolveContentType]);

  const renderActionCell = useCallback((
    keywordText: string,
    keywordId: string | undefined,
    aiEvalData: { recommended_content_type?: string } | null | undefined,
    sourceType: KeywordSourceType | string,
    stateObj: typeof activeState
  ) => {
    const entry = (keywordId ? calendarMap.get(keywordId) : null) || calendarMap.get(keywordText.toLowerCase());
    const selectedType = resolveContentType(keywordText, keywordId, aiEvalData, stateObj.rowContentTypes);
    const historyKey = generatedContentKey(keywordText, selectedType);
    const historyEntry = generatedMap.get(historyKey);
    const resolvedBlogId = entry?.blog?.id ?? historyEntry?.id;
    return (
      <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
        <KeywordActionCell
          projectId={projectId}
          keyword={keywordText}
          keywordId={keywordId}
          sourceType={sourceType as KeywordSourceType}
          contentType={selectedType}
          scheduledDate={entry?.scheduled_date}
          blogId={resolvedBlogId}
        />
      </div>
    );
  }, [calendarMap, resolveContentType, generatedMap, projectId]);

  const FILTER_TAB_ITEMS: Array<{ id: FilterTab; label: string; count: number }> = [
    { id: "all", label: "All", count: displayCounts.all },
    { id: "unscheduled", label: "Unscheduled", count: displayCounts.unscheduled },
    { id: "scheduled", label: "Scheduled", count: displayCounts.scheduled },
    { id: "generated", label: "Generated", count: displayCounts.generated },
  ];

  const domainColumns = useMemo<ColumnDef<CompetitorKeywordsForSiteRow>[]>(() => [
    {
      id: "keyword",
      header: "Keyword",
      sortable: true,
      tooltip: "Search query from Google Ads keywords for your domain.",
      cell: (kw: CompetitorKeywordsForSiteRow) => (
        <div className="flex items-center gap-2 max-w-[260px] w-full min-w-0">
          <Tooltip placement="above" content={kw.keyword} className="w-full min-w-0 !justify-start">
            <p className="truncate text-[14px] font-medium text-text-primary cursor-help w-full min-w-0">{kw.keyword}</p>
          </Tooltip>
        </div>
      )
    },
    {
      id: "volume",
      header: "Volume",
      align: "right",
      sortable: true,
      tooltip: "Average monthly searches over the last 12 months.",
      cell: (kw: CompetitorKeywordsForSiteRow) => (
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
      cell: (kw: CompetitorKeywordsForSiteRow) => kw.kd > 0 ? (
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
      cell: (kw: CompetitorKeywordsForSiteRow) => (
        <span className="text-[13px] font-mono text-text-tertiary tabular-nums">
          {kw.cpc > 0 ? `$${kw.cpc.toFixed(2)}` : "—"}
        </span>
      )
    },
    {
      id: "content_type",
      header: "Content Type",
      align: "center",
      cell: (kw: CompetitorKeywordsForSiteRow) => {
        const industryKw = keywords.find(k => normKeywordPhrase(k.keyword) === normKeywordPhrase(kw.keyword));
        return renderContentTypeSelect(
          kw.keyword,
          kw.matched_keyword_id || undefined,
          industryKw?.ai_eval_data as { recommended_content_type?: string } | null,
          domainTableState
        );
      }
    },
    {
      id: "action",
      header: "Action",
      align: "center",
      sortable: false,
      cell: (kw: CompetitorKeywordsForSiteRow) => {
        const industryKw = keywords.find(k => normKeywordPhrase(k.keyword) === normKeywordPhrase(kw.keyword));
        return renderActionCell(
          kw.keyword,
          kw.matched_keyword_id || undefined,
          industryKw?.ai_eval_data as { recommended_content_type?: string } | null,
          "google_ads_domain",
          domainTableState
        );
      }
    }
  ].filter(c => c.id !== "analysis_score") as ColumnDef<CompetitorKeywordsForSiteRow>[], [keywords, renderActionCell, renderContentTypeSelect, domainTableState]);

  const industryColumns = useMemo<ColumnDef<Keyword>[]>(() => [
    {
      id: "keyword",
      header: "Keyword",
      sortable: true,
      tooltip: `The search query. Live data from DataForSEO in ${projectData?.success && projectData.data ? regionName(projectData.data.target_region) : "your region"}.`,
      cell: (kw: Keyword) => {
        return (
          <div className="max-w-[260px] w-full min-w-0">
            <div className="flex items-center gap-2 w-full min-w-0">
              <Tooltip placement="above" content={kw.keyword} className="w-full min-w-0 !justify-start">
                <p className="truncate text-[14px] font-medium text-text-primary cursor-help w-full min-w-0">{kw.keyword}</p>
              </Tooltip>
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
      cell: (kw: Keyword) => (
        <Tooltip placement="above" interactive content={<MonthlySearchesChart data={kw.monthly_searches} />}>
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
      cell: (kw: Keyword) => kw.kd > 0 ? (
        <span className={`text-[13px] font-semibold tabular-nums ${KD_COLOR(kw.kd)}`}>{kw.kd}</span>
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
      cell: (kw: Keyword) => (
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
      cell: (kw: Keyword) => {
        if (!kw.intent) return <span className="text-[13px] text-text-tertiary">—</span>;
        const norm = kw.intent.toLowerCase();
        const color =
          norm.includes("transactional") ? "text-[#10b981]" :
          norm.includes("commercial") ? "text-[#f59e0b]" :
          norm.includes("informational") ? "text-[#60a5fa]" :
          norm.includes("navigational") ? "text-[#a78bfa]" : "text-text-tertiary";
        return (
          <span className={`text-[12px] font-semibold capitalize ${color}`}>
            {kw.intent}
          </span>
        );
      }
    },
    {
      id: "ai_eval_score",
      header: "AI Score",
      align: "center",
      sortable: true,
      tooltip: "Strategic score from Gemini AI — evaluates business relevance, rankability, content depth, and conversion potential.",
      cell: (kw: Keyword) => {
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
      id: "content_type",
      header: "Content Type",
      align: "center",
      cell: (kw: Keyword) =>
        renderContentTypeSelect(
          kw.keyword,
          kw.id,
          kw.ai_eval_data as { recommended_content_type?: string } | null,
          tableState
        )
    },
    {
      id: "action",
      header: "Action",
      align: "center",
      sortable: false,
      cell: (kw: Keyword) =>
        renderActionCell(
          kw.keyword,
          kw.id,
          kw.ai_eval_data as { recommended_content_type?: string } | null,
          (kw.source_type as KeywordSourceType) || "industry",
          tableState
        )
    }
  ].filter(c => c.id !== "analysis_score") as ColumnDef<Keyword>[], [renderActionCell, renderContentTypeSelect, projectData, tableState]);

  // Handle source tab changes
  const handleSourceTabChange = (tab: SourceTab) => {
    dispatch(rememberKeywordDiscoverySourceTab({ projectId, tab }));
  };

  // Sticky Filter / Header bar controls
  const renderControls = () => (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-primary">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <PillTabFilterBar<FilterTab>
          items={FILTER_TAB_ITEMS}
          activeId={filter}
          onChange={tab => dispatch(rememberKeywordFilter({ projectId, filter: tab as unknown as KeywordFilterTab }))}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
        {sourceTab === "industry" && (keywords.length > 0 || loading || discovering) && (
          <button
            type="button"
            onClick={async () => {
              setAiScoring(true);
              const res = await scoreKeywordsWithAI(projectId, {
                keywordIds: tableState.selectedIds.size > 0 ? Array.from(tableState.selectedIds) : undefined
              });
              setAiScoring(false);
              if (res.success) {
                const failedPart = res.skipped ? ` (${res.skipped} failed to score)` : "";
                toast.success(`AI scored ${res.scored} keyword${res.scored !== 1 ? "s" : ""}${failedPart}`);
                void queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
              } else {
                toast.error(res.error ?? "AI scoring failed");
              }
            }}
            disabled={aiScoring || discovering || loading}
            className={`inline-flex h-8 shrink-0 cursor-pointer flex-row items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide shadow-sm transition-[transform,opacity,colors] duration-200 ease-out hover:-translate-y-px active:scale-95 disabled:pointer-events-none disabled:opacity-50 motion-safe:hover:scale-105 ${
              aiScoring
                ? "border-[#8b5cf6]/40 bg-[#8b5cf6]/20 text-[#8b5cf6] animate-pulse"
                : "border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-[#8b5cf6] hover:bg-[#8b5cf6]/20"
            }`}
          >
            {aiScoring ? (
              <>
                <div className="h-3 w-3 rounded-full border-2 border-[#8b5cf6]/30 border-t-[#8b5cf6] animate-spin" />
                <span>Scoring…</span>
              </>
            ) : (
              <>
                <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
                </svg>
                <span>AI Score</span>
              </>
            )}
          </button>
        )}
        {((sourceTab === "industry" && (keywords.length > 0 || loading || discovering)) ||
          (sourceTab === "domain" && (domainKeywords.length > 0 || domainFetching || domainRefreshing))) ? (
          !activeState.massSelectMode ? (
            <button
              type="button"
              aria-label="Mass select keywords"
              onClick={() => {
                activeState.setMassSelectMode(true);
                activeState.setSelectedIds(new Set());
              }}
              disabled={loading || discovering || domainFetching || domainRefreshing}
              className="inline-flex h-8 shrink-0 cursor-pointer flex-row items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,opacity,colors] duration-200 ease-out hover:border-border-strong hover:text-text-primary hover:-translate-y-px active:scale-95 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed motion-safe:hover:scale-105"
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
                onClick={() => void handleBulkScheduleToCalendar()}
                disabled={bulkScheduling || activeState.selectedIds.size === 0 || loading || discovering || domainFetching || domainRefreshing}
                className={`inline-flex h-8 w-38 shrink-0 cursor-pointer flex-col justify-center whitespace-nowrap rounded-full border border-brand-action/70 bg-brand-action px-2 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide text-brand-on-primary shadow-sm transition-[transform,box-shadow,opacity] duration-200 ease-out hover:-translate-y-px hover:shadow-md hover:shadow-brand-action/20 active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-35 motion-safe:hover:scale-105 ${
                  bulkScheduling ? "animate-pulse cursor-wait" : ""
                }`}
              >
                <span
                  className={`block max-w-full overflow-hidden truncate text-center ${bulkScheduling ? "text-[13px] leading-none" : "tabular-nums"}`}
                >
                  {bulkScheduling ? "…" : activeState.selectedIds.size > 0 ? `Schedule (${activeState.selectedIds.size})` : "Schedule"}
                </span>
              </button>
              <button
                type="button"
                onClick={activeState.exitMassSelect}
                disabled={bulkScheduling || loading || discovering || domainFetching || domainRefreshing}
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
            disabled={loading || discovering || domainFetching || domainRefreshing}
            className="inline-flex h-8 w-[210px] justify-between items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,colors] duration-200 hover:border-border-strong hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
            aria-expanded={dataSourceMenuOpen}
            aria-haspopup="listbox"
          >
            <span>{sourceTab === "industry" ? "Industry data" : "Domain data"}</span>
            <svg className="h-3.5 w-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {dataSourceMenuOpen ? (
            <div
              role="listbox"
              className="absolute right-0 top-full z-50 mt-1 min-w-[14rem] rounded-[8px] border border-border-subtle bg-surface-elevated py-1 shadow-lg"
            >
              <button
                type="button"
                role="option"
                aria-selected={sourceTab === "industry"}
                className="block w-full px-3 py-2 text-left text-[13px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                onClick={() => {
                  handleSourceTabChange("industry");
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
                  handleSourceTabChange("domain");
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
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 relative animate-slide-in-left">
      {sourceTab === "domain" && (
        <div className="flex-1 flex flex-col min-h-0">
          {domainError && (
            <div className="mb-4 flex items-center gap-3 rounded-[16px] border border-brand-coral/20 bg-brand-coral/10 p-5 text-[14px] text-brand-coral shrink-0">
              {domainError}
            </div>
          )}
          {error && (
            <div className="mb-4 flex items-center gap-3 rounded-[16px] border border-brand-coral/20 bg-brand-coral/10 p-5 text-[14px] text-brand-coral shrink-0">
              {error}
            </div>
          )}

          <Suspense fallback={<KeywordTableSkeleton />}>
            <SharedKeywordTable<CompetitorKeywordsForSiteRow>
              data={domainTableState.displayedData}
              columns={domainColumns}
              keyExtractor={kw => domainSelectId(kw.keyword)}
              scrollContainerRef={keywordTableScrollRef}
              sortColumn={domainTableState.activeSortColumn}
              sortDirection={domainTableState.activeSortDirection}
              onSortToggle={domainTableState.handleSortToggle}
              massSelectMode={domainTableState.massSelectMode}
              selectedIds={domainTableState.selectedIds}
              onToggleSelect={domainTableState.toggleRowSelected}
              selectionDisabled={bulkScheduling}
              isSelectable={() => true}
              isLoading={domainFetching || domainRefreshing}
              loadingRows={10}
              loadingColumns={6}
              controls={renderControls()}
              emptyState={
                domainKeywords.length > 0 ? (
                  <div className="rounded-[16px] border border-border-subtle bg-surface-elevated px-5 py-6 text-center">
                    <p className="text-[14px] font-medium text-text-secondary">No keywords match this filter.</p>
                    <p className="mt-1 text-[12px] text-text-tertiary">Switch to another tab to see domain rows.</p>
                  </div>
                ) : (
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
              }
              rowClassName={(kw) => {
                const isSch = calendarMap.has(kw.matched_keyword_id || "") || calendarMap.has(kw.keyword.toLowerCase());
                const domainRowSelectId = domainSelectId(kw.keyword);
                return `${isSch ? "bg-brand-action/[0.07]" : ""} ${
                  domainTableState.selectedIds.has(domainRowSelectId)
                    ? "bg-surface-secondary/95 ring-1 ring-inset ring-brand-action/25"
                    : ""
                }`;
              }}
              minWidth="920px"
              footer={(() => {
                const shown = domainTableState.displayedData.length;
                const total = domainTableState.processedData.length;
                const nextChunk = Math.min(20, Math.max(0, total - shown));
                return (
                  <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[13px] text-text-tertiary">
                      Showing{" "}
                      <span className="font-semibold tabular-nums text-text-primary">{shown}</span> of{" "}
                      <span className="font-semibold tabular-nums text-text-primary">{total}</span> keywords
                      {total < domainKeywords.length ? (
                        <span className="text-text-tertiary/80">
                          {" "}
                          ({domainKeywords.length} total for {projectDomain ?? "your domain"})
                        </span>
                      ) : null}
                    </p>
                    {shown < total && nextChunk > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          const anchor = shown > 0 ? domainSelectId(domainTableState.processedData[shown - 1]!.keyword) : null;
                          domainTableState.loadMore(anchor, keywordTableScrollRef);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-elevated px-4 py-2 text-[13px] font-medium text-text-primary transition-colors hover:border-border-strong hover:bg-surface-hover"
                      >
                        Load {nextChunk} more
                        <svg className="h-4 w-4 shrink-0 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                );
              })()}
            />
          </Suspense>
        </div>
      )}

      {sourceTab === "industry" && (
        <div className="flex-1 flex flex-col min-h-0">
          {error && (
            <div className="mb-4 flex items-center gap-3 rounded-[16px] border border-brand-coral/20 bg-brand-coral/10 p-5 text-[14px] text-brand-coral shrink-0">
              {error}
            </div>
          )}

          <Suspense fallback={<KeywordTableSkeleton />}>
            <SharedKeywordTable<Keyword>
              data={tableState.displayedData}
              columns={industryColumns}
              keyExtractor={kw => kw.id}
              scrollContainerRef={keywordTableScrollRef}
              sortColumn={tableState.activeSortColumn}
              sortDirection={tableState.activeSortDirection}
              onSortToggle={tableState.handleSortToggle}
              massSelectMode={tableState.massSelectMode}
              selectedIds={tableState.selectedIds}
              onToggleSelect={tableState.toggleRowSelected}
              selectionDisabled={bulkScheduling}
              isSelectable={() => true}
              isLoading={loading || discovering}
              loadingRows={8}
              loadingColumns={9}
              controls={renderControls()}
              emptyState={
                keywords.length > 0 ? (
                  <div className="rounded-[16px] border border-border-subtle bg-surface-elevated px-5 py-6 text-center">
                    <p className="text-[14px] font-medium text-text-secondary">No keywords match this filter.</p>
                    <p className="mt-1 text-[12px] text-text-tertiary">Switch to another tab to see keywords.</p>
                  </div>
                ) : (
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
              }
              onRowClick={kw => {
                if (!tableState.massSelectMode) setModalKeywordId(kw.id);
              }}
              rowClassName={(kw) => {
                const isSch = calendarMap.has(kw.id) || calendarMap.has(kw.keyword.toLowerCase());
                return `group transition-colors duration-200 ease-out hover:bg-surface-hover/90 ${
                  isSch ? "bg-brand-action/[0.07]" : ""
                } ${
                  tableState.selectedIds.has(kw.id) ? "bg-surface-secondary/95 ring-1 ring-inset ring-brand-action/25" : ""
                }`;
              }}
              minWidth="1180px"
              footer={(() => {
                const shown = tableState.displayedData.length;
                const total = tableState.processedData.length;
                const nextChunk = Math.min(20, Math.max(0, total - shown));
                const ahrefsState = keywordsData && "success" in keywordsData && keywordsData.success ? keywordsData.ahrefsDiscoveryState : null;
                const hasMoreAhrefs = ahrefsState
                  ? (ahrefsState.matching_has_more !== false || ahrefsState.related_has_more !== false)
                  : true;

                return (
                  <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[13px] text-text-tertiary">
                      Showing{" "}
                      <span className="font-semibold tabular-nums text-text-primary">{shown}</span> of{" "}
                      <span className="font-semibold tabular-nums text-text-primary">{total}</span> keywords
                    </p>
                    {shown < total && nextChunk > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          const anchor = shown > 0 ? tableState.processedData[shown - 1]!.id : null;
                          tableState.loadMore(anchor, keywordTableScrollRef);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-elevated px-4 py-2 text-[13px] font-medium text-text-primary transition-colors hover:border-border-strong hover:bg-surface-hover"
                      >
                        Load {nextChunk} more
                        <svg className="h-4 w-4 shrink-0 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                    ) : shown === total && hasMoreAhrefs ? (
                      <button
                        type="button"
                        disabled={loadingMoreAhrefs}
                        onClick={handleLoadMoreFromAhrefs}
                        className="inline-flex items-center gap-1.5 rounded-full border border-brand-action/30 bg-brand-action/10 px-4 py-2 text-[13px] font-semibold text-brand-action transition-all hover:bg-brand-action/20 disabled:opacity-50"
                      >
                        {loadingMoreAhrefs ? (
                          <>
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-action/40 border-t-brand-action" />
                            Loading from Ahrefs…
                          </>
                        ) : (
                          <>
                            Load more from Ahrefs
                            <svg className="h-4 w-4 shrink-0 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                          </>
                        )}
                      </button>
                    ) : null}
                  </div>
                );
              })()}
            />
          </Suspense>
        </div>
      )}

      <KeywordDetailModal
        open={!!modalKeyword}
        projectId={projectId}
        keyword={modalKeyword}
        onClose={() => setModalKeywordId(null)}
      />
    </div>
  );
}
