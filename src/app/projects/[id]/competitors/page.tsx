"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  runCompetitorBenchmark,
  getCompetitorBenchmark,
  generateBlogFromOpportunity,
  type BenchmarkState,
} from "@/app/actions/competitor-actions";
import type {
  Competitor,
  CompetitorKeyword,
  GapType,
  KeywordGap,
} from "@/lib/types";

type TabId = "competitors" | "gaps" | "opportunities";

const GAP_STYLES: Record<GapType, string> = {
  missing: "border-rose-500/20 bg-rose-500/10 text-rose-400",
  weak: "border-yellow-500/20 bg-yellow-500/10 text-yellow-400",
  untapped: "border-cyan-500/20 bg-cyan-500/10 text-cyan-400",
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
  if (score >= 70) return "text-accent-400 border-accent-500/20 bg-accent-500/10";
  if (score >= 50) return "text-yellow-400 border-yellow-500/20 bg-yellow-500/10";
  if (score >= 30) return "text-brand-400 border-brand-500/20 bg-brand-500/10";
  return "text-text-tertiary border-border-subtle bg-surface-elevated";
}

export default function CompetitorsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();

  const [state, setState] = useState<BenchmarkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabId>("opportunities");
  const [expandedCompetitor, setExpandedCompetitor] = useState<string | null>(null);
  const [gapFilter, setGapFilter] = useState<"all" | GapType>("all");
  const [generatingKeyword, setGeneratingKeyword] = useState<string | null>(null);
  const [lastRunSummary, setLastRunSummary] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getCompetitorBenchmark(projectId);
    setState(res);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

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
      await load();
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

  const topOpportunities = useMemo(
    () => [...gaps].sort((a, b) => b.volume - a.volume || b.opportunity_score - a.opportunity_score).slice(0, 12),
    [gaps]
  );

  const hasBenchmark = competitors.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-primary mb-1">
            Competitor <span className="gradient-text">insights</span>
          </h1>
          <p className="text-text-tertiary text-sm max-w-xl">
            Benchmark the competitors winning your SERPs, diff their keyword coverage against yours, and
            publish the opportunities with one click.
          </p>
          {lastBenchmarkedAt ? (
            <p className="mt-1 text-[11px] text-text-tertiary">
              Last benchmark: {new Date(lastBenchmarkedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/projects/${projectId}/keywords`}
            className="px-4 py-2.5 rounded-xl border border-border-subtle bg-surface-elevated text-text-secondary text-xs font-bold hover:border-brand-500/30 transition-all inline-flex items-center gap-2"
          >
            Keywords
          </Link>
          <button
            onClick={handleRun}
            disabled={running}
            className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-bold shadow-md shadow-cyan-500/20 hover:-translate-y-0.5 transition-all disabled:opacity-60 flex items-center gap-2"
          >
            {running ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Benchmarking…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-400">{error}</div>
      )}
      {lastRunSummary && !error && (
        <div className="rounded-xl border border-accent-500/20 bg-accent-500/5 p-4 text-sm text-accent-400">
          {lastRunSummary}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 w-full animate-pulse rounded-2xl border border-border-subtle bg-surface-secondary/50" />
          ))}
        </div>
      ) : !hasBenchmark ? (
        <div className="rounded-3xl border-2 border-dashed border-border-subtle py-24 text-center">
          <div className="mb-4 text-5xl">📡</div>
          <h3 className="mb-2 text-lg font-bold text-text-secondary">No benchmark yet</h3>
          <p className="mb-6 text-sm text-text-tertiary max-w-md mx-auto">
            We'll pull the real SERP competitors for your niche, scrape their best pages via Jina, extract the
            keywords they rank for, and score every opportunity with DataForSEO volumes.
          </p>
          <button
            onClick={handleRun}
            disabled={running}
            className="rounded-2xl bg-cyan-500 hover:bg-cyan-600 px-8 py-3.5 font-bold text-white shadow-lg shadow-cyan-500/20 hover:-translate-y-0.5 disabled:opacity-60"
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

          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border-subtle bg-surface-secondary/50 p-1 w-fit">
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
              topOpportunities={topOpportunities}
              averages={averages}
              generatingKeyword={generatingKeyword}
              onGenerateBlog={handleGenerateBlog}
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
              counts={gapCounts}
              filter={gapFilter}
              onFilterChange={setGapFilter}
              generatingKeyword={generatingKeyword}
              onGenerateBlog={handleGenerateBlog}
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
      className={`rounded-lg px-5 py-2 text-xs font-bold transition-all ${
        isActive ? "bg-brand-500 text-white shadow-sm" : "text-text-tertiary hover:text-text-secondary"
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
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard label="Competitors" value={competitors.length.toString()} hint="benchmarked domains" />
      <StatCard
        label="Keywords mined"
        value={competitorKeywords.length.toLocaleString()}
        hint="from competitor pages"
      />
      <StatCard
        label="Gaps found"
        value={gaps.length.toString()}
        hint={topGap ? `top score ${topGap.opportunity_score}` : "—"}
      />
      <StatCard
        label="Avg word count"
        value={(averages?.avg_word_count ?? 0).toLocaleString()}
        hint={averages?.pages_analyzed ? `across ${averages.pages_analyzed} pages` : "pages"}
      />
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass-card p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1">{label}</p>
      <p className="text-2xl font-black text-text-primary">{value}</p>
      {hint ? <p className="text-[11px] text-text-tertiary mt-0.5">{hint}</p> : null}
    </div>
  );
}

function OpportunityDashboard({
  topOpportunities,
  averages,
  generatingKeyword,
  onGenerateBlog,
}: {
  topOpportunities: KeywordGap[];
  averages?: BenchmarkState["averages"];
  generatingKeyword: string | null;
  onGenerateBlog: (keyword: string) => void;
}) {
  return (
    <div className="space-y-4">
      {averages?.recommendations?.length ? (
        <div className="glass-card border-cyan-500/10 bg-cyan-500/8 p-5">
          <h3 className="font-bold text-text-primary mb-2">Content benchmark recommendations</h3>
          <ul className="space-y-1 text-sm text-text-secondary">
            {averages.recommendations.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-cyan-400">·</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {topOpportunities.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-border-subtle py-16 text-center text-sm text-text-tertiary">
          No opportunities yet. Run a benchmark.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-secondary/30 backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-tertiary/50 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
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
              <tbody className="divide-y divide-border-subtle">
                {topOpportunities.map(g => (
                  <tr key={g.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-4 py-3 max-w-[280px]">
                      <p className="text-sm font-semibold text-text-primary truncate">{g.keyword}</p>
                      {g.reasoning ? (
                        <p className="text-[11px] text-text-tertiary truncate" title={g.reasoning}>
                          {g.reasoning}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize ${GAP_STYLES[g.gap_type]}`}
                      >
                        {g.gap_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-text-primary">
                      {g.volume > 0 ? g.volume.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-bold">
                      <span className={g.trend_pct > 0 ? "text-accent-400" : g.trend_pct < 0 ? "text-rose-400" : "text-text-tertiary"}>
                        {formatTrend(g.trend, g.trend_pct)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-elevated">
                          <div
                            className={`h-full ${g.competitor_weakness >= 60 ? "bg-accent-500" : g.competitor_weakness >= 30 ? "bg-yellow-500" : "bg-rose-500"}`}
                            style={{ width: `${g.competitor_weakness}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-text-secondary">{g.competitor_weakness}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${scoreColor(g.opportunity_score)}`}>
                        {g.opportunity_score}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <p className="text-xs font-bold text-cyan-400 truncate">{g.top_competitor_domain}</p>
                      {g.top_competitor_url ? (
                        <a
                          href={g.top_competitor_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={g.top_competitor_url}
                          className="block truncate text-[11px] text-brand-400 hover:underline"
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
                        className="rounded-lg bg-brand-500 hover:bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm shadow-brand-500/20 hover:-translate-y-0.5 transition-all disabled:opacity-60"
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
    <div className="space-y-3">
      {competitors.map(c => {
        const expanded = expandedId === c.id;
        return (
          <div key={c.id} className="rounded-2xl border border-border-subtle bg-surface-secondary/30 backdrop-blur-md">
            <button
              type="button"
              onClick={() => onToggle(c.id)}
              className="w-full flex flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-400 text-xs font-black">
                  {c.rank_score}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-text-primary truncate">{c.domain}</p>
                  <p className="text-[11px] text-text-tertiary truncate">
                    {c.pages_scraped} pages analyzed · {c.top_pages?.length ?? 0} snapshots
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-text-tertiary">
                <MiniStat label="Words" value={c.avg_word_count.toLocaleString()} />
                <MiniStat label="H2" value={String(c.avg_h2)} />
                <MiniStat label="H3" value={String(c.avg_h3)} />
                <MiniStat label="FAQ" value={`${c.faq_pages_pct}%`} />
                <span className="text-text-tertiary">{expanded ? "▲" : "▼"}</span>
              </div>
            </button>
            {expanded ? (
              <div className="border-t border-border-subtle p-4 space-y-3">
                {c.recommendations?.length ? (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1">
                      Recommendations
                    </p>
                    <ul className="space-y-0.5 text-xs text-text-secondary">
                      {c.recommendations.map((r, i) => (
                        <li key={i}>· {r}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {c.top_pages?.length ? (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1">
                      Pages sampled
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
                          <tr>
                            <th className="py-2 pr-2">Page</th>
                            <th className="py-2 text-right">Words</th>
                            <th className="py-2 text-center">H2</th>
                            <th className="py-2 text-center">H3</th>
                            <th className="py-2 text-center">Images</th>
                            <th className="py-2 text-center">Int / Ext</th>
                            <th className="py-2 text-center">FAQ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                          {c.top_pages.map((p, i) => (
                            <tr key={`${p.url}-${i}`} className="text-text-secondary">
                              <td className="py-2 pr-2 max-w-[280px] truncate">
                                {p.url ? (
                                  <a
                                    href={p.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-brand-400 hover:underline"
                                    title={p.title}
                                  >
                                    {p.title || p.url}
                                  </a>
                                ) : (
                                  <span>{p.title}</span>
                                )}
                              </td>
                              <td className="py-2 text-right">{p.word_count.toLocaleString()}</td>
                              <td className="py-2 text-center">{p.h2_count}</td>
                              <td className="py-2 text-center">{p.h3_count}</td>
                              <td className="py-2 text-center">{p.image_count}</td>
                              <td className="py-2 text-center">
                                {p.internal_link_count} / {p.external_link_count}
                              </td>
                              <td className="py-2 text-center">{p.has_faq ? "✓" : "—"}</td>
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
      <p className="text-[9px] font-bold uppercase tracking-widest text-text-tertiary">{label}</p>
      <p className="text-xs font-bold text-text-primary">{value}</p>
    </div>
  );
}

function KeywordGapTable({
  gaps,
  counts,
  filter,
  onFilterChange,
  generatingKeyword,
  onGenerateBlog,
}: {
  gaps: KeywordGap[];
  counts: Record<"all" | GapType, number>;
  filter: "all" | GapType;
  onFilterChange: (f: "all" | GapType) => void;
  generatingKeyword: string | null;
  onGenerateBlog: (keyword: string) => void;
}) {
  const filters: Array<{ id: "all" | GapType; label: string }> = [
    { id: "all", label: "All" },
    { id: "missing", label: "Missing" },
    { id: "weak", label: "Weak" },
    { id: "untapped", label: "Untapped" },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 rounded-xl border border-border-subtle bg-surface-secondary/50 p-1 w-fit">
        {filters.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilterChange(f.id)}
            className={`rounded-lg px-4 py-1.5 text-xs font-bold capitalize transition-all ${
              filter === f.id ? "bg-brand-500 text-white" : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {f.label} ({counts[f.id]})
          </button>
        ))}
      </div>

      {gaps.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-border-subtle py-16 text-center text-sm text-text-tertiary">
          No keyword gaps match this filter.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-secondary/30 backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-tertiary/50 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
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
              <tbody className="divide-y divide-border-subtle">
                {gaps.map(g => (
                  <tr key={g.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-4 py-3 max-w-[280px]">
                      <p className="text-sm font-semibold text-text-primary truncate">{g.keyword}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize ${GAP_STYLES[g.gap_type]}`}>
                        {g.gap_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-text-primary">
                      {g.volume > 0 ? g.volume.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-bold">
                      <span className={g.trend_pct > 0 ? "text-accent-400" : g.trend_pct < 0 ? "text-rose-400" : "text-text-tertiary"}>
                        {formatTrend(g.trend, g.trend_pct)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${scoreColor(g.opportunity_score)}`}>
                        {g.opportunity_score}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <p className="text-xs font-bold text-cyan-400 truncate">{g.top_competitor_domain}</p>
                      {g.top_competitor_url ? (
                        <a
                          href={g.top_competitor_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={g.top_competitor_url}
                          className="block truncate text-[11px] text-brand-400 hover:underline"
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
                        className="rounded-lg bg-brand-500 hover:bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm shadow-brand-500/20 hover:-translate-y-0.5 transition-all disabled:opacity-60"
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
