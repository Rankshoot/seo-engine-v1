"use client";

import { useEffect, useMemo, useRef, useState, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, DEFAULT_QUERY_OPTIONS, useProjects } from "@/lib/query";
import type { BenchmarkState } from "@/app/actions/competitor-actions";
import { competitorsApi } from "@/frontend/api/competitors";
import { calendarApi } from "@/frontend/api/calendar";
import { KeywordGap, ContentType } from "@/lib/types";
import { KeywordActionCell } from "@/components/keywords/KeywordActionCell";
import { useAppSelector, selectAiSuggestedGapKeywords, useAppDispatch, selectKeywordPrefs } from "@/lib/redux/hooks";
import { rememberCompetitorKeywordFilter, type KeywordFilterTab } from "@/lib/redux/keyword-workspace-slice";
import { EmptyState } from "@/components/common";
import { scoreCompetitorKeywordsWithAI } from "@/app/actions/keyword-actions";
import { Tooltip } from "@/components/Tooltip";
import { KeywordTableSkeleton } from "@/components/Skeleton";
import { ColumnDef, SharedKeywordTable } from "../_components/SharedKeywordTable";
import { toast } from "react-hot-toast";
import { useKeywordTableState } from "../_hooks/useKeywordTableState";

// ─── TYPES ──────────────────────────────────────────────────────────────────
type OpportunityWorkspaceTab = "all" | "unscheduled" | "scheduled" | "generated";
type GapSortColumn = "keyword" | "gap_type" | "volume" | "kd" | "competitor_weakness" | "ai_eval_score" | "action";
type SortDir = "asc" | "desc";
type GapAiEvalData = NonNullable<KeywordGap["ai_eval_data"]>;

// ─── CONSTANTS & HELPERS ────────────────────────────────────────────────────
function normalizeDomain(raw: string): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

function compactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`.replace(/\/$/, "");
    return path && path !== "/" ? path : parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const KD_COLOR = (kd: number) =>
  kd < 30 ? "text-status-success" : kd < 60 ? "text-status-warning" : "text-brand-coral";

function getAiGapScoreCategory(score: number): { icon: string; colorClass: string; label: string } {
  if (score >= 75) return { icon: "★", colorClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", label: "High opportunity" };
  if (score >= 55) return { icon: "◆", colorClass: "border-brand-action/30 bg-brand-action/10 text-brand-action", label: "Good fit" };
  if (score >= 35) return { icon: "●", colorClass: "border-amber-500/30 bg-amber-500/10 text-amber-400", label: "Moderate" };
  return { icon: "▼", colorClass: "border-border-subtle bg-surface-tertiary text-text-tertiary", label: "Low priority" };
}

function compareGaps(a: KeywordGap, b: KeywordGap, col: GapSortColumn, dir: SortDir): number {
  const m = dir === "asc" ? 1 : -1;
  switch (col) {
    case "keyword":
      return m * a.keyword.localeCompare(b.keyword);
    case "gap_type":
      return m * a.gap_type.localeCompare(b.gap_type);
    case "volume":
      return m * ((a.volume || 0) - (b.volume || 0));
    case "kd":
      return m * ((a.kd || 0) - (b.kd || 0));
    case "competitor_weakness":
      return m * ((a.competitor_weakness || 0) - (b.competitor_weakness || 0));
    case "ai_eval_score":
      return m * ((a.ai_eval_score ?? 0) - (b.ai_eval_score ?? 0));
    default:
      return 0;
  }
}

// ─── SUB-COMPONENTS ─────────────────────────────────────────────────────────
function GapAiScoreTooltip({ data, score }: { data: GapAiEvalData; score: number }) {
  const cat = getAiGapScoreCategory(score);
  const analysis = data.analysis as GapAiEvalData["analysis"] & {
    blogPotential?: number;
    competitiveTakeover?: number;
    audienceFit?: number;
  };
  const dims = [
    { label: "Biz Relevance", val: data.analysis.businessRelevance ?? 0 },
    { label: "Blog Potential", val: analysis.blogPotential ?? 0 },
    { label: "Competitive", val: analysis.competitiveTakeover ?? 0 },
    { label: "Intent Quality", val: analysis.intentQuality ?? data.analysis.intentQuality ?? 0 },
    { label: "Traffic Potential", val: data.analysis.trafficPotential ?? 0 },
    { label: "Trend/Growth", val: data.analysis.trendGrowth ?? 0 },
    { label: "Audience Fit", val: analysis.audienceFit ?? 0 },
    { label: "Content Depth", val: data.analysis.contentDepth ?? 0 },
  ].filter(d => d.val > 0);

  return (
    <div className="w-[340px] space-y-3 p-3.5 text-left">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-[6px] border px-2.5 py-1 text-[13px] font-bold tabular-nums ${cat.colorClass}`}>
            {cat.icon} {score}
          </span>
          <span className="text-[12px] font-semibold text-text-primary">{cat.label}</span>
        </div>
        <span className="rounded-full border border-border-subtle bg-surface-secondary px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-tertiary">
          {data.category?.replace(/_/g, " ")}
        </span>
      </div>

      {dims.length > 0 && (
        <div className="space-y-1.5">
          {dims.map(d => (
            <div key={d.label} className="flex items-center gap-2">
              <span className="w-[100px] shrink-0 text-[10px] text-text-tertiary">{d.label}</span>
              <div className="flex-1 h-1 rounded-full bg-surface-tertiary overflow-hidden">
                <div
                  className={`h-full rounded-full ${d.val >= 7 ? "bg-status-success" : d.val >= 4 ? "bg-status-warning" : "bg-brand-coral"}`}
                  style={{ width: `${d.val * 10}%` }}
                />
              </div>
              <span className="w-4 text-right text-[10px] font-mono text-text-tertiary">{d.val}</span>
            </div>
          ))}
        </div>
      )}

      {data.reasoning.summary && (
        <p className="text-[12px] leading-relaxed text-text-secondary">{data.reasoning.summary}</p>
      )}

      {data.reasoning.strengths?.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-status-success">Strengths</p>
          <ul className="space-y-0.5">
            {data.reasoning.strengths.slice(0, 2).map((s, i) => (
              <li key={i} className="text-[11px] text-text-secondary leading-snug">+ {s}</li>
            ))}
          </ul>
        </div>
      )}

      {data.reasoning.weaknesses?.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-brand-coral">Weaknesses</p>
          <ul className="space-y-0.5">
            {data.reasoning.weaknesses.slice(0, 2).map((w, i) => (
              <li key={i} className="text-[11px] text-text-secondary leading-snug">- {w}</li>
            ))}
          </ul>
        </div>
      )}

      {(data.reasoning.rankingOpportunity || data.reasoning.contentOpportunity) && (
        <div className="space-y-1.5 rounded-[8px] bg-surface-secondary border border-border-subtle/60 p-2.5">
          {data.reasoning.rankingOpportunity && (
            <p className="text-[11px] text-text-secondary">
              <span className="font-semibold text-text-primary">Ranking: </span>
              {data.reasoning.rankingOpportunity}
            </p>
          )}
          {data.reasoning.contentOpportunity && (
            <p className="text-[11px] text-text-secondary">
              <span className="font-semibold text-text-primary">Content: </span>
              {data.reasoning.contentOpportunity}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h.toString(36);
}

// ─── COLUMN VISIBILITY ───────────────────────────────────────────────────────
function useLocalColumnVisibility(storageKey: string, defaultHidden: string[] = []) {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set(defaultHidden);
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set(defaultHidden);
    } catch { return new Set(defaultHidden); }
  });
  const toggle = (id: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  return { hidden, toggle };
}

function ColumnToggleDropdown({
  allColumns,
  hidden,
  alwaysVisible,
  onToggle,
}: {
  allColumns: { id: string; label: string }[];
  hidden: Set<string>;
  alwaysVisible: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  const alwaysSet = new Set(alwaysVisible);
  const visibleCount = allColumns.filter(c => !hidden.has(c.id)).length;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,opacity,colors] duration-200 ease-out hover:-translate-y-px hover:border-border-strong hover:text-text-primary active:scale-95 motion-safe:hover:scale-105"
      >
        <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125Z" />
        </svg>
        <span>Columns</span>
        <span className="ml-0.5 tabular-nums opacity-60">({visibleCount})</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-52 rounded-xl border border-border-subtle bg-surface-elevated shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border-subtle/60">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">Toggle columns</p>
          </div>
          <div className="py-1">
            {allColumns.map(col => {
              const isAlways = alwaysSet.has(col.id);
              const isVisible = !hidden.has(col.id);
              return (
                <label
                  key={col.id}
                  className={`flex items-center gap-2.5 px-3 py-1.5 ${isAlways ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-surface-hover"}`}
                >
                  <input
                    type="checkbox"
                    checked={isVisible}
                    disabled={isAlways}
                    onChange={() => !isAlways && onToggle(col.id)}
                    className="h-3.5 w-3.5 rounded border-border-subtle accent-brand-action"
                  />
                  <span className="text-[12.5px] text-text-primary">{col.label}</span>
                  {isAlways && (
                    <span className="ml-auto text-[10px] text-text-tertiary">always</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function CompetitorKeywordsTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const prefs = useAppSelector(state => selectKeywordPrefs(state, projectId));
  const COMPETITORS_KEY = qk.competitors(projectId);

  const workspaceTab = (prefs.competitorFilter as OpportunityWorkspaceTab) ?? "all";

  const [running, setRunning] = useState(false);
  const [loadingMoreAhrefs, setLoadingMoreAhrefs] = useState(false);
  const [hasMoreAhrefs, setHasMoreAhrefs] = useState(true);
  const [error, setError] = useState("");
  const [aiScoring, setAiScoring] = useState(false);
  const [bulkSchedulingGaps, setBulkSchedulingGaps] = useState(false);

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const { hidden: hiddenCols, toggle: toggleCol } = useLocalColumnVisibility("kw_col_vis_competitor", ["top_competitor_url"]);

  const { data: projectsListRes } = useProjects();
  const allProjects = projectsListRes?.success && projectsListRes.data ? projectsListRes.data : [];
  const project = allProjects.find(p => p.id === projectId);

  const { data: state, isLoading: loading } = useQuery<BenchmarkState>({
    queryKey: COMPETITORS_KEY,
    queryFn: () => competitorsApi.benchmark(projectId),
    enabled: !!projectId,
    ...DEFAULT_QUERY_OPTIONS,
  });

  const { data: calendarRes } = useQuery({
    queryKey: qk.calendarWithBlogs(projectId),
    queryFn: () => calendarApi.withBlogs(projectId),
    enabled: !!projectId,
    ...DEFAULT_QUERY_OPTIONS,
  });

  const aiSuggestedGapKeywords = useAppSelector(state =>
    selectAiSuggestedGapKeywords(state, projectId)
  );

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

  const aiGapKeywordSet = useMemo(() => {
    return new Set((aiSuggestedGapKeywords ?? []).map(k => k.toLowerCase()));
  }, [aiSuggestedGapKeywords]);

  const competitors = useMemo(() => state?.competitors ?? [], [state?.competitors]);
  const gaps = useMemo(() => state?.gaps ?? [], [state?.gaps]);
  const hasBenchmark = competitors.length > 0;

  const configuredDomains = useMemo(
    () => project?.project_competitors?.map(c => normalizeDomain(c.domain)).sort() ?? null,
    [project]
  );
  const compHasMismatch = useMemo(() => {
    if (!project || !state) return false;
    if (configuredDomains === null || configuredDomains.length === 0) return false;
    const currentSnapshot = configuredDomains.join("|");
    const lastSnapshot = project.last_benchmarked_competitor_snapshot ?? null;
    return currentSnapshot !== lastSnapshot;
  }, [project, state, configuredDomains]);

  const compareFn = useCallback((a: KeywordGap, b: KeywordGap, col: string, dir: "asc" | "desc") => {
    return compareGaps(a, b, col as GapSortColumn, dir);
  }, []);

  const tableState = useKeywordTableState<KeywordGap>({
    data: gaps,
    filter: workspaceTab,
    keyExtractor: g => g.id,
    checkScheduled: g => calendarMap.has(g.keyword.toLowerCase()),
    checkGenerated: g => !!(calendarMap.get(g.keyword.toLowerCase())?.blog),
    getSearchString: g => g.keyword,
    compareFn,
    initialSortColumn: "volume",
    initialSortDirection: "desc",
  });

  const handleLoadMoreAhrefs = useCallback(async () => {
    setLoadingMoreAhrefs(true);
    setError("");
    const res = await competitorsApi.loadMoreFromAhrefs(projectId);
    if (!res.success) {
      setError(res.error ?? "Failed to load more keywords");
    } else {
      if (res.added > 0) {
        await queryClient.invalidateQueries({ queryKey: COMPETITORS_KEY });
      }
      setHasMoreAhrefs(res.hasMore);
    }
    setLoadingMoreAhrefs(false);
  }, [projectId, queryClient, COMPETITORS_KEY]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setError("");
    const res = await competitorsApi.runBenchmark(projectId);
    if (res.trace?.length) {
      console.groupCollapsed(
        `[Competitors] Benchmark — ${res.competitorsFound ?? 0} competitors · ${res.pagesScraped ?? 0} pages · ${res.gapsFound ?? 0} gaps`
      );
      for (const t of res.trace) {
        if (t.ok) console.log(t.label, t.info ?? "", t.url ?? "");
        else console.warn(t.label, t.error ?? "", t.url ?? "");
      }
      console.groupEnd();
    }
    if (!res.success) {
      setError(res.error ?? "Benchmark failed");
    } else {
      toast.success(
        `Benchmarked ${res.competitorsFound ?? 0} competitors across ${res.pagesScraped ?? 0} pages. Found ${res.gapsFound ?? 0} opportunities.`,
        { id: "benchmark-summary", duration: 5000 }
      );
      await queryClient.invalidateQueries({ queryKey: COMPETITORS_KEY });
      await queryClient.invalidateQueries({ queryKey: qk.projects });
    }
    setRunning(false);
  }, [projectId, queryClient, COMPETITORS_KEY]);

  const handleBulkScheduleGaps = useCallback(async () => {
    const rows = tableState.processedData.filter(g => tableState.selectedIds.has(g.id));
    if (!rows.length) return;
    setBulkSchedulingGaps(true);
    setError("");
    let anyOk = false;
    try {
      for (const g of rows) {
        const k = g.keyword.toLowerCase();
        if (calendarMap.has(k)) continue;
        const res = await competitorsApi.blogFromOpportunity(projectId, g.keyword);
        if (res.success) {
          anyOk = true;
        } else {
          setError(res.error ?? "Could not queue an opportunity.");
        }
      }
      tableState.exitMassSelect();
      if (anyOk) {
        void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
        router.push(`/projects/${projectId}/content-calendar`);
      }
    } finally {
      setBulkSchedulingGaps(false);
    }
  }, [tableState, projectId, calendarMap, queryClient, router]);

  const handleRunAiScoring = useCallback(async () => {
    if (aiScoring) return;
    setAiScoring(true);
    try {
      const res = await scoreCompetitorKeywordsWithAI(projectId);
      if (res.success) {
        await queryClient.invalidateQueries({ queryKey: COMPETITORS_KEY });
        toast.success("AI scoring complete — scores are now visible in the AI Score column.", { id: "ai-scoring-done" });
      } else {
        setError(res.error ?? "AI scoring failed");
      }
    } finally {
      setAiScoring(false);
    }
  }, [projectId, aiScoring, queryClient, COMPETITORS_KEY]);

  const articleTypeToContentType = useCallback((articleType: string): ContentType => {
    const typeMap: Record<string, ContentType> = {
      "Blog article": "blog",
      "Ebook": "ebook",
      "Whitepaper": "whitepaper",
      "LinkedIn post": "linkedin",
    };
    return typeMap[articleType] ?? "blog";
  }, []);

  const resolveContentType = useCallback(
    (keywordText: string, keywordId?: string, aiEvalData?: GapAiEvalData | null) => {
      const entry = (keywordId ? calendarMap.get(keywordId) : null) || calendarMap.get(keywordText.toLowerCase());
      if (entry) {
        return articleTypeToContentType(entry.article_type);
      }
      const recommended = aiEvalData ? articleTypeToContentType(aiEvalData.category) : undefined;
      const supportedTypes = ["blog", "ebook", "whitepaper", "linkedin"];
      if (recommended && supportedTypes.includes(recommended)) {
        return tableState.rowContentTypes[keywordText.toLowerCase()] ?? recommended;
      }
      return tableState.rowContentTypes[keywordText.toLowerCase()] ?? "blog";
    },
    [calendarMap, tableState.rowContentTypes, articleTypeToContentType]
  );

  const renderContentTypeSelect = useCallback((
    keywordText: string,
    aiEvalData: GapAiEvalData | null | undefined
  ) => {
    const entry = calendarMap.get(keywordText.toLowerCase());
    const isSch = !!entry;
    const isGenerated = !!entry?.blog;
    const currentType = resolveContentType(keywordText, undefined, aiEvalData);

    const recommended = aiEvalData ? articleTypeToContentType(aiEvalData.category) : undefined;
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
          onChange={e => tableState.setRowContentType(keywordText, e.target.value as ContentType)}
          disabled={isSch || isGenerated}
          className="w-36 h-8 text-[12px] bg-surface-secondary border border-border-subtle hover:border-border-strong rounded-md transition-colors px-2 outline-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {options.map(type => (
            <option key={type} value={type}>
              {labels[type]}
              {type === recommended ? " ✨" : ""}
            </option>
          ))}
        </select>
      </div>
    );
  }, [calendarMap, resolveContentType, tableState, articleTypeToContentType]);

  const renderActionCell = useCallback((g: KeywordGap) => {
    const entry = calendarMap.get(g.keyword.toLowerCase());
    const selectedType = resolveContentType(g.keyword, undefined, g.ai_eval_data);
    const intent = g.is_transactional
      ? "transactional"
      : g.is_commercial
        ? "commercial"
        : g.is_informational
          ? "informational"
          : g.is_navigational
            ? "navigational"
            : "informational";

    return (
      <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
        <KeywordActionCell
          projectId={projectId}
          keyword={g.keyword}
          sourceType="competitor_gap"
          contentType={selectedType}
          scheduledDate={entry?.scheduled_date}
          blogId={entry?.blog?.id}
          volume={g.volume}
          kd={g.kd}
          intent={intent}
          competitorDomain={g.top_competitor_domain}
          rankingUrl={g.top_competitor_url}
          rank={g.position ?? undefined}
        />
      </div>
    );
  }, [calendarMap, resolveContentType, projectId]);

  const columns = useMemo<ColumnDef<KeywordGap>[]>(() => [
    {
      id: "keyword",
      header: "Keyword",
      sortable: true,
      tooltip: "The competitor keyword.",
      cell: (g: KeywordGap) => (
        <div className="flex items-center gap-2 max-w-[240px] w-[240px] min-w-0">
          <Tooltip placement="above" content={g.keyword} className="w-full min-w-0 !justify-start">
            <p className="truncate text-[14px] font-medium text-text-primary cursor-help w-full min-w-0">
              {g.keyword}
            </p>
          </Tooltip>
          {aiGapKeywordSet.has(g.keyword.toLowerCase()) && (
            <span className="shrink-0 rounded-full border border-brand-violet/30 bg-brand-violet/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-violet">
              AI pick
            </span>
          )}
        </div>
      )
    },
    {
      id: "volume",
      header: "Volume",
      align: "right",
      sortable: true,
      tooltip: "Average monthly searches over the last 12 months.",
      cell: (g: KeywordGap) => (
        <span className="text-[14px] font-mono text-text-secondary tabular-nums">
          {g.volume > 0 ? g.volume.toLocaleString() : "—"}
        </span>
      )
    },
    {
      id: "kd",
      header: "KD",
      align: "center",
      sortable: true,
      tooltip: "Keyword Difficulty (0–100). Higher = harder to rank.",
      cell: (g: KeywordGap) => typeof g.kd === "number" && g.kd > 0 ? (
        <span className={`text-[13px] font-semibold tabular-nums ${KD_COLOR(g.kd)}`}>
          {g.kd}
        </span>
      ) : (
        <span className="text-[12px] text-text-tertiary">—</span>
      )
    },
    {
      id: "intent",
      header: "Intent",
      align: "center",
      sortable: false,
      tooltip: "Search intent: Informational · Navigational · Commercial · Transactional",
      cell: (g: KeywordGap) => {
        const activeIntents = [
          g.is_transactional && { label: "Transactional", color: "text-status-success" },
          g.is_commercial && { label: "Commercial", color: "text-status-warning" },
          g.is_informational && { label: "Informational", color: "text-status-info" },
          g.is_navigational && { label: "Navigational", color: "text-brand-violet-soft" },
        ].filter((t): t is { label: string; color: string } => !!t);

        return activeIntents.length > 0 ? (
          <div className="flex items-center justify-center gap-1 text-[12px] font-semibold">
            {activeIntents.map((t, idx) => (
              <span key={t.label} className="flex items-center gap-1">
                {idx > 0 && <span className="text-text-tertiary/40">/</span>}
                <span className={t.color}>{t.label}</span>
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[12px] text-text-tertiary">—</span>
        );
      }
    },
    {
      id: "ai_eval_score",
      header: "AI Score",
      align: "center",
      sortable: true,
      tooltip: "Gemini strategic score for competitor gaps.",
      cell: (g: KeywordGap) => g.ai_eval_score && g.ai_eval_data ? (
        <Tooltip
          placement="above"
          padding={false}
          content={<GapAiScoreTooltip data={g.ai_eval_data} score={g.ai_eval_score} />}
        >
          {(() => {
            const cat = getAiGapScoreCategory(g.ai_eval_score!);
            return (
              <span
                className={`inline-flex cursor-default items-center gap-1 rounded-[6px] border px-2.5 py-1 text-[12px] font-bold tabular-nums ${cat.colorClass}`}
              >
                <span>{cat.icon}</span> {g.ai_eval_score}
              </span>
            );
          })()}
        </Tooltip>
      ) : (
        <span className="text-[12px] min-w-[200px] text-text-tertiary">—</span>
      )
    },
    {
      id: "top_competitor_url",
      header: "Ranking page",
      sortable: false,
      tooltip: "The competitor's top-ranking URL for this keyword. Badge shows their position.",
      cell: (g: KeywordGap) => {
        const pos = typeof g.position === "number" && g.position > 0 ? g.position : null;
        const badgeCls = pos === null ? "" :
          pos <= 3 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
          pos <= 10 ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
          "border-border-subtle bg-surface-secondary text-text-tertiary";
        return (
          <div className="flex items-center gap-1.5 min-w-0 max-w-[280px]">
            {pos !== null && (
              <Tooltip placement="above" content={`Competitor ranks #${pos} for this keyword`}>
                <span className={`shrink-0 inline-flex items-center justify-center rounded-md h-5 min-w-[26px] px-1 text-[10px] font-bold tabular-nums border cursor-default ${badgeCls}`}>
                  #{pos}
                </span>
              </Tooltip>
            )}
            {g.top_competitor_url ? (
              <a
                href={g.top_competitor_url}
                target="_blank"
                rel="noopener noreferrer"
                title={g.top_competitor_url}
                className="truncate text-[12px] text-brand-action/80 hover:text-brand-action hover:underline min-w-0"
              >
                {compactUrl(g.top_competitor_url)} ↗
              </a>
            ) : (
              <span className="text-[12px] text-text-tertiary">—</span>
            )}
          </div>
        );
      }
    },
    {
      id: "content_type",
      header: "Content Type",
      align: "center",
      cell: (g: KeywordGap) => renderContentTypeSelect(g.keyword, g.ai_eval_data)
    },
    {
      id: "action",
      header: "Action",
      align: "center",
      sortable: false,
      cell: (g: KeywordGap) => renderActionCell(g)
    }
  ], [renderActionCell, renderContentTypeSelect, calendarMap, aiGapKeywordSet]);

  const OPPORTUNITY_TAB_ITEMS = useMemo(
    () => [
      { id: "all" as OpportunityWorkspaceTab, label: "All", count: tableState.counts.all },
      { id: "unscheduled" as OpportunityWorkspaceTab, label: "Unscheduled", count: tableState.counts.unscheduled },
      { id: "scheduled" as OpportunityWorkspaceTab, label: "Scheduled", count: tableState.counts.scheduled },
      { id: "generated" as OpportunityWorkspaceTab, label: "Generated", count: tableState.counts.generated },
    ],
    [tableState.counts]
  );

  const visibleColumns = useMemo(
    () => columns.filter(c => !hiddenCols.has(c.id) || c.id === "keyword" || c.id === "action"),
    [columns, hiddenCols]
  );

  const handleWorkspaceTabChange = (tab: OpportunityWorkspaceTab) => {
    dispatch(rememberCompetitorKeywordFilter({ projectId, filter: tab as unknown as KeywordFilterTab }));
  };

  useEffect(() => {
    if (!filterDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setFilterDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [filterDropdownOpen]);

  const renderControls = () => (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-primary">
      {/* Filter dropdown */}
      <div className="relative" ref={filterDropdownRef}>
        <button
          type="button"
          onClick={() => setFilterDropdownOpen(o => !o)}
          className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
            filterDropdownOpen
              ? "border-border-strong bg-surface-hover text-text-primary"
              : "border-border-subtle bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          }`}
        >
          <span>{OPPORTUNITY_TAB_ITEMS.find(t => t.id === workspaceTab)?.label ?? "All"}</span>
          <span className="tabular-nums text-text-tertiary">
            ({OPPORTUNITY_TAB_ITEMS.find(t => t.id === workspaceTab)?.count ?? 0})
          </span>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-150 ${filterDropdownOpen ? "rotate-180" : ""}`}>
            <path d="M2 4.5L6 8.5L10 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {filterDropdownOpen && (
          <div className="absolute left-0 top-full mt-1.5 z-30 min-w-[180px] rounded-xl border border-border-subtle bg-surface-elevated shadow-xl overflow-hidden">
            {OPPORTUNITY_TAB_ITEMS.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => { handleWorkspaceTabChange(opt.id); setFilterDropdownOpen(false); }}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-[13px] font-medium transition-colors text-left ${
                  workspaceTab === opt.id
                    ? "bg-surface-hover text-text-primary"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                }`}
              >
                <span>{opt.label}</span>
                <span className="text-[11px] text-text-tertiary tabular-nums">{opt.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {(gaps.length > 0 || loading) && !tableState.massSelectMode && (
          <button
            type="button"
            onClick={handleRunAiScoring}
            disabled={aiScoring || loading}
            className={`inline-flex h-8 shrink-0 cursor-pointer flex-row items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide shadow-sm transition-[transform,opacity,colors] duration-200 ease-out hover:-translate-y-px active:scale-95 disabled:pointer-events-none disabled:opacity-50 motion-safe:hover:scale-105 ${
              aiScoring
                ? "border-brand-violet/40 bg-brand-violet/20 text-brand-violet animate-pulse"
                : "border-brand-violet/30 bg-brand-violet/10 text-brand-violet hover:bg-brand-violet/20"
            }`}
          >
            {aiScoring ? (
              <>
                <div className="h-3 w-3 rounded-full border-2 border-brand-violet/30 border-t-[#8b5cf6] animate-spin" />
                <span>Scoring…</span>
              </>
            ) : (
              <>
                <svg
                  className="h-3 w-3 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.85}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
                  />
                </svg>
                <span>AI Score</span>
              </>
            )}
          </button>
        )}
        {(gaps.length > 0 || loading) && (
          <>
            {!tableState.massSelectMode ? (
              <button
                type="button"
                aria-label="Mass select opportunities"
                onClick={() => {
                  tableState.setMassSelectMode(true);
                  tableState.setSelectedIds(new Set());
                }}
                disabled={loading}
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
                  onClick={() => void handleBulkScheduleGaps()}
                  disabled={bulkSchedulingGaps || tableState.selectedIds.size === 0 || loading}
                  className={`inline-flex h-8 w-38 shrink-0 cursor-pointer flex-col justify-center whitespace-nowrap rounded-full border border-brand-action/70 bg-brand-action px-2 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide text-brand-on-primary shadow-sm transition-[transform,box-shadow,opacity] duration-200 ease-out hover:-translate-y-px hover:shadow-md hover:shadow-brand-action/20 active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-35 motion-safe:hover:scale-105 ${
                    bulkSchedulingGaps ? "animate-pulse cursor-wait" : ""
                  }`}
                >
                  <span className="block max-w-full overflow-hidden truncate text-center tabular-nums">
                    {bulkSchedulingGaps
                      ? "…"
                      : tableState.selectedIds.size > 0
                        ? `Schedule (${tableState.selectedIds.size})`
                        : "Schedule"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={tableState.exitMassSelect}
                  disabled={bulkSchedulingGaps || loading}
                  className="inline-flex h-8 min-w-19 shrink-0 cursor-pointer flex-col justify-center whitespace-nowrap rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,opacity,colors] duration-200 ease-out hover:border-border-strong hover:text-text-primary hover:-translate-y-px active:scale-95 disabled:opacity-35 motion-safe:hover:scale-105"
                  title="Leave mass-select mode"
                >
                  Cancel
                </button>
              </>
            )}
          </>
        )}
        <ColumnToggleDropdown
          allColumns={columns.map(c => ({ id: c.id, label: typeof c.header === "string" ? c.header : c.id }))}
          hidden={hiddenCols}
          alwaysVisible={["keyword", "action"]}
          onToggle={toggleCol}
        />
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 relative animate-slide-in-right">
      {compHasMismatch && (
        <div className="mb-4 shrink-0 flex items-start gap-3.5 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3.5">
          <div className="mt-0.5 shrink-0 flex h-8 w-8 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10">
            <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-amber-400">Competitor list has changed</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">
              Your configured competitors no longer match the last benchmark. Run a new benchmark to find gaps based on your updated competitor list.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 ml-2">
            <button
              type="button"
              onClick={() => { void handleRun(); }}
              disabled={running}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3.5 py-1.5 text-[12px] font-semibold text-amber-400 transition-colors hover:bg-amber-500/25 disabled:opacity-50 disabled:pointer-events-none"
            >
              {running ? "Benchmarking…" : "Re-benchmark"}
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-[16px] border border-brand-coral/20 bg-brand-coral/10 p-5 text-[14px] text-brand-coral shrink-0 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
          {error.toLowerCase().includes("limit") && (
            <div className="flex items-center gap-2.5">
              <a
                href="/pricing"
                className="inline-flex items-center justify-center rounded-full bg-brand-coral/20 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-coral hover:bg-brand-coral/30 transition-all duration-200"
              >
                Upgrade Plan
              </a>
              <a
                href="mailto:support@seoengine.com?subject=Keyword Quota Increase Request"
                className="inline-flex items-center justify-center rounded-full border border-brand-coral/20 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-coral hover:bg-brand-coral/10 transition-all duration-200"
              >
                Contact Support
              </a>
            </div>
          )}
        </div>
      )}
      {!hasBenchmark && !loading ? (
        <div className="rounded-[22px] border border-dashed border-border-strong bg-surface-secondary py-24 text-center">
          <div className="mb-6 flex justify-center">
            <div className="w-16 h-16 rounded-[16px] bg-surface-tertiary flex items-center justify-center text-text-primary border border-border-subtle">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
                />
              </svg>
            </div>
          </div>
          <h3 className="mb-3 text-[24px] font-normal tracking-[-0.24px] text-text-primary font-display">
            No competitor keywords yet
          </h3>
          <p className="mb-8 text-[16px] text-text-tertiary max-w-lg mx-auto leading-relaxed">
            We&apos;ll pull the organic keywords your competitors rank for and identify coverage gaps. Add competitor
            domains to get started.
          </p>
          <button
            onClick={handleRun}
            disabled={running}
            className="rounded-[32px] bg-brand-primary px-8 py-3 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {running ? "Benchmarking…" : "Run benchmark"}
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 space-y-6">
          <section className="flex-1 flex flex-col min-h-0 space-y-3">
            <Suspense fallback={<KeywordTableSkeleton />}>
              <SharedKeywordTable<KeywordGap>
                data={tableState.displayedData}
                columns={visibleColumns}
                keyExtractor={g => g.id}
                scrollContainerRef={tableScrollRef}
                sortColumn={tableState.activeSortColumn}
                sortDirection={tableState.activeSortDirection}
                onSortToggle={tableState.handleSortToggle}
                massSelectMode={tableState.massSelectMode}
                selectedIds={tableState.selectedIds}
                onToggleSelect={tableState.toggleRowSelected}
                selectionDisabled={bulkSchedulingGaps}
                isSelectable={() => true}
                isLoading={loading}
                controls={renderControls()}
                emptyState={
                  <EmptyState
                    variant="card"
                    title={workspaceTab !== "all" ? "No opportunities match this tab" : "No opportunities match this view"}
                  />
                }
                rowClassName={(g) => {
                  const isScheduled = calendarMap.has(g.keyword.toLowerCase());
                  return `${isScheduled ? "bg-brand-action/[0.07]" : ""} ${
                    tableState.selectedIds.has(g.id) ? "bg-surface-secondary/95 ring-1 ring-inset ring-brand-action/25" : ""
                  }`;
                }}
                minWidth="1060px"
                footerLeft={
                  <span className="text-[12px] text-text-tertiary">
                    Showing <span className="font-semibold text-text-secondary">{tableState.processedData.length}</span> of{" "}
                    <span className="font-semibold text-text-secondary">{tableState.processedData.length}</span> keywords
                  </span>
                }
                footerRight={
                  hasMoreAhrefs ? (
                    <button
                      type="button"
                      onClick={() => void handleLoadMoreAhrefs()}
                      disabled={loadingMoreAhrefs}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[12px] font-medium shadow-sm transition-colors disabled:opacity-50 disabled:pointer-events-none ${
                        loadingMoreAhrefs
                          ? "border-brand-action/40 bg-brand-action/10 text-brand-action animate-pulse"
                          : "border-brand-action/30 bg-brand-action/5 text-brand-action hover:bg-brand-action/10 hover:border-brand-action/50"
                      }`}
                    >
                      {loadingMoreAhrefs ? (
                        <>
                          <div className="h-3 w-3 rounded-full border-2 border-brand-action/30 border-t-brand-action animate-spin" />
                          Loading…
                        </>
                      ) : (
                        <>
                          Load more
                        </>
                      )}
                    </button>
                  ) : null
                }
              />
            </Suspense>
          </section>
        </div>
      )}
    </div>
  );
}
