"use client";

import { useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import {
  auditExistingBlogs,
  auditSelectedUrls,
  deleteBlogAudits,
  getAllSitemapPages,
  getBlogAudits,
  type AuditCoverage,
  type PersistedBlogAudit,
  type SitemapPage,
} from "@/app/actions/audit-actions";
import { repairBlogFromAudit } from "@/app/actions/repair-actions";
import { addContentHealthKeywordToCalendar } from "@/app/actions/calendar-actions";
import { criticalityFromScore } from "@/lib/audit-criticality";
import type { IssueCategory, QualityRubricRow } from "@/lib/content-audit";
import { Tooltip, InfoIcon } from "@/components/Tooltip";

type AuditsResponse = Awaited<ReturnType<typeof getBlogAudits>>;

const EMPTY_COVERAGE: AuditCoverage = {
  blogs_found: 0,
  blogs_audited: 0,
  last_updated_at: null,
  avg_health: 0,
  high_severity: 0,
};

type SeverityFilter = "all" | "high" | "medium" | "low";

// ────────────────────────────────────────────────────────────────────────────
// Visual lookup tables — single source of truth for colors + tooltips.
const SEVERITY_COLORS: Record<"high" | "medium" | "low", string> = {
  high: "border-rose-500/30 bg-rose-500/10 text-rose-400",
  medium: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
  low: "border-accent-500/30 bg-accent-500/10 text-accent-400",
};

const SEVERITY_TOOLTIP: Record<"high" | "medium" | "low", string> = {
  high: "High criticality — health score under 45, or the page is broken / unreadable. Prioritize fixes or a rewrite.",
  medium: "Medium criticality — health score 45–71. Worth improving soon; the page has meaningful gaps vs our blog quality bar.",
  low: "Low criticality — health score 72+. Solid shape; remaining items are polish.",
};

const IMPACT_TOOLTIP: Record<"high" | "medium" | "low", string> = {
  high: "High impact — fixing this should meaningfully move traffic/rankings.",
  medium: "Medium impact — fixing this will help, but won't transform the page alone.",
  low: "Low impact — small lift.",
};

const CATEGORY_META: Record<IssueCategory, { label: string; tooltip: string; icon: string; color: string }> = {
  technical: {
    label: "Technical",
    tooltip:
      "Page plumbing — things like 404s, missing meta tags, broken title, missing schema, slow load. These usually block ranking entirely until fixed.",
    icon: "⚙️",
    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  },
  seo: {
    label: "SEO",
    tooltip:
      "On-page optimization — is the target keyword in the right places, is the H2 structure logical, are internal links helping.",
    icon: "🎯",
    color: "text-brand-400 bg-brand-500/10 border-brand-500/30",
  },
  content: {
    label: "Content",
    tooltip:
      "Writing quality — is the post deep enough, does it answer the reader\u2019s question fast, does it have examples and data.",
    icon: "📝",
    color: "text-accent-400 bg-accent-500/10 border-accent-500/30",
  },
  keyword_demand: {
    label: "Keyword demand",
    tooltip:
      "Is the keyword this post targets actually being searched right now? A perfectly written blog on a dead keyword will never get traffic.",
    icon: "📈",
    color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  },
  ux: {
    label: "Reader experience",
    tooltip:
      "How the page reads on the screen — scannable subheads, short paragraphs, lists, no walls of text.",
    icon: "👁",
    color: "text-pink-400 bg-pink-500/10 border-pink-500/30",
  },
};

const CATEGORY_ORDER: IssueCategory[] = ["technical", "keyword_demand", "seo", "content", "ux"];

const RUBRIC_STATUS: Record<QualityRubricRow["status"], { label: string; className: string }> = {
  pass: { label: "Pass", className: "border-accent-500/40 bg-accent-500/10 text-accent-400" },
  warn: { label: "Warn", className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400" },
  fail: { label: "Fail", className: "border-rose-500/40 bg-rose-500/10 text-rose-400" },
};

const DEMAND_VERDICT: Record<
  NonNullable<PersistedBlogAudit["analysis"]["keyword_demand"]>["verdict"],
  { label: string; color: string; tooltip: string }
> = {
  trending: {
    label: "Trending up",
    color: "border-accent-500/40 bg-accent-500/10 text-accent-400",
    tooltip: "Search volume for this keyword is growing. The demand is real — fixing the page should actually earn traffic.",
  },
  stable: {
    label: "Stable",
    color: "border-cyan-500/40 bg-cyan-500/10 text-cyan-400",
    tooltip: "Search volume is roughly flat. Traffic is available if the page ranks — worth fixing.",
  },
  declining: {
    label: "Declining",
    color: "border-rose-500/40 bg-rose-500/10 text-rose-400",
    tooltip: "Searches for this keyword are trending down. Even a perfect rewrite will return diminishing traffic — consider retargeting to a related, healthier keyword.",
  },
  niche: {
    label: "Niche",
    color: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
    tooltip: "Very low monthly volume. The topic may be too specialized for meaningful blog traffic — but it can still win quality leads if intent matches.",
  },
  unknown: {
    label: "No data",
    color: "border-border-subtle bg-surface-elevated text-text-tertiary",
    tooltip: "We couldn\u2019t confirm current search demand (DataForSEO didn\u2019t return a match). Treat the keyword as unverified.",
  },
};

function healthColor(score: number): string {
  if (score >= 75) return "text-accent-400";
  if (score >= 50) return "text-yellow-400";
  return "text-rose-400";
}

function scoreBar(score: number): string {
  if (score >= 75) return "bg-accent-500";
  if (score >= 50) return "bg-yellow-500";
  return "bg-rose-500";
}

/** Focus phrase for calendar: primary keyword, demand keyword, or URL slug fallback. */
function focusKeywordForCalendar(row: PersistedBlogAudit): string {
  if (row.primary_keyword.trim()) return row.primary_keyword.trim();
  const d = row.analysis.keyword_demand?.keyword?.trim();
  if (d) return d;
  try {
    const u = new URL(row.url);
    const segs = u.pathname.split("/").filter(Boolean);
    const slug = segs[segs.length - 1] ?? "";
    const fromSlug = slug.replace(/-/g, " ").trim();
    if (fromSlug) return fromSlug;
  } catch {
    /* noop */
  }
  const t = row.title.trim();
  if (t && !t.startsWith("http")) return t.slice(0, 120);
  return "Blog content refresh";
}

// ────────────────────────────────────────────────────────────────────────────
export default function ContentHealthPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const AUDITS_KEY = qk.audits(projectId);

  const [running, setRunning] = useState(false);
  const [runSummary, setRunSummary] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [repairing, setRepairing] = useState<string | null>(null);
  const [calendarAddingUrl, setCalendarAddingUrl] = useState<string | null>(null);

  // ── Page discovery state ──────────────────────────────────────────────
  const [discoverTab, setDiscoverTab] = useState<"discover" | "audited">("audited");
  const [selectedBasePath, setSelectedBasePath] = useState<string>("");
  const [manualUrl, setManualUrl] = useState("");
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [auditingSelected, setAuditingSelected] = useState(false);
  const [discoverError, setDiscoverError] = useState("");

  const { data: pagesData, isLoading: pagesLoading, refetch: refetchPages } = useQuery({
    queryKey: ["sitemap-pages", projectId, selectedBasePath] as const,
    queryFn: () => getAllSitemapPages(projectId, selectedBasePath || undefined),
    enabled: discoverTab === "discover",
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
  const sitemapPages: SitemapPage[] = pagesData?.success ? pagesData.pages : [];
  const basePaths: string[] = pagesData?.basePaths ?? [];

  const togglePageSelect = useCallback((url: string) => {
    setSelectedUrls(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else if (next.size < 5) next.add(url);
      return next;
    });
  }, []);

  const handleAuditSelected = async () => {
    const urls = [...selectedUrls];
    if (manualUrl.trim() && /^https?:\/\//i.test(manualUrl.trim())) {
      urls.push(manualUrl.trim());
    }
    if (!urls.length) return;
    if (urls.length > 5) { setDiscoverError("Maximum 5 pages at once"); return; }

    setAuditingSelected(true);
    setDiscoverError("");
    const res = await auditSelectedUrls(projectId, urls.slice(0, 5));
    if (res.success) {
      setRunSummary(`Audited ${res.audited} page(s)${res.failed ? `, ${res.failed} failed` : ""}.`);
      setSelectedUrls(new Set());
      setManualUrl("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: AUDITS_KEY }),
        queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) }),
        refetchPages(),
      ]);
      setDiscoverTab("audited");
    } else {
      setDiscoverError(res.error ?? "Audit failed");
    }
    setAuditingSelected(false);
  };

  const BATCH_SIZE = 10;

  const { data: auditData, isLoading: loading } = useQuery<AuditsResponse>({
    queryKey: AUDITS_KEY,
    queryFn: async () => {
      const res = await getBlogAudits(projectId);
      if (!res.success) throw new Error(res.error ?? "Failed to load audits");
      return res;
    },
    enabled: !!projectId,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
  const rows: PersistedBlogAudit[] = auditData?.success ? auditData.data : [];
  const coverage: AuditCoverage = auditData?.success ? auditData.coverage : EMPTY_COVERAGE;

  const handleRun = async (force: boolean) => {
    setRunning(true);
    setRunSummary("");
    setError("");
    const res = await auditExistingBlogs(projectId, { force, limit: BATCH_SIZE });
    if (res.success) {
      const remaining = Math.max(0, res.coverage.blogs_found - res.coverage.blogs_audited);
      setRunSummary(
        `Audited ${res.audited}${res.failed ? ` · failed ${res.failed}` : ""}${
          remaining ? ` · ${remaining} still pending` : ""
        }`
      );
      // Refresh the audit list and the sidebar pending-audit badge.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: AUDITS_KEY }),
        queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) }),
      ]);
    } else {
      setError(res.error ?? "Audit failed");
    }
    setRunning(false);
  };

  const handleClear = async () => {
    if (!confirm("Delete all audit results for this project? You can re-run the audit any time.")) return;
    setRunning(true);
    await deleteBlogAudits(projectId);
    // Optimistically clear rows and zero the audited count, but keep blogs_found.
    queryClient.setQueryData<AuditsResponse>(AUDITS_KEY, prev => {
      if (!prev?.success) return prev;
      return {
        ...prev,
        data: [],
        coverage: { ...prev.coverage, blogs_audited: 0, last_updated_at: null, avg_health: 0, high_severity: 0 },
      };
    });
    queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
    setRunning(false);
  };

  const handleRepair = async (audit: PersistedBlogAudit) => {
    setRepairing(audit.url);
    setError("");
    const res = await repairBlogFromAudit(projectId, audit.url);
    if (res.success && res.data) {
      router.push(`/projects/${projectId}/blogs/${res.data.blogId}`);
    } else {
      setError(res.error ?? "Repair failed");
      setRepairing(null);
    }
  };

  const handleAddToCalendar = async (row: PersistedBlogAudit) => {
    const focus = focusKeywordForCalendar(row);
    if (focus.length < 2) {
      setError("This audit row has no usable focus keyword to schedule.");
      return;
    }
    setCalendarAddingUrl(row.url);
    setError("");
    setRunSummary("");
    const res = await addContentHealthKeywordToCalendar(projectId, { focusKeyword: focus, auditUrl: row.url });
    if (res.success) {
      const r = res as { data?: { scheduled_date?: string }; scheduled_date?: string };
      const scheduled = (typeof r.scheduled_date === "string" ? r.scheduled_date : undefined) ?? r.data?.scheduled_date;
      setRunSummary(
        scheduled
          ? `Added “${focus}” to your calendar for ${scheduled}.`
          : `Added “${focus}” to your calendar. Open Calendar to see it.`
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) }),
      ]);
    } else {
      const msg = "error" in res && typeof res.error === "string" ? res.error : "Could not add to calendar";
      setError(msg);
    }
    setCalendarAddingUrl(null);
  };

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter(r => criticalityFromScore(r.health_score, r.analysis.page_status) === filter);
  }, [rows, filter]);

  const toggleExpanded = (url: string) =>
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(url)) s.delete(url);
      else s.add(url);
      return s;
    });

  const pendingAudits = Math.max(0, coverage.blogs_found - coverage.blogs_audited);

  return (
    <div className="space-y-10 pb-16 pl-4 pr-4 mx-auto">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="pt-4 pb-8 border-b border-border-subtle flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[48px] font-normal tracking-[-0.96px] leading-none text-text-primary font-display">
            Content health
          </h1>
          <p className="mt-3 text-[16px] text-text-tertiary max-w-[600px]">
            We audit each blog on its own merits — is the page technically healthy, is the target keyword still worth
            ranking for, and does the writing answer the reader's question. Click <strong className="text-text-secondary font-medium">See fixes</strong> to
            expand the diagnosis, and <strong className="text-text-secondary font-medium">Repair with AI</strong> to open an improved rewrite.
          </p>
          <p className="mt-2 text-[12px] text-text-tertiary">
            Audits run in batches of {BATCH_SIZE} to keep LLM costs predictable.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleRun(false)}
            disabled={running || (coverage.blogs_audited > 0 && pendingAudits === 0)}
            className="inline-flex h-10 items-center gap-2 rounded-[32px] bg-brand-primary px-6 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {running ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-on-primary/30 border-t-brand-on-primary" />
                Auditing…
              </>
            ) : coverage.blogs_audited === 0 ? (
              `Audit first ${Math.min(BATCH_SIZE, Math.max(coverage.blogs_found, BATCH_SIZE))} blogs`
            ) : pendingAudits === 0 ? (
              "All audited"
            ) : (
              `Re-audit ${Math.min(BATCH_SIZE, pendingAudits)} more`
            )}
          </button>
          <button
            type="button"
            onClick={() => handleRun(true)}
            disabled={running || coverage.blogs_audited === 0}
            title="Re-run the audit on 10 already-audited blogs."
            className="inline-flex h-10 items-center gap-2 rounded-[30px] border border-border-subtle bg-surface-secondary px-5 text-[14px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-40"
          >
            Re-audit 10
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={running || rows.length === 0}
            title="Delete all stored audit results for this project."
            className="inline-flex h-10 items-center rounded-[30px] border border-brand-coral/20 bg-brand-coral/10 px-4 text-[13px] font-medium text-brand-coral hover:bg-brand-coral/20 transition-colors disabled:opacity-40"
          >
            Clear all
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-5 rounded-[16px] bg-brand-coral/10 border border-brand-coral/20 text-brand-coral text-[14px]">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          {error}
        </div>
      )}
      {runSummary && !error && (
        <div className="flex items-center gap-3 p-4 rounded-[16px] bg-brand-action/5 border border-brand-action/20 text-brand-action text-[14px]">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7"/></svg>
          {runSummary}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Blogs found"
          value={coverage.blogs_found}
          sub="on your sitemap"
          tooltip="Total blog-style URLs found in your sitemap (/blog/, /blogs/, /articles/, /posts/, etc.)."
        />
        <StatCard
          label="Audited"
          value={coverage.blogs_audited}
          sub={`${pendingAudits} pending`}
          tooltip="How many blogs have been scraped and diagnosed. Run more audits to increase coverage."
        />
        <StatCard
          label="Avg. health"
          value={coverage.avg_health}
          sub="0–100"
          valueClass={healthColor(coverage.avg_health)}
          tooltip="Average health score across every audited blog — blends technical signals with content quality. Higher = closer to rank-ready."
        />
        <StatCard
          label="High-severity"
          value={coverage.high_severity}
          sub="need fixes now"
          valueClass="text-rose-400"
          tooltip="Blogs with at least one high-severity issue — actively blocked from ranking or AI citation today."
        />
      </div>

      {/* ── Discover / Audited Tab Switcher ────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1 rounded-[10px] border border-border-subtle bg-surface-secondary p-1 w-fit">
          <button
            type="button"
            onClick={() => setDiscoverTab("audited")}
            className={`rounded-[7px] px-5 py-2 text-[13px] font-medium transition-all duration-150 ${
              discoverTab === "audited"
                ? "bg-surface-elevated text-text-primary shadow-sm ring-1 ring-border-subtle/80"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            Audited ({coverage.blogs_audited})
          </button>
          <button
            type="button"
            onClick={() => setDiscoverTab("discover")}
            className={`rounded-[7px] px-5 py-2 text-[13px] font-medium transition-all duration-150 ${
              discoverTab === "discover"
                ? "bg-surface-elevated text-text-primary shadow-sm ring-1 ring-border-subtle/80"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            Discover Pages
          </button>
        </div>
        {discoverTab === "discover" && basePaths.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">Filter</label>
            <select
              value={selectedBasePath}
              onChange={e => { setSelectedBasePath(e.target.value); setSelectedUrls(new Set()); }}
              className="rounded-[8px] border border-border-subtle bg-surface-secondary px-3 py-1.5 text-[13px] text-text-primary outline-none"
            >
              <option value="">All pages ({pagesData?.total ?? 0})</option>
              {basePaths.map(bp => (
                <option key={bp} value={bp}>{bp} ({sitemapPages.filter(p => p.basePath === bp).length || "…"})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Discover Pages View ────────────────────────────────────────────── */}
      {discoverTab === "discover" && (
        <div className="space-y-4">
          {discoverError && (
            <div className="flex items-start gap-3 p-4 rounded-[12px] bg-brand-coral/10 border border-brand-coral/20 text-brand-coral text-[13px]">
              {discoverError}
            </div>
          )}

          {/* Manual URL input */}
          <div className="flex items-center gap-2">
            <input
              type="url"
              value={manualUrl}
              onChange={e => setManualUrl(e.target.value)}
              placeholder="Paste a URL to audit manually…"
              className="flex-1 rounded-[10px] border border-border-subtle bg-surface-elevated px-4 py-2.5 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-brand-action/40 transition-colors"
            />
            <button
              type="button"
              disabled={auditingSelected || (!selectedUrls.size && !manualUrl.trim())}
              onClick={() => void handleAuditSelected()}
              className="inline-flex h-10 items-center gap-2 rounded-[32px] bg-brand-primary px-5 text-[13px] font-medium text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-50 shrink-0"
            >
              {auditingSelected ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-on-primary/30 border-t-brand-on-primary" />
                  Auditing…
                </>
              ) : (
                `Audit${selectedUrls.size ? ` ${selectedUrls.size} selected` : manualUrl.trim() ? " URL" : ""} (max 5)`
              )}
            </button>
          </div>

          {pagesLoading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-[12px] border border-border-subtle bg-surface-elevated" />
              ))}
            </div>
          ) : sitemapPages.length === 0 ? (
            <div className="rounded-[16px] border border-dashed border-border-strong bg-surface-secondary py-12 text-center">
              <p className="text-[14px] text-text-tertiary">No pages found in your sitemap. Make sure sitemap.xml is reachable.</p>
            </div>
          ) : (
            <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface-secondary text-[10px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                    <tr>
                      <th className="px-3 py-3 w-10 text-center">
                        <span className="sr-only">Select</span>
                      </th>
                      <th className="px-4 py-3">URL</th>
                      <th className="px-4 py-3 w-28">Section</th>
                      <th className="px-4 py-3 w-28 text-center">Status</th>
                      <th className="px-4 py-3 w-24 text-center">Score</th>
                      <th className="px-4 py-3 w-32">Keyword</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/60">
                    {sitemapPages.slice(0, 100).map(page => {
                      const isSelected = selectedUrls.has(page.url);
                      return (
                        <tr
                          key={page.url}
                          onClick={() => togglePageSelect(page.url)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? "bg-brand-action/5" : "hover:bg-surface-hover/50"
                          }`}
                        >
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => togglePageSelect(page.url)}
                              disabled={!isSelected && selectedUrls.size >= 5}
                              className="h-4 w-4 rounded border-border-subtle accent-brand-action"
                            />
                          </td>
                          <td className="px-4 py-2.5 max-w-[400px]">
                            <a
                              href={page.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="block truncate text-[13px] text-brand-action hover:underline"
                              title={page.url}
                            >
                              {(() => { try { return new URL(page.url).pathname; } catch { return page.url; } })()}
                            </a>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="rounded-[4px] bg-surface-tertiary px-2 py-0.5 text-[11px] font-mono text-text-tertiary">
                              {page.basePath}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {page.audited ? (
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                                page.severity === "high"
                                  ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                                  : page.severity === "medium"
                                  ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
                                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              }`}>
                                {page.severity ?? "audited"}
                              </span>
                            ) : (
                              <span className="text-[11px] text-text-tertiary">Pending</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {page.audited && page.healthScore !== undefined ? (
                              <span className={`font-mono text-[13px] font-bold ${healthColor(page.healthScore)}`}>
                                {page.healthScore}
                              </span>
                            ) : (
                              <span className="text-[11px] text-text-tertiary">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {page.primaryKeyword ? (
                              <span className="text-[12px] text-text-secondary truncate block max-w-[120px]">{page.primaryKeyword}</span>
                            ) : (
                              <span className="text-[11px] text-text-tertiary">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {sitemapPages.length > 100 && (
                <div className="border-t border-border-subtle px-4 py-3 bg-surface-secondary/50 text-[12px] text-text-tertiary">
                  Showing first 100 of {sitemapPages.length} pages. Use the section filter to narrow down.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Audited Results View ──────────────────────────────────────────── */}
      {discoverTab === "audited" && (
        <>

      {coverage.blogs_found === 0 && !loading && (
        <div className="rounded-[22px] border border-dashed border-border-strong bg-surface-secondary py-24 text-center">
          <div className="mb-6 flex justify-center">
            <div className="w-16 h-16 rounded-[16px] bg-surface-tertiary flex items-center justify-center text-text-primary border border-border-subtle">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803a7.5 7.5 0 0 0 10.607 0z" />
              </svg>
            </div>
          </div>
          <h3 className="mb-3 text-[24px] font-normal tracking-[-0.24px] text-text-primary font-display">No blog URLs found</h3>
          <p className="mb-8 text-[16px] text-text-tertiary max-w-md mx-auto">
            We couldn't find blog-style URLs in your sitemap. Make sure sitemap.xml includes paths like{" "}
            <code className="rounded-[4px] bg-surface-elevated px-1.5 py-0.5 text-[13px]">/blog/…</code>. Then refresh your brief.
          </p>
          <Link
            href={`/projects/${projectId}/keywords`}
            className="inline-flex items-center justify-center rounded-[32px] border border-border-subtle bg-surface-secondary px-6 py-3 text-[14px] font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            Go refresh the brief
          </Link>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap gap-1 rounded-[8px] border border-border-subtle bg-surface-secondary p-1 w-fit">
          {(["all", "high", "medium", "low"] as SeverityFilter[]).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              title={f === "all" ? "Show every audited blog." : SEVERITY_TOOLTIP[f]}
              className={`rounded-[4px] px-4 py-1.5 text-[13px] font-medium capitalize transition-all ${
                filter === f ? "bg-surface-elevated text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {f} (
              {f === "all"
                ? rows.length
                : rows.filter(r => criticalityFromScore(r.health_score, r.analysis.page_status) === f).length}
              )
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-24 w-full animate-pulse rounded-[16px] border border-border-subtle bg-surface-elevated"
            />
          ))}
        </div>
      ) : filtered.length === 0 && coverage.blogs_found > 0 ? (
        <div className="rounded-[22px] border border-dashed border-border-strong bg-surface-secondary py-16 text-center text-[14px] text-text-tertiary">
          {coverage.blogs_audited === 0
            ? `Click "Audit first ${BATCH_SIZE} blogs" to begin.`
            : "No blogs match this filter."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(row => {
            const a = row.analysis;
            const isOpen = expanded.has(row.url);
            const demand = a.keyword_demand;
            const demandVerdict = demand ? DEMAND_VERDICT[demand.verdict] : null;
            const groupedIssues = groupIssuesByCategory(a.issues);
            const isBroken = a.page_status === "broken" || a.page_status === "redirected";
            const canRepair =
              !isBroken && row.scraped_chars > 400 && a.issues.length > 0 && !repairing;
            const crit = criticalityFromScore(row.health_score, a.page_status);

            return (
              <div
                key={row.url}
                className="rounded-[16px] border border-border-subtle bg-surface-elevated p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span
                        title={SEVERITY_TOOLTIP[crit]}
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase cursor-help ${
                          SEVERITY_COLORS[crit]
                        }`}
                      >
                        {crit}
                      </span>
                      {row.primary_keyword && (
                        <span
                          title="Our best guess at the keyword this blog is trying to rank for. We infer it from the title, H1, first paragraph, and body."
                          className="rounded-full border border-brand-500/20 bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold text-brand-400 cursor-help"
                        >
                          kw: {row.primary_keyword}
                        </span>
                      )}
                      {demandVerdict && (
                        <span
                          title={`${demandVerdict.tooltip}\n\nVolume: ${demand?.volume?.toLocaleString() ?? 0}/mo · trend ${demand?.trend_pct != null && demand.trend_pct >= 0 ? "+" : ""}${demand?.trend_pct ?? 0}%`}
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold cursor-help ${demandVerdict.color}`}
                        >
                          {demandVerdict.label}
                          {demand && demand.volume > 0 ? ` · ${formatVolume(demand.volume)}/mo` : ""}
                        </span>
                      )}
                      {a.suggested_funnel_stage && (
                        <span
                          title="Funnel stage this post is best suited for. TOFU = awareness, MOFU = evaluation, BOFU = decision. Helps you decide what to link it to internally and what CTA to put at the end."
                          className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-400 cursor-help"
                        >
                          {a.suggested_funnel_stage}
                        </span>
                      )}
                      <span className="text-[11px] text-text-tertiary">
                        {row.word_count.toLocaleString()} words
                      </span>
                    </div>
                    <p className="font-semibold text-text-primary truncate" title={row.title}>
                      {row.title || row.url}
                    </p>
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-block max-w-full truncate text-xs text-brand-400 hover:underline"
                    >
                      {row.url}
                    </a>
                    {a.plain_language_verdict && (
                      <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                        {a.plain_language_verdict}
                      </p>
                    )}
                    {!a.plain_language_verdict && a.summary && (
                      <p className="mt-2 text-xs text-text-secondary line-clamp-2">{a.summary}</p>
                    )}
                    {row.error && (
                      <p className="mt-1 text-xs text-rose-400">Error: {row.error}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 min-w-[160px]">
                    <div
                      title="Health score 0–100. Criticality: under 45 = high, 45–71 = medium, 72+ = low (broken pages always high)."
                      className="flex items-center gap-2 cursor-help"
                    >
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-elevated">
                        <div
                          className={`h-full rounded-full ${scoreBar(row.health_score)}`}
                          style={{ width: `${row.health_score}%` }}
                        />
                      </div>
                      <span className={`text-lg font-black ${healthColor(row.health_score)}`}>
                        {row.health_score}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-2 w-full max-w-[220px]">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(row.url)}
                        className="text-xs font-bold text-brand-400 hover:text-brand-300 self-end"
                      >
                        {isOpen ? "Hide details" : "See fixes"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddToCalendar(row)}
                        disabled={calendarAddingUrl !== null || !!repairing}
                        title="Put this row's focus keyword on the next free day in your content calendar (links to an existing keyword row when the text matches)."
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-border-subtle bg-surface-secondary px-3 py-2 text-[11px] font-bold text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 transition-colors"
                      >
                        {calendarAddingUrl === row.url ? (
                          <>
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-text-tertiary/30 border-t-text-secondary" />
                            Adding…
                          </>
                        ) : (
                          "Add to calendar"
                        )}
                      </button>
                      {canRepair && (
                        <button
                          type="button"
                          onClick={() => handleRepair(row)}
                          disabled={!!repairing}
                          title="Use AI to rewrite this blog addressing every issue flagged. Opens the repaired draft in the blog editor — you can review and download or schedule it from there."
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 px-3 py-2 text-[11px] font-bold text-white shadow-sm shadow-brand-500/30 hover:from-brand-400 hover:to-brand-500 disabled:opacity-60"
                        >
                          {repairing === row.url ? (
                            <>
                              <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                              Repairing…
                            </>
                          ) : (
                            <>
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.847-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                              </svg>
                              Repair with AI
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-5 space-y-5">
                    {a.quality_rubric && a.quality_rubric.length > 0 && (
                      <div className="rounded-[12px] border border-border-subtle bg-surface-secondary/80 p-4">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary mb-3">
                          SerpCraft blog quality rubric
                        </h4>
                        <p className="text-[12px] text-text-tertiary mb-3 leading-relaxed">
                          Each row is checked against the same rules we use for AI-generated posts (direct answer in the first ~80 words, H2/H3
                          structure, FAQ + JSON-LD, external citations, internal links, depth). Pass / warn / fail is computed from your live page
                          text.
                        </p>
                        <ul className="space-y-2">
                          {a.quality_rubric.map(row => {
                            const meta = RUBRIC_STATUS[row.status];
                            return (
                              <li
                                key={row.id}
                                className="flex flex-wrap items-start gap-2 rounded-[8px] border border-border-subtle bg-surface-elevated px-3 py-2"
                              >
                                <span
                                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase border ${meta.className}`}
                                >
                                  {meta.label}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[13px] font-medium text-text-primary">{row.label}</p>
                                  <p className="text-[12px] text-text-tertiary mt-0.5 leading-relaxed">{row.detail}</p>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                    {/* Grouped issues, by category */}
                    {a.issues.length === 0 ? (
                      <p className="text-xs text-text-tertiary">No explicit issues flagged.</p>
                    ) : (
                      <div className="space-y-4">
                        {CATEGORY_ORDER.filter(c => groupedIssues[c]?.length).map(cat => {
                          const meta = CATEGORY_META[cat];
                          return (
                            <div key={cat}>
                              <div className="mb-2 flex items-center gap-2">
                                <span
                                  title={meta.tooltip}
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider cursor-help ${meta.color}`}
                                >
                                  <span>{meta.icon}</span> {meta.label}
                                </span>
                                <span className="text-[10px] text-text-tertiary">
                                  ({groupedIssues[cat]!.length} issue{groupedIssues[cat]!.length === 1 ? "" : "s"})
                                </span>
                              </div>
                              <ul className="space-y-2">
                                {groupedIssues[cat]!.map((issue, i) => (
                                  <IssueCard key={`${cat}-${i}`} issue={issue} />
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      {a.content_gaps.length > 0 && (
                        <div>
                          <p
                            title="Subtopics this blog is missing that would make it more useful to readers. The LLM looks at what a reader searching this keyword would reasonably expect but isn't in the post."
                            className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-tertiary cursor-help"
                          >
                            What&apos;s missing from this post
                          </p>
                          <ul className="space-y-1 text-xs text-text-secondary">
                            {a.content_gaps.map(g => (
                              <li key={g}>· {g}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {a.internal_link_opportunities.length > 0 && (
                        <div>
                          <p
                            title="Other blogs on your own site that this post should link to. Every internal link you add tells Google the cluster is a topical authority — which lifts ALL the linked pages."
                            className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-tertiary cursor-help"
                          >
                            Link from this post to
                          </p>
                          <ul className="space-y-1.5">
                            {a.internal_link_opportunities.map(l => (
                              <li key={l.target_url} className="text-xs">
                                <a
                                  href={l.target_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block truncate text-brand-400 hover:underline"
                                  title={l.target_url}
                                >
                                  {l.target_url}
                                </a>
                                {l.reason && (
                                  <span className="text-[11px] text-text-tertiary">{l.reason}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {a.secondary_keywords.length > 0 && (
                        <div className="md:col-span-2">
                          <p
                            title="Related keywords we saw used throughout this post. If any of these have higher demand than the primary keyword, consider re-targeting the page."
                            className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-tertiary cursor-help"
                          >
                            Secondary keywords detected
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {a.secondary_keywords.map(k => (
                              <span
                                key={k}
                                className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] text-text-secondary"
                              >
                                {k}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* close discoverTab === "audited" */}
      </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponents

function IssueCard({ issue }: { issue: PersistedBlogAudit["analysis"]["issues"][number] }) {
  const [showMore, setShowMore] = useState(false);
  const hasMore = issue.why_it_matters && issue.why_it_matters.length > 0;

  return (
    <li className="rounded-xl border border-border-subtle bg-surface-primary/40 p-3">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span
          title={SEVERITY_TOOLTIP[issue.severity]}
          className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase cursor-help ${SEVERITY_COLORS[issue.severity]}`}
        >
          {issue.severity}
        </span>
        <span
          title={IMPACT_TOOLTIP[issue.impact]}
          className="rounded-full border border-border-subtle bg-surface-elevated px-2 py-0.5 text-[9px] font-bold uppercase text-text-tertiary cursor-help"
        >
          impact: {issue.impact}
        </span>
        <span className="text-xs font-bold text-text-primary">{issue.label}</span>
      </div>
      {issue.detail && (
        <p className="text-xs text-text-secondary leading-relaxed">{issue.detail}</p>
      )}
      {issue.fix && (
        <p className="mt-1 text-xs text-accent-400">
          <span className="font-bold">Fix: </span>
          {issue.fix}
        </p>
      )}
      {hasMore && (
        <>
          {showMore && (
            <p className="mt-2 rounded-lg border border-border-subtle bg-surface-elevated/50 p-2 text-[11px] text-text-tertiary leading-relaxed">
              <span className="font-bold text-text-secondary">Why this matters · </span>
              {issue.why_it_matters}
            </p>
          )}
          <button
            type="button"
            onClick={() => setShowMore(v => !v)}
            className="mt-1 text-[11px] font-bold text-brand-400 hover:text-brand-300"
          >
            {showMore ? "Hide explanation" : "Why does this matter?"}
          </button>
        </>
      )}
    </li>
  );
}

function StatCard({
  label,
  value,
  sub,
  valueClass = "text-text-primary",
  tooltip,
}: {
  label: string;
  value: number;
  sub: string;
  accent?: string;
  valueClass?: string;
  tooltip?: string;
}) {
  return (
    <div className="rounded-[16px] border border-border-subtle bg-surface-elevated p-5 flex flex-col">
      <div className="flex items-center gap-1.5 mb-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">{label}</p>
        {tooltip && <Tooltip content={tooltip}><InfoIcon /></Tooltip>}
      </div>
      <p className={`font-mono text-[32px] font-bold tracking-tight leading-none ${valueClass}`}>{value}</p>
      <p className="mt-2 text-[12px] text-text-tertiary">{sub}</p>
    </div>
  );
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

function groupIssuesByCategory(
  issues: PersistedBlogAudit["analysis"]["issues"]
): Partial<Record<IssueCategory, PersistedBlogAudit["analysis"]["issues"]>> {
  const out: Partial<Record<IssueCategory, PersistedBlogAudit["analysis"]["issues"]>> = {};
  for (const i of issues) {
    const cat: IssueCategory = (i.category as IssueCategory) ?? "content";
    (out[cat] ||= []).push(i);
  }
  return out;
}
