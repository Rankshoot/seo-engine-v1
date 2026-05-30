"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query";
import type { BenchmarkState } from "@/app/actions/competitor-actions";
import { competitorsApi } from "@/frontend/api/competitors";
import { calendarApi } from "@/frontend/api/calendar";
import { projectDomainHost } from "@/lib/project-domain-host";
import type { Competitor, GapType, KeywordGap, KeywordStatus, ContentType } from "@/lib/types";
import { KeywordActionCell } from "@/components/keywords/KeywordActionCell";
import { PillTabFilterBar } from "@/components/filters/PillTabFilterBar";
import { useAppSelector, selectAiSuggestedGapKeywords } from "@/lib/redux/hooks";
import { PageTitle, EmptyState } from "@/components/common";
import { scoreCompetitorKeywordsWithAI } from "@/app/actions/keyword-actions";
import { Tooltip } from "@/components/Tooltip";

function logoUrlCandidates(host: string): string[] {
  if (!host) return [];
  return [
    `https://logo.clearbit.com/${encodeURIComponent(host)}`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`,
  ];
}

function DomainLogo({ domain }: { domain: string }) {
  const host = useMemo(() => projectDomainHost(domain), [domain]);
  const sources = useMemo(() => logoUrlCandidates(host), [host]);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [host]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const letter = (domain || "?").charAt(0).toUpperCase();

  if (!host || failed) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-surface-tertiary text-[14px] font-bold text-text-primary border border-border-subtle">
        {letter}
      </div>
    );
  }

  return (
    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-white border border-border-subtle shadow-sm">
      <img
        key={`${host}-${index}`}
        src={sources[index]}
        alt=""
        width={28}
        height={28}
        loading="lazy"
        decoding="async"
        className="h-7 w-7 object-contain"
        onError={() => {
          if (index < sources.length - 1) setIndex(i => i + 1);
          else setFailed(true);
        }}
      />
    </div>
  );
}

type InsightsView = "opportunities" | "competitors";

const GAP_STYLES: Record<GapType, string> = {
  missing: "border-brand-coral/20 bg-brand-coral/10 text-brand-coral",
  weak: "border-[#f59e0b]/20 bg-[#f59e0b]/10 text-[#f59e0b]",
  untapped: "border-[#10b981]/20 bg-[#10b981]/10 text-[#10b981]",
};

function formatMonthlyTraffic(volume: number): string {
  if (!volume || volume <= 0) return "—";
  return `${volume.toLocaleString()}/mo`;
}

function compactUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`.replace(/\/$/, "");
    return path && path !== "/" ? path : parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function scoreColor(score: number) {
  if (score >= 70) return "text-[#10b981] border-[#10b981]/20 bg-[#10b981]/10";
  if (score >= 50) return "text-[#f59e0b] border-[#f59e0b]/20 bg-[#f59e0b]/10";
  if (score >= 30) return "text-brand-action border-brand-action/20 bg-brand-action/10";
  return "text-text-tertiary border-border-subtle bg-surface-elevated";
}



export default function CompetitorKeywordsTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const COMPETITORS_KEY = qk.competitors(projectId);

  const [running, setRunning] = useState(false);
  const [loadingMoreAhrefs, setLoadingMoreAhrefs] = useState(false);
  const [error, setError] = useState("");
  const [insightsView, setInsightsView] = useState<InsightsView>("opportunities");
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const [expandedCompetitor, setExpandedCompetitor] = useState<string | null>(null);
  const [massSelectMode, setMassSelectMode] = useState(false);
  const [selectedGapIds, setSelectedGapIds] = useState<Set<string>>(new Set());
  const [bulkSchedulingGaps, setBulkSchedulingGaps] = useState(false);
  const [generatingKeyword, setGeneratingKeyword] = useState<string | null>(null);
  const [lastRunSummary, setLastRunSummary] = useState<string>("");
  const [aiScoring, setAiScoring] = useState(false);
  const [aiScoringDone, setAiScoringDone] = useState(false);
  const aiSuggestedGapKeywords = useAppSelector(state =>
    selectAiSuggestedGapKeywords(state, projectId)
  );
  const aiGapKeywordSet = useMemo(
    () => new Set(aiSuggestedGapKeywords.map(k => k.toLowerCase())),
    [aiSuggestedGapKeywords]
  );

  const { data: state, isLoading: loading } = useQuery<BenchmarkState>({
    queryKey: COMPETITORS_KEY,
    queryFn: () => competitorsApi.benchmark(projectId),
    enabled: !!projectId,
  });

  const { data: calendarRes } = useQuery({
    queryKey: qk.calendarWithBlogs(projectId),
    queryFn: () => calendarApi.withBlogs(projectId),
    enabled: !!projectId,
  });
  const calendarEntries = calendarRes?.success ? calendarRes.data : [];

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

  useEffect(() => {
    if (!viewMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setViewMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [viewMenuOpen]);

  const handleLoadMoreAhrefs = async () => {
    setLoadingMoreAhrefs(true);
    setError("");
    const res = await competitorsApi.loadMoreFromAhrefs(projectId);
    if (!res.success) {
      setError(res.error ?? "Failed to load more from Ahrefs");
    } else if (res.added > 0) {
      await queryClient.invalidateQueries({ queryKey: COMPETITORS_KEY });
    }
    setLoadingMoreAhrefs(false);
  };

  const handleRun = async () => {
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
      setLastRunSummary(
        `Benchmarked ${res.competitorsFound ?? 0} competitors across ${res.pagesScraped ?? 0} pages. Found ${res.gapsFound ?? 0} opportunities.`
      );
      await queryClient.invalidateQueries({ queryKey: COMPETITORS_KEY });
    }
    setRunning(false);
  };

  const handleGenerateBlog = async (keyword: string) => {
    setGeneratingKeyword(keyword);
    const res = await competitorsApi.blogFromOpportunity(projectId, keyword);
    setGeneratingKeyword(null);
    if (res.success) {
      void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
      router.push(`/projects/${projectId}/content-calendar`);
    } else {
      setError(res.error ?? "Could not create calendar entry.");
    }
  };

  const exitGapMassSelect = () => {
    setMassSelectMode(false);
    setSelectedGapIds(new Set());
  };

  const toggleGapRowSelected = (gapId: string) => {
    setSelectedGapIds(prev => {
      const next = new Set(prev);
      if (next.has(gapId)) next.delete(gapId);
      else next.add(gapId);
      return next;
    });
  };

  const handleBulkScheduleGaps = async () => {
    const rows = sortedGaps.filter(g => selectedGapIds.has(g.id));
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
      exitGapMassSelect();
      if (anyOk) {
        void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
        router.push(`/projects/${projectId}/content-calendar`);
      }
    } finally {
      setBulkSchedulingGaps(false);
    }
  };

  const handleRunAiScoring = async () => {
    if (aiScoring) return;
    setAiScoring(true);
    setAiScoringDone(false);
    try {
      const res = await scoreCompetitorKeywordsWithAI(projectId);
      if (res.success) {
        await queryClient.invalidateQueries({ queryKey: COMPETITORS_KEY });
        setAiScoringDone(true);
      } else {
        setError(res.error ?? "AI scoring failed");
      }
    } finally {
      setAiScoring(false);
    }
  };

  const competitors = state?.competitors ?? [];
  const gaps = state?.gaps ?? [];
  const averages = state?.averages;
  // const lastBenchmarkedAt = state?.lastBenchmarkedAt;

  const sortedGaps = useMemo(
    () => [...gaps].sort((a, b) => b.volume - a.volume || b.opportunity_score - a.opportunity_score),
    [gaps]
  );

  const hasBenchmark = competitors.length > 0;

  return (
    <div className="space-y-4 pb-16 max-w-full mx-auto relative">
      {/* <div className="pt-2 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {lastBenchmarkedAt ? (
            <p className="mt-2 text-[12px] text-text-tertiary">
              Last benchmark:{" "}
              {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(lastBenchmarkedAt))}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleRun}
            disabled={running}
            className="rounded-[32px] bg-brand-primary px-6 py-2.5 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
          >
            {running ? (
              <>
                <div className="w-4 h-4 border-2 border-brand-on-primary/30 border-t-brand-on-primary rounded-full animate-spin" />
                Benchmarking…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
                {hasBenchmark ? "Re-benchmark" : "Run benchmark"}
              </>
            )}
          </button>
        </div>
      </div> */}

      {error && (
        <div className="rounded-[16px] border border-brand-coral/20 bg-brand-coral/10 p-5 text-[14px] text-brand-coral">{error}</div>
      )}
      {lastRunSummary && !error && (
        <div className="rounded-[16px] border border-brand-action/20 bg-brand-action/5 p-5 text-[14px] text-brand-action">
          {lastRunSummary}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 w-full animate-pulse rounded-[16px] border border-border-subtle bg-surface-elevated" />
          ))}
        </div>
      ) : !hasBenchmark ? (
        <div className="rounded-[22px] border border-dashed border-border-strong bg-surface-secondary py-24 text-center">
          <div className="mb-6 flex justify-center">
            <div className="w-16 h-16 rounded-[16px] bg-surface-tertiary flex items-center justify-center text-text-primary border border-border-subtle">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
              </svg>
            </div>
          </div>
          <h3 className="mb-3 text-[24px] font-normal tracking-[-0.24px] text-text-primary font-display">No benchmark yet</h3>
          <p className="mb-8 text-[16px] text-text-tertiary max-w-lg mx-auto leading-relaxed">
            We&apos;ll pull the real SERP competitors for your niche, scrape their best pages via Jina, extract the
            keywords they rank for, and score every opportunity with DataForSEO volumes.
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
        <>
          {insightsView === "opportunities" && (
            <OpportunityDashboard
              projectId={projectId}
              gaps={sortedGaps}
              hasGapsInProject={gaps.length > 0}
              averages={averages}
              generatingKeyword={generatingKeyword}
              aiGapKeywordSet={aiGapKeywordSet}
              massSelectMode={massSelectMode}
              selectedGapIds={selectedGapIds}
              onToggleGapSelected={toggleGapRowSelected}
              bulkSchedulingGaps={bulkSchedulingGaps}
              viewMenuRef={viewMenuRef}
              viewMenuOpen={viewMenuOpen}
              setViewMenuOpen={setViewMenuOpen}
              setInsightsView={setInsightsView}
              projectGapsCount={gaps.length}
              competitorsCount={competitors.length}
              exitGapMassSelect={exitGapMassSelect}
              onStartMassSelect={() => {
                setMassSelectMode(true);
                setSelectedGapIds(new Set());
              }}
              onBulkScheduleGaps={() => void handleBulkScheduleGaps()}
              aiScoring={aiScoring}
              onRunAiScoring={() => void handleRunAiScoring()}
              aiScoringDone={aiScoringDone}
              onLoadMoreAhrefs={() => void handleLoadMoreAhrefs()}
              loadingMoreAhrefs={loadingMoreAhrefs}
              calendarMap={calendarMap}
            />
          )}

          {insightsView === "competitors" && (
            <CompetitorList
              competitors={competitors}
              expandedId={expandedCompetitor}
              onToggle={id => setExpandedCompetitor(prev => (prev === id ? null : id))}
              viewMenuRef={viewMenuRef}
              viewMenuOpen={viewMenuOpen}
              setViewMenuOpen={setViewMenuOpen}
              setInsightsView={setInsightsView}
              projectGapsCount={gaps.length}
              competitorsCount={competitors.length}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────



type OpportunityWorkspaceTab = "all" | "unscheduled" | "scheduled";

function InsightsViewDropdown({
  menuRef,
  menuOpen,
  setMenuOpen,
  insightsView,
  setInsightsView,
  gapsCount,
  competitorsCount,
}: {
  menuRef: RefObject<HTMLDivElement | null>;
  menuOpen: boolean;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  insightsView: InsightsView;
  setInsightsView: Dispatch<SetStateAction<InsightsView>>;
  gapsCount: number;
  competitorsCount: number;
}) {
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen(o => !o)}
        className="inline-flex h-8 w-[210px] justify-between items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,colors] duration-200 hover:border-border-strong hover:text-text-primary"
        aria-expanded={menuOpen}
        aria-haspopup="listbox"
      >
        <span>{insightsView === "opportunities" ? "Opportunity dashboard" : "Competitor list"}</span>
        <svg className="h-3.5 w-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {menuOpen ? (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 min-w-[14rem] rounded-[8px] border border-border-subtle bg-surface-elevated py-1 shadow-lg"
        >
          <button
            type="button"
            role="option"
            aria-selected={insightsView === "opportunities"}
            className="block w-full px-3 py-2 text-left text-[13px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            onClick={() => {
              setInsightsView("opportunities");
              setMenuOpen(false);
            }}
          >
            Opportunity dashboard ({gapsCount})
          </button>
          <button
            type="button"
            role="option"
            aria-selected={insightsView === "competitors"}
            className="block w-full px-3 py-2 text-left text-[13px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            onClick={() => {
              setInsightsView("competitors");
              setMenuOpen(false);
            }}
          >
            Competitor list ({competitorsCount})
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ─── AI Score helpers ────────────────────────────────────────────────────────

type GapAiEvalData = NonNullable<KeywordGap['ai_eval_data']>;

function AI_GAP_SCORE_CATEGORY(score: number): { icon: string; colorClass: string; label: string } {
  if (score >= 75) return { icon: "★", colorClass: "text-[#10b981] border-[#10b981]/25 bg-[#10b981]/10", label: "High opportunity" };
  if (score >= 55) return { icon: "◆", colorClass: "text-[#f59e0b] border-[#f59e0b]/25 bg-[#f59e0b]/10", label: "Good fit" };
  if (score >= 35) return { icon: "▸", colorClass: "text-brand-action border-brand-action/25 bg-brand-action/10", label: "Moderate" };
  return { icon: "▾", colorClass: "text-text-tertiary border-border-subtle bg-surface-elevated", label: "Low priority" };
}

function GapAiScoreTooltip({ data, score }: { data: GapAiEvalData; score: number }) {
  const cat = AI_GAP_SCORE_CATEGORY(score);
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
    <div className="w-[340px] space-y-3 p-1">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-[6px] border px-2.5 py-1 text-[13px] font-bold tabular-nums ${cat.colorClass}`}>
            {cat.icon} {score}
          </span>
          <span className="text-[12px] font-semibold text-text-primary">{cat.label}</span>
        </div>
        <span className="rounded-full border border-border-subtle bg-surface-secondary px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-tertiary">
          {data.category?.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Dimension bars */}
      {dims.length > 0 && (
        <div className="space-y-1.5">
          {dims.map(d => (
            <div key={d.label} className="flex items-center gap-2">
              <span className="w-[100px] shrink-0 text-[10px] text-text-tertiary">{d.label}</span>
              <div className="flex-1 h-1 rounded-full bg-surface-tertiary overflow-hidden">
                <div
                  className={`h-full rounded-full ${d.val >= 7 ? 'bg-[#10b981]' : d.val >= 4 ? 'bg-[#f59e0b]' : 'bg-brand-coral'}`}
                  style={{ width: `${d.val * 10}%` }}
                />
              </div>
              <span className="w-4 text-right text-[10px] font-mono text-text-tertiary">{d.val}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {data.reasoning.summary && (
        <p className="text-[12px] leading-relaxed text-text-secondary">{data.reasoning.summary}</p>
      )}

      {/* Strengths */}
      {data.reasoning.strengths?.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#10b981]">Strengths</p>
          <ul className="space-y-0.5">
            {data.reasoning.strengths.slice(0, 2).map((s, i) => (
              <li key={i} className="text-[11px] text-text-secondary leading-snug">+ {s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Weaknesses */}
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

      {/* Opportunities */}
      {(data.reasoning.rankingOpportunity || data.reasoning.contentOpportunity) && (
        <div className="space-y-1.5 rounded-[8px] bg-surface-secondary border border-border-subtle/60 p-2.5">
          {data.reasoning.rankingOpportunity && (
            <p className="text-[11px] text-text-secondary"><span className="font-semibold text-text-primary">Ranking: </span>{data.reasoning.rankingOpportunity}</p>
          )}
          {data.reasoning.contentOpportunity && (
            <p className="text-[11px] text-text-secondary"><span className="font-semibold text-text-primary">Content: </span>{data.reasoning.contentOpportunity}</p>
          )}
        </div>
      )}
    </div>
  );
}

type GapSortColumn = "keyword" | "gap_type" | "volume" | "competitor_weakness" | "ai_eval_score" | "action";
type SortDir = "asc" | "desc";

function defaultGapSortDir(col: GapSortColumn): SortDir {
  return col === "keyword" || col === "gap_type" ? "asc" : "desc";
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
    case "competitor_weakness":
      return m * ((a.competitor_weakness || 0) - (b.competitor_weakness || 0));
    case "ai_eval_score":
      return m * ((a.ai_eval_score ?? 0) - (b.ai_eval_score ?? 0));
    default:
      return 0;
  }
}

function OpportunityDashboard({
  projectId,
  gaps,
  hasGapsInProject,
  averages,
  generatingKeyword,
  aiGapKeywordSet,
  massSelectMode,
  selectedGapIds,
  onToggleGapSelected,
  bulkSchedulingGaps,
  viewMenuRef,
  viewMenuOpen,
  setViewMenuOpen,
  setInsightsView,
  projectGapsCount,
  competitorsCount,
  exitGapMassSelect,
  onStartMassSelect,
  onBulkScheduleGaps,
  aiScoring,
  onRunAiScoring,
  aiScoringDone,
  onLoadMoreAhrefs,
  loadingMoreAhrefs,
  calendarMap,
}: {
  projectId: string;
  gaps: KeywordGap[];
  hasGapsInProject: boolean;
  averages?: BenchmarkState["averages"];
  generatingKeyword: string | null;
  aiGapKeywordSet: Set<string>;
  massSelectMode: boolean;
  selectedGapIds: Set<string>;
  onToggleGapSelected: (gapId: string) => void;
  bulkSchedulingGaps: boolean;
  viewMenuRef: RefObject<HTMLDivElement | null>;
  viewMenuOpen: boolean;
  setViewMenuOpen: Dispatch<SetStateAction<boolean>>;
  setInsightsView: Dispatch<SetStateAction<InsightsView>>;
  projectGapsCount: number;
  competitorsCount: number;
  exitGapMassSelect: () => void;
  onStartMassSelect: () => void;
  onBulkScheduleGaps: () => void;
  aiScoring: boolean;
  onRunAiScoring: () => void;
  aiScoringDone: boolean;
  onLoadMoreAhrefs: () => void;
  loadingMoreAhrefs: boolean;
  calendarMap: Map<string, any>;
}) {
  const [workspaceTab, setWorkspaceTab] = useState<OpportunityWorkspaceTab>("all");
  const [sortCol, setSortCol] = useState<GapSortColumn>("volume");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [rowContentTypes, setRowContentTypes] = useState<Record<string, ContentType>>({});

  const getRowContentType = useCallback((keyword: string) => {
    return rowContentTypes[keyword.toLowerCase()] ?? "blog";
  }, [rowContentTypes]);

  const setRowContentType = useCallback((keyword: string, type: ContentType) => {
    setRowContentTypes(prev => ({
      ...prev,
      [keyword.toLowerCase()]: type
    }));
  }, []);



  const articleTypeToContentType = (articleType: string): ContentType => {
    const typeMap: Record<string, ContentType> = {
      "Blog article": "blog",
      "Ebook": "ebook",
      "Whitepaper": "whitepaper",
      "LinkedIn post": "linkedin",
    };
    return typeMap[articleType] ?? "blog";
  };

  const resolveContentType = useCallback((keywordText: string, keywordId?: string, aiEvalData?: any) => {
    const entry = (keywordId ? calendarMap.get(keywordId) : null) || calendarMap.get(keywordText.toLowerCase());
    if (entry) {
      return articleTypeToContentType(entry.article_type);
    }
    const recommended = aiEvalData?.recommended_content_type;
    const supportedTypes = ["blog", "ebook", "whitepaper", "linkedin"];
    if (recommended && supportedTypes.includes(recommended)) {
      return rowContentTypes[keywordText.toLowerCase()] ?? recommended;
    }
    return rowContentTypes[keywordText.toLowerCase()] ?? "blog";
  }, [calendarMap, rowContentTypes]);

  const toggleSort = (col: GapSortColumn) => {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir(defaultGapSortDir(col));
    }
  };

  const sortMark = (col: GapSortColumn) =>
    sortCol !== col ? (
      <span className="ml-0.5 text-[11px] font-normal normal-case tracking-normal text-text-tertiary/40" aria-hidden>↕</span>
    ) : (
      <span className="ml-0.5 text-brand-action" aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
    );

  const thBtn = "group inline-flex items-center gap-0.5 rounded-[6px] px-1 py-0.5 -mx-1 text-left uppercase tracking-widest hover:bg-surface-hover/80 hover:text-text-secondary transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-action/40 cursor-pointer";

  const workspaceCounts = useMemo(() => {
    let all = 0;
    let unscheduled = 0;
    let scheduled = 0;
    for (const g of gaps) {
      all += 1;
      const isSch = calendarMap.has(g.keyword.toLowerCase());
      if (isSch) scheduled += 1;
      else unscheduled += 1;
    }
    return { all, unscheduled, scheduled };
  }, [gaps, calendarMap]);

  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Reset visible count whenever the tab or sort changes so the user always
  // sees the top of the new list.
  useEffect(() => {
    const timer = window.setTimeout(() => setVisibleCount(PAGE_SIZE), 0);
    return () => window.clearTimeout(timer);
  }, [workspaceTab, sortCol, sortDir]);

  const loadMore = () => {
    const el = tableScrollRef.current;
    const scrollBefore = el?.scrollTop ?? 0;
    setVisibleCount(c => c + PAGE_SIZE);
    // After React re-renders with more rows, nudge the scroll to reveal them.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!el) return;
        const rowHeight = 52; // approximate px per row
        el.scrollTo({ top: scrollBefore + rowHeight * PAGE_SIZE * 0.35, behavior: "smooth" });
      });
    });
  };

  const allFilteredGaps = useMemo(() => {
    const filtered = gaps.filter(g => {
      if (workspaceTab === "all") return true;
      const isSch = calendarMap.has(g.keyword.toLowerCase());
      if (workspaceTab === "scheduled") return isSch;
      if (workspaceTab === "unscheduled") return !isSch;
      return true;
    });
    return [...filtered].sort((a, b) => compareGaps(a, b, sortCol, sortDir));
  }, [gaps, workspaceTab, calendarMap, sortCol, sortDir]);

  const displayedGaps = useMemo(
    () => allFilteredGaps.slice(0, visibleCount),
    [allFilteredGaps, visibleCount]
  );

  const hasMore = visibleCount < allFilteredGaps.length;
  const remaining = allFilteredGaps.length - visibleCount;

  const OPPORTUNITY_TAB_ITEMS: Array<{ id: OpportunityWorkspaceTab; label: string; count: number }> = [
    { id: "all", label: "All", count: workspaceCounts.all },
    { id: "unscheduled", label: "Unscheduled", count: workspaceCounts.unscheduled },
    { id: "scheduled", label: "Scheduled", count: workspaceCounts.scheduled },
  ];

  return (
    <div className="space-y-6">
      {!hasGapsInProject ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <InsightsViewDropdown
            menuRef={viewMenuRef}
            menuOpen={viewMenuOpen}
            setMenuOpen={setViewMenuOpen}
            insightsView="opportunities"
            setInsightsView={setInsightsView}
            gapsCount={projectGapsCount}
            competitorsCount={competitorsCount}
          />
        </div>
      ) : null}

      {hasGapsInProject && aiScoringDone && (
        <div className="flex items-center gap-3 rounded-[12px] border border-[#8b5cf6]/25 bg-[#8b5cf6]/10 px-4 py-3 text-[13px] text-[#8b5cf6]">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <span>AI scoring complete — scores are now visible in the AI Score column.</span>
        </div>
      )}

      {hasGapsInProject ? (
        <section className="space-y-4">
          {/* <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-[28px] font-normal tracking-[-0.28px] text-text-primary font-display">Keyword list</h2>
          </div> */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PillTabFilterBar<OpportunityWorkspaceTab>
              className="min-w-0 flex-1"
              items={OPPORTUNITY_TAB_ITEMS}
              activeId={workspaceTab}
              onChange={setWorkspaceTab}
            />
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {gaps.length > 0 && !massSelectMode && (
                <button
                  type="button"
                  onClick={onRunAiScoring}
                  disabled={aiScoring}
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
              {gaps.length > 0 ? (
                <>
                  {!massSelectMode ? (
                    <button
                      type="button"
                      aria-label="Mass select opportunities"
                      onClick={onStartMassSelect}
                      className="inline-flex h-8 shrink-0 cursor-pointer flex-row items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,opacity,colors] duration-200 ease-out hover:border-border-strong hover:text-text-primary hover:-translate-y-px active:scale-95 motion-safe:hover:scale-105"
                    >
                      <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 opacity-75" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round">
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
                        onClick={onBulkScheduleGaps}
                        disabled={bulkSchedulingGaps || selectedGapIds.size === 0}
                        className={`inline-flex h-8 w-38 shrink-0 cursor-pointer flex-col justify-center whitespace-nowrap rounded-full border border-brand-action/70 bg-brand-action px-2 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide text-brand-on-primary shadow-sm transition-[transform,box-shadow,opacity] duration-200 ease-out hover:-translate-y-px hover:shadow-md hover:shadow-brand-action/20 active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-35 motion-safe:hover:scale-105 ${bulkSchedulingGaps ? "animate-pulse cursor-wait" : ""}`}
                      >
                        <span className="block max-w-full overflow-hidden truncate text-center tabular-nums">
                          {bulkSchedulingGaps ? "…" : selectedGapIds.size > 0 ? `Schedule (${selectedGapIds.size})` : "Schedule"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={exitGapMassSelect}
                        disabled={bulkSchedulingGaps}
                        className="inline-flex h-8 min-w-19 shrink-0 cursor-pointer flex-col justify-center whitespace-nowrap rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,opacity,colors] duration-200 ease-out hover:border-border-strong hover:text-text-primary hover:-translate-y-px active:scale-95 disabled:opacity-35 motion-safe:hover:scale-105"
                        title="Leave mass-select mode"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </>
              ) : null}
              <InsightsViewDropdown
                menuRef={viewMenuRef}
                menuOpen={viewMenuOpen}
                setMenuOpen={setViewMenuOpen}
                insightsView="opportunities"
                setInsightsView={setInsightsView}
                gapsCount={projectGapsCount}
                competitorsCount={competitorsCount}
              />
            </div>
          </div>
        </section>
      ) : null}

      {displayedGaps.length === 0 ? (
        <EmptyState
          variant="card"
          title={
            !hasGapsInProject
              ? "No opportunities yet"
              : workspaceTab !== "all"
                ? "No opportunities match this tab"
                : "No opportunities match this view"
          }
          body={
            !hasGapsInProject
              ? "Run or re-run a benchmark from the button above."
              : undefined
          }
        />
      ) : (
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden flex flex-col" style={{ height: "560px" }}>
          <div ref={tableScrollRef} className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
            <table className="w-full min-w-[1060px] text-left">
              <thead className="sticky top-0 z-10 bg-surface-secondary text-[12px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                <tr>
                  {/* mass-select col */}
                  <th
                    scope="col"
                    className={`border-border-subtle align-middle transition-[width,padding] duration-300 ease-out ${
                      massSelectMode ? "w-12 px-4 py-3 opacity-100" : "w-0 max-w-0 border-0 p-0 opacity-0"
                    } overflow-hidden`}
                  >
                    <span className={`block min-h-5 transition-all duration-300 ease-out ${massSelectMode ? "opacity-100" : "opacity-0"}`} aria-hidden />
                  </th>
                  {/* Keyword */}
                  <th className="px-4 py-3 min-w-[200px]">
                    <button type="button" className={thBtn} onClick={() => toggleSort("keyword")}>
                      Keyword{sortMark("keyword")}
                    </button>
                  </th>
                  {/* Volume */}
                  <th className="px-4 py-3 text-right">
                    <button type="button" className={thBtn} onClick={() => toggleSort("volume")}>
                      Volume{sortMark("volume")}
                    </button>
                  </th>
                  {/* KD */}
                  <th className="px-4 py-3 text-center">
                    <Tooltip placement="above" content="Keyword Difficulty (0–100). Higher = harder to rank.">
                      <span className="uppercase tracking-widest text-[12px] font-bold cursor-default">KD</span>
                    </Tooltip>
                  </th>
                  {/* Rank */}
                  <th className="px-4 py-3 text-center">
                    <Tooltip placement="above" content="Competitor's current ranking position for this keyword.">
                      <span className="uppercase tracking-widest text-[12px] font-bold cursor-default">Rank</span>
                    </Tooltip>
                  </th>
                  {/* Intent */}
                  <th className="px-4 py-3 text-center">
                    <Tooltip placement="above" content="Search intent: Informational · Navigational · Commercial · Transactional">
                      <span className="uppercase tracking-widest text-[12px] font-bold cursor-default">Intent</span>
                    </Tooltip>
                  </th>
                  {/* AI Score */}
                  <th className="px-4 py-3 text-center">
                    <button type="button" className={thBtn} onClick={() => toggleSort("ai_eval_score")}>
                      AI Score{sortMark("ai_eval_score")}
                    </button>
                  </th>
                  {/* Ranking page */}
                  <th className="px-4 py-3">
                    <Tooltip placement="above" content="The competitor's URL currently ranking for this keyword.">
                      <span className="uppercase tracking-widest text-[12px] font-bold cursor-default">Ranking page</span>
                    </Tooltip>
                  </th>
                  {/* Content Type */}
                  <th className="px-4 py-3 text-center">Content Type</th>
                  {/* Action */}
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/60">
                {displayedGaps.map(g => {
                  const kd = g.kd;
                  const position = g.position;
                  return (
                    <tr
                      key={g.id}
                      onClick={e => {
                        const t = e.target as HTMLElement;
                        if (t.closest("button, input, select, textarea, label, [data-keyword-action], [role='menu'], [role='menuitem'], [role='listbox'], [role='option'], a")) return;
                        if (massSelectMode && !bulkSchedulingGaps) onToggleGapSelected(g.id);
                      }}
                      className={`transition-colors hover:bg-surface-hover ${
                        calendarMap.has(g.keyword.toLowerCase()) ? "bg-brand-action/[0.07]" : ""
                      } ${massSelectMode && !bulkSchedulingGaps ? "cursor-pointer" : ""} ${
                        selectedGapIds.has(g.id) ? "bg-surface-secondary/95 ring-1 ring-inset ring-brand-action/25" : ""
                      }`}
                    >
                      {/* mass-select checkbox */}
                      <td className={`border-border-subtle align-middle transition-[width,padding] duration-300 ease-out ${massSelectMode ? "w-12 px-4 py-3 opacity-100" : "w-0 max-w-0 border-0 p-0 opacity-0"} overflow-hidden`}>
                        <span className={`flex justify-center transition-all duration-300 ease-out ${massSelectMode ? "opacity-100 scale-100 translate-x-0" : "pointer-events-none -translate-x-2 scale-90 opacity-0"}`}>
                          <input
                            type="checkbox"
                            checked={selectedGapIds.has(g.id)}
                            onChange={() => onToggleGapSelected(g.id)}
                            onClick={e => e.stopPropagation()}
                            disabled={bulkSchedulingGaps || !massSelectMode}
                            aria-label={`Select opportunity ${g.keyword}`}
                            className="rounded border-border-subtle text-brand-action focus:ring-brand-action"
                          />
                        </span>
                      </td>
                      {/* Keyword */}
                      <td className="px-4 py-3 max-w-[240px] w-[240px] min-w-0">
                        <div className="flex items-center gap-2 w-full min-w-0">
                          <Tooltip placement="above" content={g.keyword} className="w-full min-w-0 !justify-start">
                            <p className="truncate text-[14px] font-medium text-text-primary cursor-help w-full min-w-0">{g.keyword}</p>
                          </Tooltip>
                          {aiGapKeywordSet.has(g.keyword.toLowerCase()) ? (
                            <span className="shrink-0 rounded-full border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8b5cf6]">AI pick</span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[11px] text-text-tertiary">{g.top_competitor_domain}</p>
                      </td>
                      {/* Volume */}
                      <td className="px-4 py-3 text-right text-[14px] font-mono text-text-secondary tabular-nums">
                        {g.volume > 0 ? g.volume.toLocaleString() : "—"}
                      </td>
                      {/* KD */}
                      <td className="px-4 py-3 text-center">
                        {typeof kd === "number" && kd > 0 ? (
                          <span className={`text-[13px] font-semibold tabular-nums ${
                            kd >= 70 ? "text-brand-coral" :
                            kd >= 40 ? "text-[#f59e0b]" :
                            "text-[#10b981]"
                          }`}>{kd}</span>
                        ) : <span className="text-[12px] text-text-tertiary">—</span>}
                      </td>
                      {/* Rank */}
                      <td className="px-4 py-3 text-center">
                        {typeof position === "number" && position > 0 ? (
                          <span className={`text-[13px] font-semibold tabular-nums ${
                            position <= 3 ? "text-[#10b981]" :
                            position <= 10 ? "text-[#f59e0b]" :
                            "text-text-secondary"
                          }`}>#{position}</span>
                        ) : <span className="text-[12px] text-text-tertiary">—</span>}
                      </td>
                      {/* Intent */}
                      <td className="px-4 py-3 text-center">
                        {(() => {
                          const activeIntents = [
                            g.is_transactional && { label: "Transactional", color: "text-[#10b981]" },
                            g.is_commercial && { label: "Commercial", color: "text-[#f59e0b]" },
                            g.is_informational && { label: "Informational", color: "text-[#60a5fa]" },
                            g.is_navigational && { label: "Navigational", color: "text-[#a78bfa]" },
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
                        })()}
                      </td>
                      {/* AI Score */}
                      <td className="px-4 py-3 text-center">
                        {g.ai_eval_score && g.ai_eval_data ? (
                          <Tooltip placement="above" content={<GapAiScoreTooltip data={g.ai_eval_data} score={g.ai_eval_score} />}>
                            {(() => {
                              const cat = AI_GAP_SCORE_CATEGORY(g.ai_eval_score);
                              return (
                                <span className={`inline-flex cursor-default items-center gap-1 rounded-[6px] border px-2.5 py-1 text-[12px] font-bold tabular-nums ${cat.colorClass}`}>
                                  {cat.icon} {g.ai_eval_score}
                                </span>
                              );
                            })()}
                          </Tooltip>
                        ) : (
                          <span className="text-[12px] text-text-tertiary">—</span>
                        )}
                      </td>
                      {/* Ranking page */}
                      <td className="px-4 py-3 max-w-[220px]">
                        {g.top_competitor_url ? (
                          <a
                            href={g.top_competitor_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={g.top_competitor_url}
                            className="block truncate text-[12px] text-brand-action/80 hover:text-brand-action hover:underline"
                          >
                            {compactUrl(g.top_competitor_url)} ↗
                          </a>
                        ) : <span className="text-[12px] text-text-tertiary">—</span>}
                      </td>
                      {/* Content Type */}
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                        {(() => {
                          const keywordText = g.keyword;
                          const entry = calendarMap.get(keywordText.toLowerCase());
                          const isScheduled = !!entry;
                          const isGenerated = !!entry?.blog;
                          const currentType = resolveContentType(keywordText, undefined, g.ai_eval_data);

                          const recommended = (g.ai_eval_data as any)?.recommended_content_type;
                          const options: ContentType[] = ["blog", "ebook", "whitepaper", "linkedin"];
                          const labels: Record<ContentType, string> = {
                            blog: "Blog article",
                            ebook: "Ebook",
                            whitepaper: "Whitepaper",
                            linkedin: "LinkedIn post",
                          };

                           return (
                            <select
                              value={currentType}
                              onChange={(e) => setRowContentType(keywordText, e.target.value as ContentType)}
                              disabled={isScheduled || isGenerated}
                              className="w-36 h-8 text-[12px] bg-surface-secondary border border-border-subtle hover:border-border-strong rounded-md transition-colors px-2 outline-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                              {options.map(type => (
                                <option key={type} value={type}>
                                  {labels[type]}{type === recommended ? " ✨" : ""}
                                </option>
                              ))}
                            </select>
                          );
                        })()}
                      </td>
                      {/* Action */}
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                        {(() => {
                          const entry = calendarMap.get(g.keyword.toLowerCase());
                          const selectedType = resolveContentType(g.keyword, undefined, g.ai_eval_data);
                          return (
                            <KeywordActionCell
                              projectId={projectId}
                              keyword={g.keyword}
                              sourceType="competitor_gap"
                              contentType={selectedType}
                              scheduledDate={entry?.scheduled_date}
                              blogId={entry?.blog?.id}
                              volume={g.volume}
                              kd={g.kd}
                              intent={
                                g.is_transactional ? "transactional" :
                                g.is_commercial ? "commercial" :
                                g.is_informational ? "informational" :
                                g.is_navigational ? "navigational" : "informational"
                              }
                              competitorDomain={g.top_competitor_domain}
                              rankingUrl={g.top_competitor_url}
                              rank={g.position ?? undefined}
                            />
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Load more footer */}
          {hasMore && (
            <div className="shrink-0 border-t border-border-subtle bg-surface-secondary px-4 py-2.5 flex items-center justify-between gap-4">
              <span className="text-[12px] text-text-tertiary">
                Showing <span className="font-semibold text-text-secondary">{displayedGaps.length}</span> of{" "}
                <span className="font-semibold text-text-secondary">{allFilteredGaps.length}</span> keywords
              </span>
              <button
                type="button"
                onClick={loadMore}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-elevated px-4 py-1.5 text-[12px] font-medium text-text-secondary shadow-sm transition-colors hover:border-border-strong hover:text-text-primary"
              >
                Load {Math.min(remaining, PAGE_SIZE)} more
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          )}
          {!hasMore && allFilteredGaps.length > 0 && (
            <div className="shrink-0 border-t border-border-subtle bg-surface-secondary px-4 py-2.5 flex items-center justify-between gap-4">
              <span className="text-[12px] text-text-tertiary">
                {allFilteredGaps.length > PAGE_SIZE ? `All ${allFilteredGaps.length} keywords shown` : `${allFilteredGaps.length} keyword${allFilteredGaps.length === 1 ? "" : "s"}`}
              </span>
              <button
                type="button"
                onClick={onLoadMoreAhrefs}
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
                    Loading from Ahrefs…
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                    Load more from Ahrefs
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompetitorList({
  competitors,
  expandedId,
  onToggle,
  viewMenuRef,
  viewMenuOpen,
  setViewMenuOpen,
  setInsightsView,
  projectGapsCount,
  competitorsCount,
}: {
  competitors: Competitor[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  viewMenuRef: RefObject<HTMLDivElement | null>;
  viewMenuOpen: boolean;
  setViewMenuOpen: Dispatch<SetStateAction<boolean>>;
  setInsightsView: Dispatch<SetStateAction<InsightsView>>;
  projectGapsCount: number;
  competitorsCount: number;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end">
        <InsightsViewDropdown
          menuRef={viewMenuRef}
          menuOpen={viewMenuOpen}
          setMenuOpen={setViewMenuOpen}
          insightsView="competitors"
          setInsightsView={setInsightsView}
          gapsCount={projectGapsCount}
          competitorsCount={competitorsCount}
        />
      </div>
      {competitors.map(c => {
        const expanded = expandedId === c.id;
        return (
          <div
            key={c.id}
            className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 p-5 hover:bg-surface-hover transition-colors">
              <button
                type="button"
                onClick={() => onToggle(c.id)}
                className="flex flex-1 items-center gap-4 min-w-0 text-left"
              >
                <DomainLogo domain={c.domain} />
                <div className="min-w-0">
                  <p className="text-[16px] font-medium text-text-primary truncate">{c.domain}</p>
                  <p className="mt-1 text-[13px] text-text-tertiary truncate">
                    {c.pages_scraped} pages analyzed · {c.top_pages?.length ?? 0} snapshots
                  </p>
                </div>
              </button>
              <div
                className="flex shrink-0 items-center gap-3"
                onClick={e => e.stopPropagation()}
                onPointerDown={e => e.stopPropagation()}
              >
                {/* Note: In Competitor List, we don't schedule content directly, we just keep the expand toggle */}
                <button
                  type="button"
                  onClick={() => onToggle(c.id)}
                  aria-expanded={expanded}
                  aria-label={expanded ? "Collapse competitor" : "Expand competitor"}
                  className="text-text-tertiary p-1 rounded-md hover:bg-surface-secondary hover:text-text-secondary transition-colors"
                >
                  <svg className={`w-5 h-5 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              </div>
            </div>
            {expanded ? (
              <div className="border-t border-border-subtle p-5 space-y-6 bg-surface-secondary">
                {c.recommendations?.length ? (
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-widest text-text-tertiary mb-3">
                      Recommendations
                    </p>
                    <ul className="space-y-1.5 text-[14px] text-text-secondary">
                      {c.recommendations.map((r, i) => (
                        <li key={i}>· {r}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {c.top_pages?.length ? (
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-widest text-text-tertiary mb-3">
                      Pages sampled
                    </p>
                    <div className="overflow-x-auto rounded-[8px] border border-border-subtle bg-surface-elevated">
                      <table className="w-full text-left text-[13px]">
                        <thead className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle bg-surface-secondary">
                          <tr>
                            <th className="p-3">Page</th>
                            <th className="p-3 text-right">Words</th>
                            <th className="p-3 text-center">H2</th>
                            <th className="p-3 text-center">H3</th>
                            <th className="p-3 text-center">Images</th>
                            <th className="p-3 text-center">Int / Ext</th>
                            <th className="p-3 text-center">FAQ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle/60">
                          {c.top_pages.map((p, i) => (
                            <tr key={`${p.url}-${i}`} className="text-text-secondary hover:bg-surface-hover transition-colors">
                              <td className="p-3 max-w-[280px] truncate">
                                {p.url ? (
                                  <a
                                    href={p.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-brand-action hover:underline"
                                    title={p.title}
                                  >
                                    {p.title || p.url}
                                  </a>
                                ) : (
                                  <span>{p.title}</span>
                                )}
                              </td>
                              <td className="p-3 text-right font-mono">{p.word_count.toLocaleString()}</td>
                              <td className="p-3 text-center font-mono">{p.h2_count}</td>
                              <td className="p-3 text-center font-mono">{p.h3_count}</td>
                              <td className="p-3 text-center font-mono">{p.image_count}</td>
                              <td className="p-3 text-center font-mono">
                                {p.internal_link_count} / {p.external_link_count}
                              </td>
                              <td className="p-3 text-center font-mono">{p.has_faq ? "✓" : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
