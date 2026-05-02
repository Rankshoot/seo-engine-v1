"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import {
  runCompetitorBenchmark,
  getCompetitorBenchmark,
  generateBlogFromOpportunity,
  type BenchmarkState,
} from "@/app/actions/competitor-actions";
import { projectDomainHost } from "@/lib/project-domain-host";
import type {
  Competitor,
  CompetitorKeyword,
  GapType,
  KeywordGap,
} from "@/lib/types";
import { Tooltip, InfoIcon } from "@/components/Tooltip";
import { useAppSelector, selectAiSuggestedGapKeywords } from "@/lib/redux/hooks";

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

type TabId = "competitors" | "gaps" | "opportunities";

const GAP_STYLES: Record<GapType, string> = {
  missing: "border-brand-coral/20 bg-brand-coral/10 text-brand-coral",
  weak: "border-[#f59e0b]/20 bg-[#f59e0b]/10 text-[#f59e0b]",
  untapped: "border-[#10b981]/20 bg-[#10b981]/10 text-[#10b981]",
};

function formatTrend(trend: string, pct: number) {
  if (!trend || trend === "+0%") return "—";
  return trend;
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

export default function CompetitorsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const COMPETITORS_KEY = qk.competitors(projectId);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabId>("opportunities");
  const [expandedCompetitor, setExpandedCompetitor] = useState<string | null>(null);
  const [gapFilter, setGapFilter] = useState<"all" | GapType>("all");
  const [generatingKeyword, setGeneratingKeyword] = useState<string | null>(null);
  const [lastRunSummary, setLastRunSummary] = useState<string>("");
  const aiSuggestedGapKeywords = useAppSelector(state =>
    selectAiSuggestedGapKeywords(state, projectId)
  );
  const aiGapKeywordSet = useMemo(
    () => new Set(aiSuggestedGapKeywords.map(k => k.toLowerCase())),
    [aiSuggestedGapKeywords]
  );

  const { data: state, isLoading: loading } = useQuery<BenchmarkState>({
    queryKey: COMPETITORS_KEY,
    queryFn: () => getCompetitorBenchmark(projectId),
    enabled: !!projectId,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });

  const handleRun = async () => {
    setRunning(true);
    setError("");
    const res = await runCompetitorBenchmark(projectId);
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
    const res = await generateBlogFromOpportunity(projectId, keyword);
    setGeneratingKeyword(null);
    if (res.success) {
      router.push(`/projects/${projectId}/calendar`);
    } else {
      setError(res.error ?? "Could not create calendar entry.");
    }
  };

  const competitors = state?.competitors ?? [];
  const competitorKeywords = state?.competitorKeywords ?? [];
  const gaps = state?.gaps ?? [];
  const averages = state?.averages;
  const lastBenchmarkedAt = state?.lastBenchmarkedAt;

  const filteredGaps = useMemo(() => {
    const list = gapFilter === "all" ? gaps : gaps.filter(g => g.gap_type === gapFilter);
    return [...list].sort((a, b) => b.volume - a.volume || b.opportunity_score - a.opportunity_score);
  }, [gaps, gapFilter]);

  const gapCounts = useMemo(() => {
    const counts = { all: gaps.length, missing: 0, weak: 0, untapped: 0 };
    for (const g of gaps) counts[g.gap_type] += 1;
    return counts;
  }, [gaps]);

  const hasBenchmark = competitors.length > 0;

  return (
    <div className="space-y-10 pb-16 max-w-full pl-4 pr-4 mx-auto">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="pt-4 pb-8 border-b border-border-subtle flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[48px] font-normal tracking-[-0.96px] leading-none text-text-primary font-display">
            Competitor insights
          </h1>
          <p className="mt-3 text-[16px] text-text-tertiary max-w-[600px]">
            Benchmark the competitors winning your SERPs, diff their keyword coverage against yours, and
            publish the opportunities with one click.
          </p>
          {lastBenchmarkedAt ? (
            <p className="mt-2 text-[12px] text-text-tertiary">
              Last benchmark:{" "}
              {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(lastBenchmarkedAt))}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/projects/${projectId}/keywords`}
            className="rounded-[30px] border border-border-subtle bg-surface-secondary px-5 py-2.5 text-[14px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors inline-flex items-center gap-2"
          >
            Keywords
          </Link>
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
      </div>

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
          <BenchmarkOverview
            averages={averages}
            competitors={competitors}
            competitorKeywords={competitorKeywords}
            gaps={gaps}
          />

          <div className="flex flex-wrap items-center gap-1 rounded-[8px] border border-border-subtle bg-surface-secondary p-1 w-fit">
            <TabButton id="opportunities" active={tab} onClick={setTab}>
              Opportunity Dashboard ({gaps.length})
            </TabButton>
            <TabButton id="competitors" active={tab} onClick={setTab}>
              Competitor List ({competitors.length})
            </TabButton>
            <TabButton id="gaps" active={tab} onClick={setTab}>
              Keyword Gap Table
            </TabButton>
          </div>

          {tab === "opportunities" && (
            <OpportunityDashboard
              gaps={filteredGaps}
              gapCounts={gapCounts}
              gapFilter={gapFilter}
              onGapFilterChange={setGapFilter}
              averages={averages}
              generatingKeyword={generatingKeyword}
              onGenerateBlog={handleGenerateBlog}
              aiGapKeywordSet={aiGapKeywordSet}
            />
          )}

          {tab === "competitors" && (
            <CompetitorList
              competitors={competitors}
              expandedId={expandedCompetitor}
              onToggle={id => setExpandedCompetitor(prev => (prev === id ? null : id))}
            />
          )}

          {tab === "gaps" && (
            <KeywordGapTable
              gaps={filteredGaps}
              gapCounts={gapCounts}
              gapFilter={gapFilter}
              onGapFilterChange={setGapFilter}
              generatingKeyword={generatingKeyword}
              onGenerateBlog={handleGenerateBlog}
              aiGapKeywordSet={aiGapKeywordSet}
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

function TabButton({
  id,
  active,
  onClick,
  children,
}: {
  id: TabId;
  active: TabId;
  onClick: (id: TabId) => void;
  children: React.ReactNode;
}) {
  const isActive = id === active;
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={`rounded-[4px] px-4 py-2 text-[14px] font-medium transition-all ${
        isActive ? "bg-surface-elevated text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function BenchmarkOverview({
  averages,
  competitors,
  competitorKeywords,
  gaps,
}: {
  averages?: BenchmarkState["averages"];
  competitors: Competitor[];
  competitorKeywords: CompetitorKeyword[];
  gaps: KeywordGap[];
}) {
  const topGap = [...gaps].sort((a, b) => b.opportunity_score - a.opportunity_score)[0];
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <StatCard
        label="Competitors"
        value={competitors.length.toString()}
        hint="benchmarked domains"
        tooltip="Unique competitor domains discovered from your niche's SERPs and scraped in this benchmark run."
      />
      <StatCard
        label="Keywords mined"
        value={new Intl.NumberFormat("en-US").format(competitorKeywords.length)}
        hint="from competitor pages"
        tooltip="Total keywords extracted from competitor pages via Jina scraping + DataForSEO enrichment."
      />
      <StatCard
        label="Gaps found"
        value={gaps.length.toString()}
        hint={topGap ? `top score ${topGap.opportunity_score}` : "—"}
        tooltip="Keywords your competitors rank for but your domain does not (missing), or ranks weakly (weak / untapped)."
      />
      <StatCard
        label="Avg word count"
        value={new Intl.NumberFormat("en-US").format(averages?.avg_word_count ?? 0)}
        hint={averages?.pages_analyzed ? `across ${averages.pages_analyzed} pages` : "pages"}
        tooltip="Average word count across all competitor pages scraped. Use this as a content-length benchmark when writing."
      />
    </div>
  );
}

const GAP_FILTER_OPTIONS: Array<{ id: "all" | GapType; label: string }> = [
  { id: "all", label: "All" },
  { id: "missing", label: "Missing" },
  { id: "weak", label: "Weak" },
  { id: "untapped", label: "Untapped" },
];

function GapFilterBar({
  counts,
  filter,
  onFilterChange,
}: {
  counts: Record<"all" | GapType, number>;
  filter: "all" | GapType;
  onFilterChange: (f: "all" | GapType) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-[8px] border border-border-subtle bg-surface-secondary p-1 w-fit">
      {GAP_FILTER_OPTIONS.map(f => (
        <button
          key={f.id}
          type="button"
          onClick={() => onFilterChange(f.id)}
          className={`rounded-[4px] px-4 py-1.5 text-[13px] font-medium capitalize transition-all ${
            filter === f.id ? "bg-surface-elevated text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          {f.label} ({counts[f.id]})
        </button>
      ))}
    </div>
  );
}

function StatCard({ label, value, hint, tooltip }: { label: string; value: string; hint?: string; tooltip?: string }) {
  return (
    <div className="rounded-[16px] border border-border-subtle bg-surface-elevated p-5 flex flex-col">
      <div className="flex items-center gap-1.5 mb-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">{label}</p>
        {tooltip && (
          <Tooltip content={tooltip}>
            <InfoIcon />
          </Tooltip>
        )}
      </div>
      <p className="font-mono text-[32px] font-bold tracking-tight text-text-primary leading-none">{value}</p>
      {hint ? <p className="text-[12px] text-text-tertiary mt-2">{hint}</p> : null}
    </div>
  );
}

function OpportunityDashboard({
  gaps,
  gapCounts,
  gapFilter,
  onGapFilterChange,
  averages,
  generatingKeyword,
  onGenerateBlog,
  aiGapKeywordSet,
}: {
  gaps: KeywordGap[];
  gapCounts: Record<"all" | GapType, number>;
  gapFilter: "all" | GapType;
  onGapFilterChange: (f: "all" | GapType) => void;
  averages?: BenchmarkState["averages"];
  generatingKeyword: string | null;
  onGenerateBlog: (keyword: string) => void;
  aiGapKeywordSet: Set<string>;
}) {
  return (
    <div className="space-y-6">
      {averages?.recommendations?.length ? (
        <div className="rounded-[16px] border border-brand-action/20 bg-brand-action/5 p-6">
          <h3 className="text-[18px] font-medium text-text-primary mb-4">Content benchmark recommendations</h3>
          <ul className="space-y-2 text-[14px] text-text-secondary">
            {averages.recommendations.map((r, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-brand-action font-bold">·</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-3">
        <p className="text-[12px] font-bold uppercase tracking-widest text-text-tertiary">
          Keyword opportunities
        </p>
        <GapFilterBar counts={gapCounts} filter={gapFilter} onFilterChange={onGapFilterChange} />
      </div>

      {gaps.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-border-strong bg-surface-secondary py-16 text-center text-[14px] text-text-tertiary">
          {gapFilter === "all"
            ? "No opportunities yet. Run a benchmark."
            : "No keyword gaps match this filter."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-secondary text-[12px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                <tr>
                  <th className="px-4 py-3">Keyword</th>
                  <th className="px-4 py-3 text-center">Gap</th>
                  <th className="px-4 py-3 text-right">Volume</th>
                  <th className="px-4 py-3 text-center">Trend</th>
                  <th className="px-4 py-3 text-center">Weakness</th>
                  <th className="px-4 py-3 text-center">Opportunity</th>
                  <th className="px-4 py-3">Ranking page</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/60">
                {gaps.map(g => (
                  <tr key={g.id} className="transition-colors hover:bg-surface-hover">
                    <td className="px-4 py-3 max-w-[280px]">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[14px] font-medium text-text-primary">{g.keyword}</p>
                        {aiGapKeywordSet.has(g.keyword.toLowerCase()) ? (
                          <span className="shrink-0 rounded-full border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8b5cf6]">
                            AI pick
                          </span>
                        ) : null}
                      </div>
                      {g.reasoning ? (
                        <p className="mt-1 text-[11px] text-text-tertiary truncate" title={g.reasoning}>
                          {g.reasoning}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block rounded-[4px] border px-2 py-0.5 text-[11px] font-bold capitalize ${GAP_STYLES[g.gap_type]}`}
                      >
                        {g.gap_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[14px] font-mono text-text-secondary">
                      {g.volume > 0 ? g.volume.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-[12px] font-bold">
                      <span className={g.trend_pct > 0 ? "text-[#10b981]" : g.trend_pct < 0 ? "text-brand-coral" : "text-text-tertiary"}>
                        {formatTrend(g.trend, g.trend_pct)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-tertiary">
                          <div
                            className={`h-full rounded-full ${g.competitor_weakness >= 60 ? "bg-[#10b981]" : g.competitor_weakness >= 30 ? "bg-[#f59e0b]" : "bg-brand-coral"}`}
                            style={{ width: `${g.competitor_weakness}%` }}
                          />
                        </div>
                        <span className="text-[12px] font-bold text-text-secondary">{g.competitor_weakness}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded-[4px] border px-2.5 py-1 text-[12px] font-mono ${scoreColor(g.opportunity_score)}`}>
                        {g.opportunity_score}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <p className="text-[12px] font-bold text-brand-action truncate">{g.top_competitor_domain}</p>
                      {g.top_competitor_url ? (
                        <a
                          href={g.top_competitor_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={g.top_competitor_url}
                          className="block truncate text-[11px] text-brand-action/80 hover:underline mt-1"
                        >
                          {compactUrl(g.top_competitor_url)} ↗
                        </a>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => onGenerateBlog(g.keyword)}
                        disabled={generatingKeyword === g.keyword}
                        className="rounded-[4px] border border-border-subtle bg-surface-secondary px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-60"
                      >
                        {generatingKeyword === g.keyword ? "Queuing…" : "Generate blog"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CompetitorList({
  competitors,
  expandedId,
  onToggle,
}: {
  competitors: Competitor[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      {competitors.map(c => {
        const expanded = expandedId === c.id;
        return (
          <div key={c.id} className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
            <button
              type="button"
              onClick={() => onToggle(c.id)}
              className="w-full flex flex-wrap items-center justify-between gap-4 p-5 text-left hover:bg-surface-hover transition-colors"
            >
              <div className="flex items-center gap-4 min-w-0">
                <DomainLogo domain={c.domain} />
                <div className="min-w-0">
                  <p className="text-[16px] font-medium text-text-primary truncate">{c.domain}</p>
                  <p className="mt-1 text-[13px] text-text-tertiary truncate">
                    {c.pages_scraped} pages analyzed · {c.top_pages?.length ?? 0} snapshots
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6 text-[13px] text-text-tertiary">
                <MiniStat label="Words" value={c.avg_word_count.toLocaleString()} />
                <MiniStat label="H2" value={String(c.avg_h2)} />
                <MiniStat label="H3" value={String(c.avg_h3)} />
                <MiniStat label="FAQ" value={`${c.faq_pages_pct}%`} />
                <span className="text-text-tertiary ml-2">
                  <svg className={`w-5 h-5 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </span>
              </div>
            </button>
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">{label}</p>
      <p className="text-[14px] font-medium text-text-primary mt-0.5">{value}</p>
    </div>
  );
}

function KeywordGapTable({
  gaps,
  gapCounts,
  gapFilter,
  onGapFilterChange,
  generatingKeyword,
  onGenerateBlog,
  aiGapKeywordSet,
}: {
  gaps: KeywordGap[];
  gapCounts: Record<"all" | GapType, number>;
  gapFilter: "all" | GapType;
  onGapFilterChange: (f: "all" | GapType) => void;
  generatingKeyword: string | null;
  onGenerateBlog: (keyword: string) => void;
  aiGapKeywordSet: Set<string>;
}) {
  return (
    <div className="space-y-4">
      <GapFilterBar counts={gapCounts} filter={gapFilter} onFilterChange={onGapFilterChange} />

      {gaps.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-border-strong bg-surface-secondary py-16 text-center text-[14px] text-text-tertiary">
          No keyword gaps match this filter.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-secondary text-[12px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                <tr>
                  <th className="px-4 py-3">Keyword</th>
                  <th className="px-4 py-3 text-center">Type</th>
                  <th className="px-4 py-3 text-right">Volume</th>
                  <th className="px-4 py-3 text-center">Trend</th>
                  <th className="px-4 py-3 text-center">Score</th>
                  <th className="px-4 py-3">Ranking page</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/60">
                {gaps.map(g => (
                  <tr key={g.id} className="transition-colors hover:bg-surface-hover">
                    <td className="px-4 py-3 max-w-[280px]">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[14px] font-medium text-text-primary">{g.keyword}</p>
                        {aiGapKeywordSet.has(g.keyword.toLowerCase()) ? (
                          <span className="shrink-0 rounded-full border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8b5cf6]">
                            AI pick
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block rounded-[4px] border px-2 py-0.5 text-[11px] font-bold capitalize ${GAP_STYLES[g.gap_type]}`}>
                        {g.gap_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[14px] font-mono text-text-secondary">
                      {g.volume > 0 ? g.volume.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-[12px] font-bold">
                      <span className={g.trend_pct > 0 ? "text-[#10b981]" : g.trend_pct < 0 ? "text-brand-coral" : "text-text-tertiary"}>
                        {formatTrend(g.trend, g.trend_pct)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded-[4px] border px-2.5 py-1 text-[12px] font-mono ${scoreColor(g.opportunity_score)}`}>
                        {g.opportunity_score}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <p className="text-[12px] font-bold text-brand-action truncate">{g.top_competitor_domain}</p>
                      {g.top_competitor_url ? (
                        <a
                          href={g.top_competitor_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={g.top_competitor_url}
                          className="block truncate text-[11px] text-brand-action/80 hover:underline mt-1"
                        >
                          {compactUrl(g.top_competitor_url)} ↗
                        </a>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => onGenerateBlog(g.keyword)}
                        disabled={generatingKeyword === g.keyword}
                        className="rounded-[4px] border border-border-subtle bg-surface-secondary px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-60"
                      >
                        {generatingKeyword === g.keyword ? "Queuing…" : "Generate blog"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
