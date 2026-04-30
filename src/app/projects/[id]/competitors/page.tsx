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
import { getProject, updateProject } from "@/app/actions/project-actions";
import { projectDomainHost } from "@/lib/project-domain-host";
import type {
  Competitor,
  CompetitorKeyword,
  GapType,
  KeywordGap,
  Project,
} from "@/lib/types";

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

  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [host]);

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

  const [state, setState] = useState<BenchmarkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabId>("opportunities");
  const [expandedCompetitor, setExpandedCompetitor] = useState<string | null>(null);
  const [gapFilter, setGapFilter] = useState<"all" | GapType>("all");
  const [generatingKeyword, setGeneratingKeyword] = useState<string | null>(null);
  const [lastRunSummary, setLastRunSummary] = useState<string>("");
  const [project, setProject] = useState<Project | null>(null);
  const [rtIdInput, setRtIdInput] = useState("");
  const [rtIdEditing, setRtIdEditing] = useState(false);
  const [rtIdSaving, setRtIdSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [benchRes, projRes] = await Promise.all([
      getCompetitorBenchmark(projectId),
      getProject(projectId),
    ]);
    setState(benchRes);
    if (projRes.success && projRes.data) {
      setProject(projRes.data);
      setRtIdInput(String(projRes.data.ahrefs_rank_tracker_project_id ?? ""));
    }
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

  const handleSaveRtId = async () => {
    if (!project) return;
    setRtIdSaving(true);
    const parsed = rtIdInput.trim() ? Number(rtIdInput.trim()) : null;
    await updateProject(projectId, {
      name: project.name,
      domain: project.domain,
      company: project.company,
      niche: project.niche,
      target_audience: project.target_audience,
      target_region: project.target_region,
      description: project.description,
      ahrefs_rank_tracker_project_id: parsed,
    });
    setProject(prev => prev ? { ...prev, ahrefs_rank_tracker_project_id: parsed } : prev);
    setRtIdEditing(false);
    setRtIdSaving(false);
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
              Last benchmark: {new Date(lastBenchmarkedAt).toLocaleString()}
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

      {/* Ahrefs Rank Tracker Project ID config */}
      <div className="rounded-[16px] border border-border-subtle bg-surface-secondary p-5 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <svg className="w-5 h-5 text-brand-action shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
          </svg>
          <span className="text-[14px] font-medium text-text-primary">Ahrefs Rank Tracker Project ID</span>
          {!rtIdEditing && (
            <span className="text-[14px] text-text-tertiary">
              {project?.ahrefs_rank_tracker_project_id
                ? <span className="text-brand-action font-mono">{project.ahrefs_rank_tracker_project_id}</span>
                : <span className="italic">not set</span>}
            </span>
          )}
        </div>
        {rtIdEditing ? (
          <div className="flex items-center gap-2">
            <input
              value={rtIdInput}
              onChange={e => setRtIdInput(e.target.value)}
              placeholder="e.g. 8024646"
              inputMode="numeric"
              className="rounded-[4px] border border-border-subtle bg-surface-elevated px-3 py-1.5 text-[13px] text-text-primary outline-none focus:border-brand-action w-36"
              autoFocus
              onKeyDown={e => { if (e.key === "Enter") void handleSaveRtId(); if (e.key === "Escape") setRtIdEditing(false); }}
            />
            <button
              onClick={() => void handleSaveRtId()}
              disabled={rtIdSaving}
              className="rounded-[4px] bg-brand-primary px-3 py-1.5 text-[13px] font-medium text-brand-on-primary disabled:opacity-60 transition-all"
            >
              {rtIdSaving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => { setRtIdEditing(false); setRtIdInput(String(project?.ahrefs_rank_tracker_project_id ?? "")); }}
              className="rounded-[4px] border border-border-subtle bg-surface-secondary px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary transition-all"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setRtIdEditing(true)}
            className="text-[13px] font-medium text-brand-action hover:underline transition-colors shrink-0"
          >
            {project?.ahrefs_rank_tracker_project_id ? "Edit" : "Set ID"}
          </button>
        )}
        <p className="w-full text-[12px] text-text-tertiary mt-1">
          Found in Ahrefs → Rank Tracker → your project URL. Pulls top 10 competitor pages from your tracked keywords.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 w-full animate-pulse rounded-[16px] border border-border-subtle bg-surface-elevated" />
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
            We'll pull the real SERP competitors for your niche, scrape their best pages via Jina, extract the
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
    <div className="rounded-[16px] border border-border-subtle bg-surface-elevated p-6 flex flex-col justify-center">
      <p className="text-[12px] font-bold uppercase tracking-widest text-text-tertiary mb-1.5">{label}</p>
      <p className="font-mono text-[28px] font-bold tracking-tight text-text-primary">{value}</p>
      {hint ? <p className="text-[13px] text-text-tertiary mt-1">{hint}</p> : null}
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

      {topOpportunities.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-border-strong bg-surface-secondary py-16 text-center text-[14px] text-text-tertiary">
          No opportunities yet. Run a benchmark.
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
                {topOpportunities.map(g => (
                  <tr key={g.id} className="transition-colors hover:bg-surface-hover">
                    <td className="px-4 py-3 max-w-[280px]">
                      <p className="text-[14px] font-medium text-text-primary truncate">{g.keyword}</p>
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
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-[8px] border border-border-subtle bg-surface-secondary p-1 w-fit">
        {filters.map(f => (
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
                      <p className="text-[14px] font-medium text-text-primary truncate">{g.keyword}</p>
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
