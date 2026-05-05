"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query";
import type { AuditCoverage, PersistedBlogAudit, SitemapPage } from "@/app/actions/audit-actions";
import { auditsApi } from "@/frontend/api/audits";
import { calendarApi } from "@/frontend/api/calendar";
import { AuditDetailModal } from "@/components/AuditDetailModal";
import { KeywordActionDropdown } from "@/components/keywords/KeywordActionDropdown";
import { buildContentHealthAuditSnapshot, extractCalendarFocusKeyword } from "@/lib/content-health-calendar";
import { criticalityFromScore } from "@/lib/audit-criticality";
import { Tooltip, InfoIcon } from "@/components/Tooltip";
import type { KeywordStatus } from "@/lib/types";

type AuditsResponse = Awaited<ReturnType<typeof auditsApi.list>>;

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

// ────────────────────────────────────────────────────────────────────────────
export default function ContentHealthPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const AUDITS_KEY = qk.audits(projectId);

  const [running, setRunning] = useState(false);
  const [runSummary, setRunSummary] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [modalAudit, setModalAudit] = useState<PersistedBlogAudit | null>(null);
  const [calendarAddingUrl, setCalendarAddingUrl] = useState<string | null>(null);
  /** URLs we successfully queued (or already had) on the calendar this session — drives the schedule control without an extra round-trip. */
  const [calendarLinkedByUrl, setCalendarLinkedByUrl] = useState<Record<string, boolean>>({});
  const [dismissedAuditUrls, setDismissedAuditUrls] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setDismissedAuditUrls(loadDismissedAuditUrls(projectId));
  }, [projectId]);

  const persistDismissedAuditUrls = useCallback((next: Set<string>) => {
    try {
      localStorage.setItem(dismissedAuditsStorageKey(projectId), JSON.stringify([...next]));
    } catch {
      /* ignore quota / private mode */
    }
  }, [projectId]);

  const dismissAuditRow = useCallback(
    (url: string) => {
      setDismissedAuditUrls(prev => {
        const n = new Set(prev);
        n.add(url);
        persistDismissedAuditUrls(n);
        return n;
      });
    },
    [persistDismissedAuditUrls]
  );

  // ── Page discovery state ──────────────────────────────────────────────
  const [discoverTab, setDiscoverTab] = useState<"discover" | "audited">("audited");
  const [selectedBasePath, setSelectedBasePath] = useState<string>("");
  const [manualUrl, setManualUrl] = useState("");
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [auditingSelected, setAuditingSelected] = useState(false);
  const [discoverError, setDiscoverError] = useState("");

  const { data: pagesData, isLoading: pagesLoading, refetch: refetchPages } = useQuery({
    queryKey: ["sitemap-pages", projectId, selectedBasePath] as const,
    queryFn: () => auditsApi.sitemapPages(projectId, selectedBasePath || undefined),
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
    const res = await auditsApi.auditSelected(projectId, urls.slice(0, 5));
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
      const res = await auditsApi.list(projectId);
      if (!res.success) throw new Error(res.error ?? "Failed to load audits");
      return res;
    },
    enabled: !!projectId,
  });
  const rows: PersistedBlogAudit[] = auditData?.success ? auditData.data : [];
  const coverage: AuditCoverage = auditData?.success ? auditData.coverage : EMPTY_COVERAGE;

  const handleRun = async (force: boolean) => {
    setRunning(true);
    setRunSummary("");
    setError("");
    const res = await auditsApi.run(projectId, { force, limit: BATCH_SIZE });
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
    await auditsApi.clear(projectId);
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

  const handleAddToCalendar = async (row: PersistedBlogAudit) => {
    const focus = extractCalendarFocusKeyword(row);
    if (focus.length < 2) {
      setError("This audit row has no usable focus keyword to schedule.");
      return;
    }
    setCalendarAddingUrl(row.url);
    setError("");
    setRunSummary("");
    const snapshot = buildContentHealthAuditSnapshot(row);
    const res = await calendarApi.addContentHealth(projectId, {
      focusKeyword: focus,
      auditUrl: row.url,
      contentHealthAudit: snapshot as unknown as Record<string, unknown>,
    });
    if (res.success) {
      setCalendarLinkedByUrl(prev => ({ ...prev, [row.url]: true }));
      setModalAudit(null);
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
      if (/already on your calendar|already scheduled/i.test(msg)) {
        setCalendarLinkedByUrl(prev => ({ ...prev, [row.url]: true }));
      }
      setError(msg);
    }
    setCalendarAddingUrl(null);
  };

  const filtered = useMemo(() => {
    const bySeverity =
      filter === "all" ? rows : rows.filter(r => criticalityFromScore(r.health_score, r.analysis.page_status) === filter);
    return bySeverity;
  }, [rows, filter]);

  const handleAuditKeywordStatus = (row: PersistedBlogAudit, next: KeywordStatus) => {
    const url = row.url;
    const dismissed = dismissedAuditUrls.has(url);
    const onCal = !!calendarLinkedByUrl[url];

    if (next === "rejected") {
      if (!dismissed) dismissAuditRow(url);
      return;
    }
    if (next === "approved") {
      if (!onCal) void handleAddToCalendar(row);
      return;
    }
    if (dismissed) {
      setDismissedAuditUrls(prev => {
        const n = new Set(prev);
        n.delete(url);
        persistDismissedAuditUrls(n);
        return n;
      });
    }
    if (onCal) {
      setCalendarLinkedByUrl(prev => {
        const { [url]: _removed, ...rest } = prev;
        return rest;
      });
      setRunSummary("Marked as pending. Open Calendar if you still need to delete a scheduled slot for this page.");
    }
  };

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
          <ProjectNavLink
            href={`/projects/${projectId}/keywords`}
            className="inline-flex items-center justify-center rounded-[32px] border border-border-subtle bg-surface-secondary px-6 py-3 text-[14px] font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            Go refresh the brief
          </ProjectNavLink>
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
        <div className="space-y-2">
          {filtered.map((row, idx) => {
            const a = row.analysis;
            const demand = a.keyword_demand;
            const demandVerdict = demand ? DEMAND_VERDICT[demand.verdict] : null;
            const crit = criticalityFromScore(row.health_score, a.page_status);
            const onCalendar = !!calendarLinkedByUrl[row.url];
            const calBusy = calendarAddingUrl === row.url;
            const calLocked = calendarAddingUrl !== null && calendarAddingUrl !== row.url;
            const kw = extractCalendarFocusKeyword(row);
            const sno = idx + 1;

            const auditRowStatus: KeywordStatus = dismissedAuditUrls.has(row.url)
              ? "rejected"
              : onCalendar
                ? "approved"
                : "pending";

            return (
              <div
                key={row.url}
                className={`rounded-[16px] border border-border-subtle bg-surface-elevated p-3 shadow-sm flex flex-row gap-3 sm:items-start ${
                  dismissedAuditUrls.has(row.url) ? "opacity-75" : ""
                }`}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-secondary text-[11px] font-black tabular-nums text-text-secondary"
                  title={`Row ${sno}`}
                >
                  {sno}
                </div>

                <div className="min-h-0 min-w-0 flex-1 space-y-1.5">
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block break-all text-[11px] font-medium leading-snug text-brand-action hover:underline"
                    title={row.url}
                  >
                    {row.url}
                  </a>
                  <p className="text-[14px] font-semibold leading-snug text-text-primary line-clamp-2" title={row.title || row.url}>
                    {row.title || row.url}
                  </p>
                  <p className="text-[10px] text-text-tertiary line-clamp-1" title={`Calendar focus: ${kw}`}>
                    <span className="font-semibold text-text-secondary">Focus</span> · {kw}
                  </p>
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    <span
                      title={SEVERITY_TOOLTIP[crit]}
                      className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase cursor-help ${SEVERITY_COLORS[crit]}`}
                    >
                      {crit}
                    </span>
                    {demandVerdict && (
                      <span
                        title={demandVerdict.tooltip}
                        className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold cursor-help ${demandVerdict.color}`}
                      >
                        {demandVerdict.label}
                        {demand && demand.volume > 0 ? ` · ${formatVolume(demand.volume)}` : ""}
                      </span>
                    )}
                    {a.suggested_funnel_stage && (
                      <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold text-cyan-400">
                        {a.suggested_funnel_stage}
                      </span>
                    )}
                    <span className="text-[9px] text-text-tertiary tabular-nums">{row.word_count.toLocaleString()} w</span>
                  </div>
                  {row.error && <p className="text-[10px] text-rose-400 line-clamp-2">Error: {row.error}</p>}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5 sm:min-w-[118px]">
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-black tabular-nums leading-none ${healthColor(row.health_score)}`}>
                      {row.health_score}
                    </span>
                    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-tertiary border border-border-subtle/50 sm:w-16">
                      <div
                        className={`h-full rounded-full ${scoreBar(row.health_score)}`}
                        style={{ width: `${Math.min(100, Math.max(0, row.health_score))}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col items-stretch gap-1 sm:w-full">
                    <button
                      type="button"
                      onClick={() => setModalAudit(row)}
                      className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-violet-400/45 bg-gradient-to-r from-violet-500/25 via-brand-action/15 to-fuchsia-500/15 px-2 text-[10px] font-semibold text-violet-100 shadow-sm transition-all hover:border-violet-300/55 hover:from-violet-500/35"
                    >
                      <svg className="h-3 w-3 shrink-0 text-violet-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.847-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                      </svg>
                      See fixes
                    </button>

                    {calBusy ? (
                      <div className="flex h-7 items-center justify-center gap-1.5 rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[10px] text-text-tertiary">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-brand-action/30 border-t-brand-action" />
                        …
                      </div>
                    ) : (
                      <div
                        className="sm:w-full [&_button]:min-h-[1.75rem] [&_button]:text-[10px]"
                        onClick={e => e.stopPropagation()}
                        onPointerDown={e => e.stopPropagation()}
                      >
                        <KeywordActionDropdown
                          status={auditRowStatus}
                          busy={calLocked}
                          onChange={next => handleAuditKeywordStatus(row, next)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* close discoverTab === "audited" */}
      </>
      )}

      <AuditDetailModal
        open={!!modalAudit}
        row={modalAudit}
        projectId={projectId}
        onClose={() => setModalAudit(null)}
        onApproveToCalendar={() => (modalAudit ? handleAddToCalendar(modalAudit) : Promise.resolve())}
        approveBusy={!!modalAudit && calendarAddingUrl === modalAudit.url}
        onCalendar={!!modalAudit && !!calendarLinkedByUrl[modalAudit.url]}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponents

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

const dismissedAuditsStorageKey = (projectId: string) => `seo-engine:content-health-dismissed:${projectId}`;

function loadDismissedAuditUrls(projectId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(dismissedAuditsStorageKey(projectId));
    if (!raw) return new Set();
    const a = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
