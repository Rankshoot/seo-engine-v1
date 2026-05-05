"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query";
import type { BenchmarkState } from "@/app/actions/competitor-actions";
import { competitorsApi } from "@/frontend/api/competitors";
import { projectDomainHost } from "@/lib/project-domain-host";
import type {
  Competitor,
  CompetitorKeyword,
  GapType,
  KeywordGap,
  KeywordStatus,
} from "@/lib/types";
import { KeywordActionDropdown } from "@/components/keywords/KeywordActionDropdown";
import { PillTabFilterBar } from "@/components/filters/PillTabFilterBar";
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

type InsightsView = "opportunities" | "competitors";

const GAP_STYLES: Record<GapType, string> = {
  missing: "border-brand-coral/20 bg-brand-coral/10 text-brand-coral",
  weak: "border-[#f59e0b]/20 bg-[#f59e0b]/10 text-[#f59e0b]",
  untapped: "border-[#10b981]/20 bg-[#10b981]/10 text-[#10b981]",
};

const GAP_FILTER_OPTIONS: Array<{ id: "all" | GapType; label: string }> = [
  { id: "all", label: "All" },
  { id: "missing", label: "Missing" },
  { id: "weak", label: "Weak" },
  { id: "untapped", label: "Untapped" },
];

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

const GAP_APPROVED_STORAGE_PREFIX = "seo-engine-gap-approved:";
const GAP_REJECTED_STORAGE_PREFIX = "seo-engine-gap-rejected:";
const COMPETITOR_STATUS_STORAGE_PREFIX = "seo-engine:competitor-workspace:";

function loadApprovedGapKeywords(projectId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(`${GAP_APPROVED_STORAGE_PREFIX}${projectId}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(String).map(s => s.toLowerCase()));
  } catch {
    return new Set();
  }
}

function persistApprovedGapKeywords(projectId: string, next: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${GAP_APPROVED_STORAGE_PREFIX}${projectId}`, JSON.stringify([...next]));
  } catch {
    /* ignore quota / private mode */
  }
}

function loadRejectedGapKeywords(projectId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(`${GAP_REJECTED_STORAGE_PREFIX}${projectId}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(String).map(s => s.toLowerCase()));
  } catch {
    return new Set();
  }
}

function persistRejectedGapKeywords(projectId: string, next: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${GAP_REJECTED_STORAGE_PREFIX}${projectId}`, JSON.stringify([...next]));
  } catch {
    /* ignore quota / private mode */
  }
}

function loadCompetitorStatuses(projectId: string): Record<string, KeywordStatus> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(`${COMPETITOR_STATUS_STORAGE_PREFIX}${projectId}`);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return {};
    const out: Record<string, KeywordStatus> = {};
    const allowed: KeywordStatus[] = ["pending", "approved", "rejected"];
    for (const [id, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === "string" && (allowed as string[]).includes(v)) out[id] = v as KeywordStatus;
    }
    return out;
  } catch {
    return {};
  }
}

function persistCompetitorStatuses(projectId: string, next: Record<string, KeywordStatus>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${COMPETITOR_STATUS_STORAGE_PREFIX}${projectId}`, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

export default function CompetitorsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const COMPETITORS_KEY = qk.competitors(projectId);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [insightsView, setInsightsView] = useState<InsightsView>("opportunities");
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const [expandedCompetitor, setExpandedCompetitor] = useState<string | null>(null);
  const [gapFilter, setGapFilter] = useState<"all" | GapType>("all");
  const [massSelectMode, setMassSelectMode] = useState(false);
  const [selectedGapIds, setSelectedGapIds] = useState<Set<string>>(new Set());
  const [bulkApprovingGaps, setBulkApprovingGaps] = useState(false);
  const [generatingKeyword, setGeneratingKeyword] = useState<string | null>(null);
  const [approvedGapKeywords, setApprovedGapKeywords] = useState<Set<string>>(new Set());
  const [rejectedGapKeywords, setRejectedGapKeywords] = useState<Set<string>>(new Set());
  const [competitorStatuses, setCompetitorStatuses] = useState<Record<string, KeywordStatus>>({});
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
    queryFn: () => competitorsApi.benchmark(projectId),
    enabled: !!projectId,
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
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setViewMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [viewMenuOpen]);

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
      const key = keyword.toLowerCase();
      setApprovedGapKeywords(prev => {
        const next = new Set(prev);
        next.add(key);
        persistApprovedGapKeywords(projectId, next);
        return next;
      });
      router.push(`/projects/${projectId}/calendar`);
    } else {
      setError(res.error ?? "Could not create calendar entry.");
    }
  };

  const handleGapKeywordStatus = (keyword: string, next: KeywordStatus) => {
    const k = keyword.toLowerCase();
    if (next === "approved") {
      setRejectedGapKeywords(prev => {
        if (!prev.has(k)) return prev;
        const n = new Set(prev);
        n.delete(k);
        persistRejectedGapKeywords(projectId, n);
        return n;
      });
      if (!approvedGapKeywords.has(k)) void handleGenerateBlog(keyword);
      return;
    }
    if (next === "rejected") {
      setRejectedGapKeywords(prev => {
        const n = new Set(prev);
        n.add(k);
        persistRejectedGapKeywords(projectId, n);
        return n;
      });
      setApprovedGapKeywords(prev => {
        if (!prev.has(k)) return prev;
        const n = new Set(prev);
        n.delete(k);
        persistApprovedGapKeywords(projectId, n);
        return n;
      });
      return;
    }
    setRejectedGapKeywords(prev => {
      if (!prev.has(k)) return prev;
      const n = new Set(prev);
      n.delete(k);
      persistRejectedGapKeywords(projectId, n);
      return n;
    });
    setApprovedGapKeywords(prev => {
      if (!prev.has(k)) return prev;
      const n = new Set(prev);
      n.delete(k);
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

  const handleBulkApproveGaps = async () => {
    const rows = filteredGaps.filter(g => selectedGapIds.has(g.id));
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
            const n = new Set(prev);
            n.add(k);
            persistApprovedGapKeywords(projectId, n);
            return n;
          });
        } else {
          setError(res.error ?? "Could not queue an opportunity.");
        }
      }
      exitGapMassSelect();
      if (anyOk) router.push(`/projects/${projectId}/calendar`);
    } finally {
      setBulkApprovingGaps(false);
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
          <ProjectNavLink
            href={`/projects/${projectId}/keywords`}
            className="rounded-[30px] border border-border-subtle bg-surface-secondary px-5 py-2.5 text-[14px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors inline-flex items-center gap-2"
          >
            Keywords
          </ProjectNavLink>
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

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <div className="relative" ref={viewMenuRef}>
              <button
                type="button"
                onClick={() => setViewMenuOpen(o => !o)}
                className="inline-flex h-8 items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,colors] duration-200 hover:border-border-strong hover:text-text-primary"
                aria-expanded={viewMenuOpen}
                aria-haspopup="listbox"
              >
                {insightsView === "opportunities" ? "Opportunity dashboard" : "Competitor list"}
                <svg className="h-3.5 w-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {viewMenuOpen ? (
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
                      setViewMenuOpen(false);
                    }}
                  >
                    Opportunity dashboard ({gaps.length})
                  </button>
                  <button
                    type="button"
                    role="option"
                    aria-selected={insightsView === "competitors"}
                    className="block w-full px-3 py-2 text-left text-[13px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                    onClick={() => {
                      setInsightsView("competitors");
                      setViewMenuOpen(false);
                    }}
                  >
                    Competitor list ({competitors.length})
                  </button>
                </div>
              ) : null}
            </div>

            {insightsView === "opportunities" && gaps.length > 0 ? (
              <PillTabFilterBar
                items={GAP_FILTER_OPTIONS.map(f => ({
                  id: f.id,
                  label: f.label,
                  count: gapCounts[f.id],
                }))}
                activeId={gapFilter}
                onChange={setGapFilter}
              />
            ) : null}
            </div>

            {insightsView === "opportunities" && filteredGaps.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {!massSelectMode ? (
                  <button
                    type="button"
                    aria-label="Mass select opportunities"
                    onClick={() => {
                      setMassSelectMode(true);
                      setSelectedGapIds(new Set());
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
                      onClick={() => void handleBulkApproveGaps()}
                      disabled={bulkApprovingGaps || selectedGapIds.size === 0}
                      className={`inline-flex h-8 w-38 shrink-0 cursor-pointer flex-col justify-center whitespace-nowrap rounded-full border border-brand-action/70 bg-brand-action px-2 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide text-brand-on-primary shadow-sm transition-[transform,box-shadow,opacity] duration-200 ease-out hover:-translate-y-px hover:shadow-md hover:shadow-brand-action/20 active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-35 motion-safe:hover:scale-105 ${
                        bulkApprovingGaps ? "animate-pulse cursor-wait" : ""
                      }`}
                    >
                      <span className="block max-w-full overflow-hidden truncate text-center tabular-nums">
                        {bulkApprovingGaps ? "…" : selectedGapIds.size > 0 ? `Approve (${selectedGapIds.size})` : "Approve"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={exitGapMassSelect}
                      disabled={bulkApprovingGaps}
                      className="inline-flex h-8 min-w-19 shrink-0 cursor-pointer flex-col justify-center whitespace-nowrap rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,opacity,colors] duration-200 ease-out hover:border-border-strong hover:text-text-primary hover:-translate-y-px active:scale-95 disabled:opacity-35 motion-safe:hover:scale-105"
                      title="Leave mass-select mode"
                    >
                      Cancel
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => void handleRun()}
                  disabled={running}
                  className="inline-flex h-8 items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
                >
                  {running ? (
                    <>
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-text-tertiary border-t-text-primary" />
                      Refreshing…
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                        />
                      </svg>
                      Refresh
                    </>
                  )}
                </button>
              </div>
            ) : null}
          </div>

          {insightsView === "opportunities" && (
            <OpportunityDashboard
              gaps={filteredGaps}
              gapFilter={gapFilter}
              hasGapsInProject={gaps.length > 0}
              averages={averages}
              generatingKeyword={generatingKeyword}
              approvedGapKeywords={approvedGapKeywords}
              rejectedGapKeywords={rejectedGapKeywords}
              onGapKeywordStatus={handleGapKeywordStatus}
              aiGapKeywordSet={aiGapKeywordSet}
              massSelectMode={massSelectMode}
              selectedGapIds={selectedGapIds}
              onToggleGapSelected={toggleGapRowSelected}
              bulkApprovingGaps={bulkApprovingGaps}
            />
          )}

          {insightsView === "competitors" && (
            <CompetitorList
              competitors={competitors}
              expandedId={expandedCompetitor}
              onToggle={id => setExpandedCompetitor(prev => (prev === id ? null : id))}
              statusById={competitorStatuses}
              onStatusChange={handleCompetitorStatus}
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

function gapKeywordWorkspaceStatus(
  keyword: string,
  approved: Set<string>,
  rejected: Set<string>
): KeywordStatus {
  const k = keyword.toLowerCase();
  if (rejected.has(k)) return "rejected";
  if (approved.has(k)) return "approved";
  return "pending";
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
  gapFilter,
  hasGapsInProject,
  averages,
  generatingKeyword,
  approvedGapKeywords,
  rejectedGapKeywords,
  onGapKeywordStatus,
  aiGapKeywordSet,
  massSelectMode,
  selectedGapIds,
  onToggleGapSelected,
  bulkApprovingGaps,
}: {
  gaps: KeywordGap[];
  gapFilter: "all" | GapType;
  hasGapsInProject: boolean;
  averages?: BenchmarkState["averages"];
  generatingKeyword: string | null;
  approvedGapKeywords: Set<string>;
  rejectedGapKeywords: Set<string>;
  onGapKeywordStatus: (keyword: string, next: KeywordStatus) => void;
  aiGapKeywordSet: Set<string>;
  massSelectMode: boolean;
  selectedGapIds: Set<string>;
  onToggleGapSelected: (gapId: string) => void;
  bulkApprovingGaps: boolean;
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
        <p className="text-[12px] font-bold uppercase tracking-widest text-text-tertiary">Keyword opportunities</p>
      </div>

      {gaps.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-border-strong bg-surface-secondary py-16 text-center text-[14px] text-text-tertiary">
          {!hasGapsInProject
            ? "No opportunities yet. Run a benchmark or click Refresh."
            : gapFilter === "all"
              ? "No opportunities match this view."
              : "No keyword gaps match this filter."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-surface-secondary text-[12px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
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
                  <th className="px-4 py-3">Keyword</th>
                  <th className="px-4 py-3 text-center">Gap</th>
                  <th className="px-4 py-3 text-right">Volume</th>
                  <th className="px-4 py-3 text-right">Traffic</th>
                  <th className="px-4 py-3 text-center">Weakness</th>
                  <th className="px-4 py-3 text-center">Opportunity</th>
                  <th className="px-4 py-3">Ranking page</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/60">
                {gaps.map(g => (
                  <tr
                    key={g.id}
                    onClick={e => {
                      const t = e.target as HTMLElement;
                      if (
                        t.closest(
                          "button, input, select, textarea, label, [data-keyword-action], [role='menu'], [role='menuitem'], [role='listbox'], [role='option'], a"
                        )
                      )
                        return;
                      if (massSelectMode && !bulkApprovingGaps) onToggleGapSelected(g.id);
                    }}
                    className={`transition-colors hover:bg-surface-hover ${
                      rejectedGapKeywords.has(g.keyword.toLowerCase()) ? "opacity-75" : ""
                    } ${massSelectMode && !bulkApprovingGaps ? "cursor-pointer" : ""} ${
                      selectedGapIds.has(g.id) ? "bg-surface-secondary/95 ring-1 ring-inset ring-brand-action/25" : ""
                    }`}
                  >
                    <td
                      className={`border-border-subtle align-middle transition-[width,padding] duration-300 ease-out ${
                        massSelectMode ? "w-12 px-4 py-3 opacity-100" : "w-0 max-w-0 border-0 p-0 opacity-0"
                      } overflow-hidden`}
                    >
                      <span
                        className={`flex justify-center transition-all duration-300 ease-out ${massSelectMode ? "opacity-100 scale-100 translate-x-0" : "pointer-events-none -translate-x-2 scale-90 opacity-0"}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedGapIds.has(g.id)}
                          onChange={() => onToggleGapSelected(g.id)}
                          onClick={e => e.stopPropagation()}
                          disabled={bulkApprovingGaps || !massSelectMode}
                          aria-label={`Select opportunity ${g.keyword}`}
                          className="rounded border-border-subtle text-brand-action focus:ring-brand-action"
                        />
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[260px]">
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
                    <td className="px-4 py-3 text-right text-[14px] font-mono text-text-secondary tabular-nums">
                      {g.volume > 0 ? g.volume.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-[14px] font-mono text-text-secondary tabular-nums">
                      {formatMonthlyTraffic(g.volume)}
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
                    <td
                      className="px-4 py-3 text-center"
                      onClick={e => e.stopPropagation()}
                      onPointerDown={e => e.stopPropagation()}
                    >
                      <KeywordActionDropdown
                        status={gapKeywordWorkspaceStatus(g.keyword, approvedGapKeywords, rejectedGapKeywords)}
                        busy={generatingKeyword === g.keyword || bulkApprovingGaps}
                        onChange={next => onGapKeywordStatus(g.keyword, next)}
                      />
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
  statusById,
  onStatusChange,
}: {
  competitors: Competitor[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  statusById: Record<string, KeywordStatus>;
  onStatusChange: (competitorId: string, next: KeywordStatus) => void;
}) {
  return (
    <div className="space-y-4">
      {competitors.map(c => {
        const expanded = expandedId === c.id;
        const rowStatus = statusById[c.id] ?? "pending";
        return (
          <div
            key={c.id}
            className={`rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden ${
              rowStatus === "rejected" ? "opacity-75" : ""
            }`}
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
                <KeywordActionDropdown
                  status={rowStatus}
                  onChange={next => onStatusChange(c.id, next)}
                />
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
