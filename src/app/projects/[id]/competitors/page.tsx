"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
import type { BenchmarkState } from "@/app/actions/competitor-actions";
import { competitorsApi } from "@/frontend/api/competitors";
import type { KeywordStatus } from "@/lib/types";
import { useAppSelector, selectAiSuggestedGapKeywords } from "@/lib/redux/hooks";
import { Button, PageHeader, EmptyState } from "@/components/common";
import { scoreCompetitorKeywordsWithAI } from "@/app/actions/keyword-actions";
import { motion } from "framer-motion";
import {
  loadApprovedGapKeywords, persistApprovedGapKeywords,
  loadRejectedGapKeywords, persistRejectedGapKeywords,
  loadCompetitorStatuses, persistCompetitorStatuses,
} from "./_components/competitor-storage";
import { OpportunityDashboard } from "./_components/OpportunityDashboard";
import { CompetitorList } from "./_components/CompetitorList";
import { type InsightsView } from "./_components/InsightsViewDropdown";

export default function CompetitorsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
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
  const [bulkApprovingGaps, setBulkApprovingGaps] = useState(false);
  const [generatingKeyword, setGeneratingKeyword] = useState<string | null>(null);
  const [approvedGapKeywords, setApprovedGapKeywords] = useState<Set<string>>(new Set());
  const [rejectedGapKeywords, setRejectedGapKeywords] = useState<Set<string>>(new Set());
  const [competitorStatuses, setCompetitorStatuses] = useState<Record<string, KeywordStatus>>({});
  const [lastRunSummary, setLastRunSummary] = useState<string>("");
  const [aiScoring, setAiScoring] = useState(false);
  const [aiScoringDone, setAiScoringDone] = useState(false);

  const aiSuggestedGapKeywords = useAppSelector(state => selectAiSuggestedGapKeywords(state, projectId));
  const aiGapKeywordSet = useMemo(() => new Set(aiSuggestedGapKeywords.map(k => k.toLowerCase())), [aiSuggestedGapKeywords]);

  const { data: state, isLoading: loading } = useQuery<BenchmarkState>({
    queryKey: COMPETITORS_KEY,
    queryFn: () => competitorsApi.benchmark(projectId),
    enabled: !!projectId,
    ...DEFAULT_QUERY_OPTIONS,
  });

  useEffect(() => {
    if (!projectId) return;
    setApprovedGapKeywords(loadApprovedGapKeywords(projectId));
    setRejectedGapKeywords(loadRejectedGapKeywords(projectId));
    setCompetitorStatuses(loadCompetitorStatuses(projectId));
  }, [projectId]);

  useEffect(() => {
    if (!viewMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) setViewMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [viewMenuOpen]);

  const handleLoadMoreAhrefs = async () => {
    setLoadingMoreAhrefs(true);
    setError("");
    const res = await competitorsApi.loadMoreFromAhrefs(projectId);
    if (!res.success) setError(res.error ?? "Failed to load more from Ahrefs");
    else if (res.added > 0) await queryClient.invalidateQueries({ queryKey: COMPETITORS_KEY });
    setLoadingMoreAhrefs(false);
  };

  const handleRun = async () => {
    setRunning(true);
    setError("");
    const res = await competitorsApi.runBenchmark(projectId);
    if (res.trace?.length) {
      console.groupCollapsed(`[Competitors] Benchmark — ${res.competitorsFound ?? 0} competitors · ${res.pagesScraped ?? 0} pages · ${res.gapsFound ?? 0} gaps`);
      for (const t of res.trace) {
        if (t.ok) console.log(t.label, t.info ?? "", t.url ?? "");
        else console.warn(t.label, t.error ?? "", t.url ?? "");
      }
      console.groupEnd();
    }
    if (!res.success) {
      setError(res.error ?? "Benchmark failed");
    } else {
      setLastRunSummary(`Benchmarked ${res.competitorsFound ?? 0} competitors across ${res.pagesScraped ?? 0} pages. Found ${res.gapsFound ?? 0} opportunities.`);
      await queryClient.invalidateQueries({ queryKey: COMPETITORS_KEY });
    }
    setRunning(false);
  };

  const handleGenerateBlog = async (keyword: string) => {
    setGeneratingKeyword(keyword);
    const res = await competitorsApi.blogFromOpportunity(projectId, keyword);
    setGeneratingKeyword(null);
    if (res.success) {
      const key = keyword.toLowerCase();
      setApprovedGapKeywords(prev => {
        const next = new Set(prev);
        next.add(key);
        persistApprovedGapKeywords(projectId, next);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
    } else {
      setError(res.error ?? "Could not create calendar entry.");
    }
  };

  const handleGapKeywordStatus = (keyword: string, next: KeywordStatus) => {
    const k = keyword.toLowerCase();
    if (next === "approved") {
      setRejectedGapKeywords(prev => {
        if (!prev.has(k)) return prev;
        const n = new Set(prev); n.delete(k);
        persistRejectedGapKeywords(projectId, n);
        return n;
      });
      if (!approvedGapKeywords.has(k)) void handleGenerateBlog(keyword);
      return;
    }
    if (next === "rejected") {
      setRejectedGapKeywords(prev => {
        const n = new Set(prev); n.add(k);
        persistRejectedGapKeywords(projectId, n);
        return n;
      });
      setApprovedGapKeywords(prev => {
        if (!prev.has(k)) return prev;
        const n = new Set(prev); n.delete(k);
        persistApprovedGapKeywords(projectId, n);
        return n;
      });
      return;
    }
    setRejectedGapKeywords(prev => {
      if (!prev.has(k)) return prev;
      const n = new Set(prev); n.delete(k);
      persistRejectedGapKeywords(projectId, n);
      return n;
    });
    setApprovedGapKeywords(prev => {
      if (!prev.has(k)) return prev;
      const n = new Set(prev); n.delete(k);
      persistApprovedGapKeywords(projectId, n);
      return n;
    });
  };

  const handleCompetitorStatus = (competitorId: string, next: KeywordStatus) => {
    setCompetitorStatuses(prev => {
      const merged = { ...prev, [competitorId]: next };
      persistCompetitorStatuses(projectId, merged);
      return merged;
    });
  };

  const exitGapMassSelect = () => { setMassSelectMode(false); setSelectedGapIds(new Set()); };

  const toggleGapRowSelected = (gapId: string) => {
    setSelectedGapIds(prev => {
      const next = new Set(prev);
      if (next.has(gapId)) next.delete(gapId); else next.add(gapId);
      return next;
    });
  };

  const handleBulkApproveGaps = async () => {
    const rows = sortedGaps.filter(g => selectedGapIds.has(g.id));
    if (!rows.length) return;
    setBulkApprovingGaps(true);
    setError("");
    let anyOk = false;
    try {
      for (const g of rows) {
        const k = g.keyword.toLowerCase();
        if (approvedGapKeywords.has(k) || rejectedGapKeywords.has(k)) continue;
        const res = await competitorsApi.blogFromOpportunity(projectId, g.keyword);
        if (res.success) {
          anyOk = true;
          setApprovedGapKeywords(prev => {
            const n = new Set(prev); n.add(k);
            persistApprovedGapKeywords(projectId, n);
            return n;
          });
        } else {
          setError(res.error ?? "Could not queue an opportunity.");
        }
      }
      exitGapMassSelect();
      if (anyOk) {
        void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
      }
    } finally {
      setBulkApprovingGaps(false);
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
  const lastBenchmarkedAt = state?.lastBenchmarkedAt;
  const sortedGaps = useMemo(() => [...gaps].sort((a, b) => b.volume - a.volume), [gaps]);
  const hasBenchmark = competitors.length > 0;

  const lastBenchmarkedStr = lastBenchmarkedAt
    ? `Last benchmark: ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(lastBenchmarkedAt))}`
    : undefined;

  return (
    <div className="space-y-10 pb-16 max-w-full pl-4 pr-4 mx-auto">
      <PageHeader
        title="Competitor insights"
        description={`Benchmark the competitors winning your SERPs, diff their keyword coverage against yours, and publish the opportunities with one click.${lastBenchmarkedStr ? ` ${lastBenchmarkedStr}.` : ""}`}
        actions={
          <>
            <Button
              variant="secondary"
              shape="pill"
              size="md"
              onClick={() => { window.location.href = `/projects/${projectId}/keywords`; }}
            >
              Keywords
            </Button>
            <Button
              variant="primary"
              shape="pill"
              size="md"
              loading={running}
              onClick={() => void handleRun()}
              iconLeft={!running ? (
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
              ) : undefined}
            >
              {running ? "Benchmarking…" : hasBenchmark ? "Re-benchmark" : "Run benchmark"}
            </Button>
          </>
        }
      />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} className="space-y-10">
      {error && (
        <div className="rounded-[16px] border border-brand-coral/20 bg-brand-coral/10 p-5 text-[14px] text-brand-coral">{error}</div>
      )}
      {lastRunSummary && !error && (
        <div className="rounded-[16px] border border-brand-action/20 bg-brand-action/5 p-5 text-[14px] text-brand-action">{lastRunSummary}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 w-full animate-pulse rounded-[16px] border border-border-subtle bg-surface-elevated" />
          ))}
        </div>
      ) : !hasBenchmark ? (
        <EmptyState
          illustration={
            <svg viewBox="0 0 160 96" className="w-44 h-28" fill="none" aria-hidden>
              {/* Three bar chart columns — competitors */}
              <rect x="20" y="60" width="24" height="28" rx="3" stroke="var(--border-subtle)" strokeWidth="1.5" fill="var(--surface-secondary)" />
              <rect x="68" y="38" width="24" height="50" rx="3" stroke="var(--border-subtle)" strokeWidth="1.5" fill="var(--surface-secondary)" />
              <rect x="116" y="22" width="24" height="66" rx="3" stroke="var(--border-subtle)" strokeWidth="1.5" fill="var(--surface-secondary)" />
              {/* "Your brand" bar — highlighted */}
              <rect x="44" y="44" width="24" height="44" rx="3" fill="var(--brand-violet)" opacity="0.4" />
              <rect x="44" y="44" width="24" height="44" rx="3" stroke="var(--brand-violet)" strokeWidth="1.5" />
              {/* Gap arrow */}
              <path d="M56 38 L56 18" stroke="var(--brand-violet)" strokeWidth="1.5" strokeDasharray="3 2" />
              <path d="M52 22 L56 16 L60 22" stroke="var(--brand-violet)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              {/* Labels */}
              <text x="24" y="96" fontSize="7" fill="var(--text-tertiary)" fontFamily="sans-serif" textAnchor="middle">Comp A</text>
              <text x="56" y="96" fontSize="7" fill="var(--brand-violet)" fontFamily="sans-serif" textAnchor="middle" fontWeight="600">You</text>
              <text x="80" y="96" fontSize="7" fill="var(--text-tertiary)" fontFamily="sans-serif" textAnchor="middle">Comp B</text>
              <text x="128" y="96" fontSize="7" fill="var(--text-tertiary)" fontFamily="sans-serif" textAnchor="middle">Comp C</text>
            </svg>
          }
          title="No competitor benchmark yet"
          body="We'll crawl your competitors' organic rankings and surface gaps — keywords they rank for that you don't."
          hints={[
            "Add competitor domains in the panel above",
            "Run the benchmark to pull their keyword rankings",
            "Review gaps and approve the best ones for your calendar",
          ]}
          action={
            <Button variant="primary" shape="pill" size="lg" loading={running} onClick={() => void handleRun()}>
              {running ? "Benchmarking…" : "Run benchmark"}
            </Button>
          }
        />
      ) : (
        <>
          {insightsView === "opportunities" && (
            <OpportunityDashboard
              gaps={sortedGaps}
              hasGapsInProject={gaps.length > 0}
              averages={state?.averages}
              generatingKeyword={generatingKeyword}
              approvedGapKeywords={approvedGapKeywords}
              rejectedGapKeywords={rejectedGapKeywords}
              onGapKeywordStatus={handleGapKeywordStatus}
              aiGapKeywordSet={aiGapKeywordSet}
              massSelectMode={massSelectMode}
              selectedGapIds={selectedGapIds}
              onToggleGapSelected={toggleGapRowSelected}
              bulkApprovingGaps={bulkApprovingGaps}
              viewMenuRef={viewMenuRef}
              viewMenuOpen={viewMenuOpen}
              setViewMenuOpen={setViewMenuOpen}
              setInsightsView={setInsightsView}
              projectGapsCount={gaps.length}
              competitorsCount={competitors.length}
              exitGapMassSelect={exitGapMassSelect}
              onStartMassSelect={() => { setMassSelectMode(true); setSelectedGapIds(new Set()); }}
              onBulkApproveGaps={() => void handleBulkApproveGaps()}
              aiScoring={aiScoring}
              onRunAiScoring={() => void handleRunAiScoring()}
              aiScoringDone={aiScoringDone}
              onLoadMoreAhrefs={() => void handleLoadMoreAhrefs()}
              loadingMoreAhrefs={loadingMoreAhrefs}
            />
          )}

          {insightsView === "competitors" && (
            <CompetitorList
              competitors={competitors}
              statusById={competitorStatuses}
              onStatusChange={handleCompetitorStatus}
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
      </motion.div>
    </div>
  );
}
