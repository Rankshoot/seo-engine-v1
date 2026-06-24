"use client";

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, keywordsListQueryOptions, useProjects, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
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
import { Tooltip } from "@/components/Tooltip";
import { toast } from "react-hot-toast";
import { scoreKeywordsWithAI, type AiEvalData } from "@/app/actions/keyword-actions";
import { useKeywordTableState } from "../_hooks/useKeywordTableState";
import { useUserQuota } from "@/hooks/useUserQuota";

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
  kd < 30 ? "text-status-success" : kd < 60 ? "text-status-warning" : "text-brand-coral";

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
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${cat.cls}`}>
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

type FilterTab = "all" | "unscheduled" | "scheduled" | "generated";
type IntentFilter = "all" | "informational" | "commercial" | "transactional" | "navigational";

type SourceTab = "industry" | "domain";

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

function WriteBacklogBanner({ count, projectId }: { count: number; projectId: string }) {
  return (
    <div className="mb-4 shrink-0 flex items-center gap-4 rounded-[14px] border border-brand-violet/25 bg-brand-violet/[0.07] px-4 py-3.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand-violet/25 bg-brand-violet/10">
        <svg className="h-4 w-4 text-brand-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-text-primary">
          {count} approved keyword{count !== 1 ? "s" : ""} waiting to be written
        </p>
        <p className="mt-0.5 text-[12px] text-text-secondary leading-snug">
          These keywords are approved but not yet scheduled. Turn them into content now.
        </p>
      </div>
      <a
        href={`/projects/${projectId}/content-generator/blogs`}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-brand-violet px-4 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        Write now
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
        </svg>
      </a>
    </div>
  );
}

// ── Keyword status pill — approve / reject toggle ─────────────────────────────

const NEXT_STATUS: Record<KeywordStatus, KeywordStatus> = {
  pending: "approved",
  approved: "rejected",
  rejected: "pending",
};

function KeywordStatusPill({
  keywordId,
  status,
  projectId: pid,
  disabled,
}: {
  keywordId: string;
  status: KeywordStatus;
  projectId: string;
  disabled?: boolean;
}) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [mutating, setMutating] = useState(false);

  const cycle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (mutating || disabled) return;
    const next = NEXT_STATUS[status];
    setMutating(true);
    dispatch(keywordStatusChanged({ projectId: pid, keywordId, previousStatus: status, nextStatus: next }));
    try {
      await keywordsApi.bulkStatus(pid, [keywordId], next);
      void queryClient.invalidateQueries({ queryKey: qk.keywords(pid) });
    } catch {
      dispatch(keywordStatusChanged({ projectId: pid, keywordId, previousStatus: next, nextStatus: status }));
    } finally {
      setMutating(false);
    }
  };

  const spinner = (color: string) => (
    <span className={`h-2.5 w-2.5 rounded-full border-2 ${color} animate-spin`} />
  );

  if (status === "approved") return (
    <button type="button" onClick={cycle} disabled={disabled}
      title="Approved — click to reject"
      className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[11px] font-semibold transition-all hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400 group disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {mutating ? spinner("border-emerald-400/30 border-t-emerald-400") : (
        <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <span className="group-hover:hidden">Approved</span>
      <span className="hidden group-hover:inline">Reject?</span>
    </button>
  );

  if (status === "rejected") return (
    <button type="button" onClick={cycle} disabled={disabled}
      title="Rejected — click to reset to pending"
      className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-400 text-[11px] font-semibold transition-all hover:border-border-subtle hover:bg-surface-secondary hover:text-text-tertiary group disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {mutating ? spinner("border-rose-400/30 border-t-rose-400") : (
        <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
      <span className="group-hover:hidden">Rejected</span>
      <span className="hidden group-hover:inline">Reset?</span>
    </button>
  );

  return (
    <button type="button" onClick={cycle} disabled={disabled}
      title="Click to approve"
      className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full border border-border-subtle bg-surface-secondary text-text-tertiary text-[11px] font-medium transition-all hover:border-emerald-500/40 hover:bg-emerald-500/[0.08] hover:text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {mutating ? spinner("border-text-tertiary/30 border-t-text-tertiary") : (
        <span className="h-1.5 w-1.5 rounded-full bg-text-tertiary/50" />
      )}
      Pending
    </button>
  );
}

// ── Floating "Schedule all approved" bar ──────────────────────────────────────

function ApprovedFloatingBar({
  count,
  onScheduleAll,
  scheduling,
}: {
  count: number;
  onScheduleAll: () => void;
  scheduling: boolean;
}) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-bottom-3 duration-200">
      <div className="pointer-events-auto flex items-center gap-3 rounded-[16px] border border-border-default bg-surface-elevated/95 backdrop-blur-md px-4 py-3 shadow-xl shadow-black/20 min-w-[300px]">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/25">
          <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-text-primary leading-none">
            {count} approved
          </p>
          <p className="text-[11px] text-text-tertiary mt-0.5">Ready to add to your calendar</p>
        </div>
        <button
          type="button"
          onClick={onScheduleAll}
          disabled={scheduling}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-brand-violet px-4 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {scheduling ? (
            <span className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
          )}
          {scheduling ? "Scheduling…" : "Schedule all →"}
        </button>
      </div>
    </div>
  );
}

export default function OrganicKeywordsTab({ projectId }: { projectId: string }) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { canFetchMoreKeywords } = useUserQuota();
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
  const filter = keywordPrefs.filter as FilterTab;
  const tableSort = keywordPrefs.tableSort as { column: TableSortColumn; dir: SortDir };
  const [error, setError] = useState("");

  // Always show industry (merged) data — dropdown removed.
  const sourceTab: SourceTab = "industry";
  const keywordTableScrollRef = useRef<HTMLDivElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [orgWarnDismissed, setOrgWarnDismissed] = useState(false);
  const [orgHasMismatch, setOrgHasMismatch] = useState(false);
  const { hidden: hiddenCols, toggle: toggleCol } = useLocalColumnVisibility("kw_col_vis_organic");

  const [bulkScheduling, setBulkScheduling] = useState(false);
  const [schedulingAllApproved, setSchedulingAllApproved] = useState(false);
  const [aiScoring, setAiScoring] = useState(false);
  const [loadingMoreAhrefs, setLoadingMoreAhrefs] = useState(false);
  const [intentFilter, setIntentFilter] = useState<IntentFilter>("all");

  const handleLoadMoreFromAhrefs = async () => {
    setLoadingMoreAhrefs(true);
    const toastId = toast.loading("Loading more keywords...");
    try {
      const res = await keywordsApi.loadMoreFromAhrefs(projectId);
      if (res.success) {
        toast.success(`Loaded ${res.count ?? 0} new keywords`, { id: toastId });
        await queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
      } else {
        toast.error(res.error ?? "Failed to load more keywords", { id: toastId });
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

  // Keywords approved but not yet scheduled on the calendar — the "write backlog"
  const writeBacklogCount = useMemo(() =>
    keywords.filter(kw =>
      kw.status === "approved" &&
      !calendarMap.has(kw.id) &&
      !calendarMap.has(kw.keyword.toLowerCase())
    ).length,
    [keywords, calendarMap]
  );

  // Approved keywords not yet on calendar — drives the floating bar
  const approvedUnscheduledIds = useMemo(
    () => keywords
      .filter(kw => kw.status === "approved" && !calendarMap.has(kw.id) && !calendarMap.has(kw.keyword.toLowerCase()))
      .map(kw => kw.id),
    [keywords, calendarMap]
  );

  const handleScheduleAllApproved = async () => {
    if (!approvedUnscheduledIds.length || schedulingAllApproved) return;
    setSchedulingAllApproved(true);
    try {
      const res = await keywordsApi.bulkStatus(projectId, approvedUnscheduledIds, "approved");
      if (res.success) {
        toast.success(`Scheduled ${res.calendarScheduled ?? approvedUnscheduledIds.length} keyword${approvedUnscheduledIds.length !== 1 ? "s" : ""} to calendar`);
        void queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
      } else {
        toast.error(res.error ?? "Failed to schedule keywords");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to schedule keywords");
    } finally {
      setSchedulingAllApproved(false);
    }
  };

  useEffect(() => {
    if (serverKeywords.length === 0) return;
    dispatch(
      mergeKeywordStatuses({
        projectId,
        statuses: Object.fromEntries(serverKeywords.map(kw => [kw.id, kw.status])),
      })
    );
  }, [dispatch, projectId, serverKeywords]);

  // Commented out to prevent duplicate API call - get project from list instead
  // const { data: projectData } = useProject(projectId);
  const { data: projectsListRes } = useProjects();
  const allProjects = projectsListRes?.success && projectsListRes.data ? projectsListRes.data : [];
  const project = allProjects.find(p => p.id === projectId);
  const projectDomain = project?.domain || "";

  const ORG_HASH_KEY = `kw_org_discovery_params_${projectId}`;
  const orgCurrentHash = useMemo(() =>
    project ? simpleHash([project.domain, project.niche, project.target_region, project.target_language].filter(Boolean).join("|")) : "",
    [project]
  );
  useEffect(() => {
    if (!orgCurrentHash) return;
    const stored = localStorage.getItem(ORG_HASH_KEY);
    if (stored === null) {
      // No baseline yet — if keywords already exist we can't verify they match current settings
      if (serverKeywords.length > 0) setOrgHasMismatch(true);
      return;
    }
    setOrgHasMismatch(stored !== orgCurrentHash);
  }, [orgCurrentHash, ORG_HASH_KEY, serverKeywords.length]);

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
      if (orgCurrentHash) {
        localStorage.setItem(ORG_HASH_KEY, orgCurrentHash);
        setOrgHasMismatch(false);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.brief(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.project(projectId) }),
      ]);
    } else setError(res.error ?? "Discovery failed");
    setDiscovering(false);
  };



  // State calculations with Hook consolidation
  const intentFilteredKeywords = useMemo(() => {
    if (intentFilter === "all") return keywords;
    return keywords.filter(kw => {
      const norm = (kw.intent ?? "").toLowerCase();
      return norm.includes(intentFilter);
    });
  }, [keywords, intentFilter]);

  const tableState = useKeywordTableState<Keyword>({
    data: intentFilteredKeywords,
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

  const activeState = tableState;
  const displayCounts = tableState.counts;

  const handleBulkScheduleToCalendar = async () => {
    const ids = [...activeState.selectedIds];
    if (!ids.length) return;

    setError("");
    const previousData = queryClient.getQueryData<KeywordsResponse>(KEYWORDS_KEY);
    const previousStatuses = Object.fromEntries(
      ids.map(id => [id, keywords.find(keyword => keyword.id === id)?.status ?? "pending"])
    ) as Record<string, KeywordStatus>;
    let bulkRes: Awaited<ReturnType<typeof keywordsApi.bulkStatus>> | undefined;
    setBulkScheduling(true);
    try {
      patchKeywords(list =>
        list.map(k => (ids.includes(k.id) ? { ...k, status: "approved" as const } : k))
      );
      dispatch(bulkKeywordStatusChanged({ projectId, keywordIds: ids, nextStatus: "approved" }));
      bulkRes = await keywordsApi.bulkStatus(projectId, ids, "approved");
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

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) }),
      ]);

      toast.success(
        `${ids.length} keyword(s) scheduled${
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
    stateObj: typeof activeState,
    volume?: number,
    kd?: number,
    cpc?: number,
    intent?: string
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
          volume={volume}
          kd={kd}
          cpc={cpc}
          intent={intent}
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

  const industryColumns = useMemo<ColumnDef<Keyword>[]>(() => [
    {
      id: "keyword",
      header: "Keyword",
      sortable: true,
      tooltip: `The search query. Live data from DataForSEO in ${project ? regionName(project.target_region) : "your region"}.`,
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
                Relevance: {kw.relevance_score ?? 0} · Fit: {kw.business_fit_score ?? 0}
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
      tooltip: "Average monthly searches over the last 12 months.",
      cell: (kw: Keyword) => (
        <Tooltip
          placement="above"
          padding={false}
          content={kw.monthly_searches ? <MonthlySearchesChart data={kw.monthly_searches} /> : null}
        >
          <span className="text-[14px] font-mono text-text-secondary cursor-help tabular-nums">
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
      tooltip: "Keyword Difficulty (0–100). Higher = harder to rank.",
      cell: (kw: Keyword) => (
        <div className="flex items-center justify-center gap-2">
          {typeof kw.kd === "number" && kw.kd > 0 ? (
            <>
              <div className="h-1.5 w-10 overflow-hidden rounded-full bg-surface-tertiary">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    kw.kd < 30 ? "bg-status-success" : kw.kd < 60 ? "bg-status-warning" : "bg-brand-coral"
                  }`}
                  style={{ width: `${kw.kd}%` }}
                />
              </div>
              <span className={`text-[12px] font-bold tabular-nums ${KD_COLOR(kw.kd)}`}>{kw.kd}</span>
            </>
          ) : (
            <span className="text-[13px] text-text-tertiary">—</span>
          )}
        </div>
      )
    },
    {
      id: "cpc",
      header: "CPC",
      align: "right",
      sortable: true,
      tooltip: "Cost Per Click (USD) — average advertiser bid.",
      cell: (kw: Keyword) => (
        <span className="text-[13px] font-mono text-text-tertiary tabular-nums">
          {kw.cpc ? `$${kw.cpc.toFixed(2)}` : "—"}
        </span>
      )
    },
    {
      id: "intent",
      header: "Intent",
      align: "left",
      sortable: true,
      tooltip: "Searcher intent (informational, commercial, transactional, navigational).",
      cell: (kw: Keyword) => {
        if (!kw.intent) return <span className="text-[13px] text-text-tertiary">—</span>;
        const norm = kw.intent.toLowerCase();
        const color =
          norm.includes("transactional") ? "text-status-success" :
          norm.includes("commercial") ? "text-status-warning" :
          norm.includes("informational") ? "text-status-info" :
          norm.includes("navigational") ? "text-brand-violet-soft" : "text-text-tertiary";
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
          <Tooltip placement="above" padding={false} content={<AiScoreTooltip data={data} score={score} />}>
            <span className={`inline-flex items-center gap-1 rounded-[6px] border px-2.5 py-1 text-[12px] font-bold tabular-nums cursor-help ${cat.cls}`}>
              <span>{cat.icon}</span>
              {score}
            </span>
          </Tooltip>
        );
      }
    },
    {
      id: "status",
      header: "Status",
      align: "center",
      sortable: true,
      tooltip: "Approve keywords you want to write content for. Rejected keywords are hidden from the calendar.",
      cell: (kw: Keyword) => {
        const isScheduled = calendarMap.has(kw.id) || calendarMap.has(kw.keyword.toLowerCase());
        const entry = calendarMap.get(kw.id) || calendarMap.get(kw.keyword.toLowerCase());
        const isGenerated = !!entry?.blog;

        if (isGenerated) {
          return (
            <span className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full border border-brand-violet/30 bg-brand-violet/10 text-brand-violet text-[11px] font-semibold">
              <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Generated
            </span>
          );
        }
        if (isScheduled) {
          const fmtDate = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
          return (
            <span className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full border border-border-subtle bg-surface-secondary text-text-secondary text-[11px] font-medium">
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              {entry?.scheduled_date ? fmtDate(entry.scheduled_date) : "Scheduled"}
            </span>
          );
        }
        return (
          <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
            <KeywordStatusPill
              keywordId={kw.id}
              status={kw.status as KeywordStatus}
              projectId={projectId}
            />
          </div>
        );
      }
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
          tableState,
          kw.volume,
          kw.kd,
          kw.cpc,
          kw.intent || undefined
        )
    }
  ].filter(c => c.id !== "analysis_score") as ColumnDef<Keyword>[], [renderActionCell, calendarMap, project, tableState, projectId]);

  const visibleColumns = useMemo(
    () => industryColumns.filter(c => !hiddenCols.has(c.id) || c.id === "keyword" || c.id === "action" || c.id === "status"),
    [industryColumns, hiddenCols]
  );

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

  // Sticky Filter / Header bar controls
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
          <span>{FILTER_TAB_ITEMS.find(t => t.id === filter)?.label ?? "All"}</span>
          <span className="tabular-nums text-text-tertiary">
            ({FILTER_TAB_ITEMS.find(t => t.id === filter)?.count ?? 0})
          </span>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-150 ${filterDropdownOpen ? "rotate-180" : ""}`}>
            <path d="M2 4.5L6 8.5L10 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {filterDropdownOpen && (
          <div className="absolute left-0 top-full mt-1.5 z-30 min-w-[180px] rounded-xl border border-border-subtle bg-surface-elevated shadow-xl overflow-hidden">
            {FILTER_TAB_ITEMS.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  dispatch(rememberKeywordFilter({ projectId, filter: opt.id as unknown as KeywordFilterTab }));
                  setFilterDropdownOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-[13px] font-medium transition-colors text-left ${
                  filter === opt.id
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

      <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
        {(keywords.length > 0 || loading || discovering) && (
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
                <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
                </svg>
                <span>AI Score</span>
              </>
            )}
          </button>
        )}
        {(keywords.length > 0 || loading || discovering) ? (
          !activeState.massSelectMode ? (
            <button
              type="button"
              aria-label="Mass select keywords"
              onClick={() => {
                activeState.setMassSelectMode(true);
                activeState.setSelectedIds(new Set());
              }}
              disabled={loading || discovering}
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
                disabled={bulkScheduling || activeState.selectedIds.size === 0 || loading || discovering}
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
                disabled={bulkScheduling || loading || discovering}
                className="inline-flex h-8 min-w-19 shrink-0 cursor-pointer flex-col justify-center whitespace-nowrap rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,opacity,colors] duration-200 ease-out hover:border-border-strong hover:text-text-primary hover:-translate-y-px active:scale-95 disabled:opacity-35 motion-safe:hover:scale-105"
                title="Leave mass-select mode"
              >
                Cancel
              </button>
            </>
          )
        ) : null}
        <ColumnToggleDropdown
          allColumns={industryColumns.map(c => ({ id: c.id, label: typeof c.header === "string" ? c.header : c.id }))}
          hidden={hiddenCols}
          alwaysVisible={["keyword", "action"]}
          onToggle={toggleCol}
        />
      </div>
    </div>
  );

  const showOrgWarning = orgHasMismatch && !orgWarnDismissed;

  return (
    <div className="flex-1 flex flex-col min-h-0 relative animate-slide-in-left">
      <div className="flex-1 flex flex-col min-h-0">
        {showOrgWarning && (
          <div className="mb-4 shrink-0 flex items-start gap-3.5 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3.5">
            <div className="mt-0.5 shrink-0 flex h-8 w-8 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10">
              <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-amber-400">Project details have changed</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">
                Your niche, domain, or region was updated since the last keyword discovery. Rediscover to get keywords matching your current settings.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 ml-2">
              <button
                type="button"
                onClick={() => { setOrgWarnDismissed(true); void handleDiscover(); }}
                disabled={discovering}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3.5 py-1.5 text-[12px] font-semibold text-amber-400 transition-colors hover:bg-amber-500/25 disabled:opacity-50 disabled:pointer-events-none"
              >
                {discovering ? "Discovering…" : "Rediscover"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOrgWarnDismissed(true);
                  if (orgCurrentHash) localStorage.setItem(ORG_HASH_KEY, orgCurrentHash);
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary"
                aria-label="Dismiss"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
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

        {writeBacklogCount > 0 && (
          <WriteBacklogBanner
            count={writeBacklogCount}
            projectId={projectId}
          />
        )}

        {/* ── Intent filter chips ── */}
        {keywords.length > 0 && (() => {
          const INTENTS: { id: IntentFilter; label: string; color: string }[] = [
            { id: "all", label: "All intent", color: "" },
            { id: "informational", label: "Informational", color: "text-status-info" },
            { id: "commercial", label: "Commercial", color: "text-status-warning" },
            { id: "transactional", label: "Transactional", color: "text-status-success" },
            { id: "navigational", label: "Navigational", color: "text-brand-violet-soft" },
          ];
          return (
            <div className="mb-3 flex flex-wrap gap-1.5 shrink-0">
              {INTENTS.map(({ id, label, color }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setIntentFilter(id)}
                  className={`h-7 px-3 rounded-full text-[11px] font-medium transition-all ${
                    intentFilter === id
                      ? "bg-surface-elevated border border-border-default text-text-primary shadow-sm"
                      : `border border-border-subtle bg-surface-secondary text-text-tertiary hover:text-text-secondary ${color}`
                  }`}
                >
                  {label}
                  {id !== "all" && (
                    <span className="ml-1.5 tabular-nums text-text-tertiary">
                      {keywords.filter(kw => (kw.intent ?? "").toLowerCase().includes(id)).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          );
        })()}

        <Suspense fallback={<KeywordTableSkeleton />}>
          <SharedKeywordTable<Keyword>
            data={tableState.displayedData}
            columns={visibleColumns}
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
                    disabled={discovering || !canFetchMoreKeywords}
                    title={!canFetchMoreKeywords ? "Upgrade your plan to discover more keywords" : undefined}
                    className="rounded-[32px] bg-brand-primary px-8 py-3 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
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
            footerLeft={
              <p className="text-[13px] text-text-tertiary">
                Showing{" "}
                <span className="font-semibold tabular-nums text-text-primary">{tableState.processedData.length}</span> of{" "}
                <span className="font-semibold tabular-nums text-text-primary">{tableState.processedData.length}</span> keywords
              </p>
            }
            footerRight={
              (() => {
                const ahrefsState = keywordsData?.ahrefsDiscoveryState;
                const hasMoreAhrefs = ahrefsState
                  ? (ahrefsState.matching_has_more || ahrefsState.related_has_more)
                  : false;

                if (!hasMoreAhrefs) return null;

                return (
                  <button
                    type="button"
                    disabled={loadingMoreAhrefs || !canFetchMoreKeywords}
                    onClick={handleLoadMoreFromAhrefs}
                    title={!canFetchMoreKeywords ? "Upgrade your plan to load more keywords" : undefined}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-action/30 bg-brand-action/10 px-4 py-1.5 text-[12px] font-semibold text-brand-action transition-all hover:bg-brand-action/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingMoreAhrefs ? (
                      <>
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-action/40 border-t-brand-action" />
                        Loading…
                      </>
                    ) : (
                      <>
                        {!canFetchMoreKeywords ? "Upgrade to load more" : "Load more"}
                        <svg className="h-3.5 w-3.5 shrink-0 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </>
                    )}
                  </button>
                );
              })()
            }
          />
        </Suspense>
      </div>

      <KeywordDetailModal
        open={!!modalKeyword}
        projectId={projectId}
        keyword={modalKeyword}
        onClose={() => setModalKeywordId(null)}
      />

      {/* Floating schedule bar — appears when approved keywords exist */}
      <ApprovedFloatingBar
        count={approvedUnscheduledIds.length}
        onScheduleAll={handleScheduleAllApproved}
        scheduling={schedulingAllApproved}
      />
    </div>
  );
}
