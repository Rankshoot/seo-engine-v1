"use client";

import { useMemo, useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { useParams } from "next/navigation";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query";
import type { AuditCoverage, PersistedBlogAudit } from "@/app/actions/audit-actions";
import { auditsApi } from "@/frontend/api/audits";
import { calendarApi } from "@/frontend/api/calendar";

const AuditDetailModal = lazy(() =>
  import("@/components/AuditDetailModal").then(m => ({ default: m.AuditDetailModal }))
);
import { buildContentHealthAuditSnapshot, extractCalendarFocusKeyword } from "@/lib/content-health-calendar";
import { criticalityFromScore } from "@/lib/audit-criticality";
import { Tooltip, InfoIcon } from "@/components/Tooltip";
import {
  useAppDispatch,
  useAppSelector,
  selectContentHealthAuditWorkspace,
} from "@/lib/redux/hooks";
import {
  contentHealthAuditFilterSet,
  contentHealthAuditLoadFailed,
  contentHealthAuditLoadStarted,
  contentHealthAuditLoadSuccess,
  type ContentHealthSeverityFilter,
} from "@/lib/redux/content-health-audit-slice";
import {
  CHEmptyState,
  ScoreRing,
  SeverityChip,
  DemandChip,
  FunnelChip,
  ErrorBanner,
  SuccessBanner,
  SkeletonRows,
  Spinner,
  healthScoreColor,
  formatVolume,
} from "./_shared/ch-ui";

// ─── constants ──────────────────────────────────────────────────────────────

const EMPTY_COVERAGE: AuditCoverage = {
  blogs_found: 0,
  blogs_audited: 0,
  last_updated_at: null,
  avg_health: 0,
  high_severity: 0,
  severity_counts: { high: 0, medium: 0, low: 0 },
};
const AUDIT_PAGE_SIZE = 20;

function exportAuditsCsv(rows: PersistedBlogAudit[]) {
  const header = ["URL", "Title", "Health Score", "Severity", "Keyword", "Word Count", "Summary"];
  const escape = (v: string | number | undefined | null) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    header.join(","),
    ...rows.map(r => [
      escape(r.url), escape(r.title), r.health_score, escape(r.severity),
      escape(r.primary_keyword), r.word_count, escape(r.analysis?.plain_language_verdict),
    ].join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `content-health-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── page ───────────────────────────────────────────────────────────────────

export default function ContentHealthPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const chStore = useAppSelector(s => selectContentHealthAuditWorkspace(s, projectId));

  const [error, setError] = useState("");
  const [runSummary, setRunSummary] = useState("");
  const [modalAudit, setModalAudit] = useState<PersistedBlogAudit | null>(null);
  const [calendarAddingUrl, setCalendarAddingUrl] = useState<string | null>(null);
  const [calendarLinkedByUrl, setCalendarLinkedByUrl] = useState<Record<string, boolean>>({});
  const loadSeq = useRef(0);

  const refetchFirstPage = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!projectId) return;
      const seq = ++loadSeq.current;
      if (!opts?.silent) dispatch(contentHealthAuditLoadStarted({ projectId, mode: "replace" }));
      const res = await auditsApi.list(projectId, { limit: AUDIT_PAGE_SIZE, offset: 0 });
      if (seq !== loadSeq.current) return;
      if (!res.success) {
        dispatch(contentHealthAuditLoadFailed({ projectId, error: res.error ?? "Failed" }));
        return;
      }
      dispatch(contentHealthAuditLoadSuccess({
        projectId, mode: "replace", data: res.data, coverage: res.coverage,
        total: res.total, hasMore: res.hasMore, limit: res.limit, offset: res.offset,
      }));
    },
    [dispatch, projectId]
  );

  useEffect(() => {
    if (!projectId) return;
    if (chStore == null) { void refetchFirstPage(); return; }
    if (chStore.loading === "loading" || chStore.loading === "loadingMore") return;
    if (chStore.stale && chStore.coverage != null) { void refetchFirstPage({ silent: true }); return; }
    if (chStore.coverage != null && !chStore.stale) return;
    if (chStore.coverage == null && chStore.error) return;
    void refetchFirstPage();
  }, [projectId, chStore, refetchFirstPage]);

  const loadMore = useCallback(async () => {
    if (!projectId || !chStore) return;
    if (chStore.loading !== "idle" || !chStore.hasMore) return;
    dispatch(contentHealthAuditLoadStarted({ projectId, mode: "append" }));
    const res = await auditsApi.list(projectId, { limit: chStore.pageSize, offset: chStore.offset });
    if (!res.success) { dispatch(contentHealthAuditLoadFailed({ projectId, error: res.error ?? "Failed" })); return; }
    dispatch(contentHealthAuditLoadSuccess({ projectId, mode: "append", data: res.data, coverage: res.coverage, total: res.total, hasMore: res.hasMore, limit: res.limit, offset: res.offset }));
  }, [projectId, chStore, dispatch]);

  const filter: ContentHealthSeverityFilter = chStore?.filter ?? "all";
  const rows: PersistedBlogAudit[] = chStore?.rows ?? [];
  const loading = chStore?.loading === "loading";
  const loadingMore = chStore?.loading === "loadingMore";
  const coverage: AuditCoverage = chStore?.coverage ?? EMPTY_COVERAGE;

  const handleAddToCalendar = async (row: PersistedBlogAudit) => {
    const focus = extractCalendarFocusKeyword(row);
    if (focus.length < 2) { setError("No usable focus keyword for this row."); return; }
    setCalendarAddingUrl(row.url); setError(""); setRunSummary("");
    const snapshot = buildContentHealthAuditSnapshot(row);
    const res = await calendarApi.addContentHealth(projectId, {
      focusKeyword: focus, auditUrl: row.url,
      contentHealthAudit: snapshot as unknown as Record<string, unknown>,
    });
    if (res.success) {
      setCalendarLinkedByUrl(prev => ({ ...prev, [row.url]: true }));
      setModalAudit(null);
      const r = res as { data?: { scheduled_date?: string }; scheduled_date?: string };
      const sd = (typeof r.scheduled_date === "string" ? r.scheduled_date : undefined) ?? r.data?.scheduled_date;
      setRunSummary(sd ? `Added "${focus}" to calendar for ${sd}.` : `Added "${focus}" to calendar.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) }),
      ]);
    } else {
      const msg = "error" in res && typeof res.error === "string" ? res.error : "Could not add to calendar";
      if (/already on your calendar|already scheduled/i.test(msg)) setCalendarLinkedByUrl(prev => ({ ...prev, [row.url]: true }));
      setError(msg);
    }
    setCalendarAddingUrl(null);
  };

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter(r => criticalityFromScore(r.health_score, r.analysis.page_status) === filter);
  }, [rows, filter]);

  const pendingAudits = Math.max(0, coverage.blogs_found - coverage.blogs_audited);
  const lastSync = coverage.last_updated_at
    ? new Date(coverage.last_updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="relative space-y-6 pb-16 pl-4 pr-4 -mt-6 lg:-mt-8">
      {/* ── sticky header ────────────────────────────────────────────────── */}
      <div className="sticky -top-6 lg:-top-8 z-20 -mx-4 border-b border-border-subtle bg-surface-primary/95 px-4 pb-6 pt-6 lg:pt-8 backdrop-blur-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold tracking-tight text-text-primary">Content Health</h1>
            <p className="mt-1 text-[14px] text-text-tertiary leading-relaxed">
              Audit history — each blog scored on technical SEO, keyword demand, and writing quality.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <ProjectNavLink
              href={`/projects/${projectId}/audit/import`}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-4 text-[13px] font-medium text-text-secondary hover:border-border-strong hover:text-text-primary transition-all"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
              Content Analyser
            </ProjectNavLink>
            <ProjectNavLink
              href={`/projects/${projectId}/audit/discover-pages`}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-4 text-[13px] font-medium text-text-secondary hover:border-border-strong hover:text-text-primary transition-all"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803a7.5 7.5 0 0 0 10.607 0z" /></svg>
              Discover Pages
            </ProjectNavLink>
          </div>
        </div>
      </div>

      {/* ── alerts ───────────────────────────────────────────────────────── */}
      {error && <ErrorBanner message={error} />}
      {runSummary && !error && <SuccessBanner message={runSummary} />}

      {/* ── stats row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {/* Blogs found */}
        <div className="rounded-[14px] border border-border-subtle bg-surface-elevated px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Blogs found</p>
          <p className="mt-1 text-[26px] font-bold tabular-nums text-text-primary">{coverage.blogs_found}</p>
          <p className="text-[11px] text-text-tertiary">in sitemap</p>
        </div>

        {/* Avg health — on hover shows severity breakdown */}
        <div className="group relative rounded-[14px] border border-border-subtle bg-surface-elevated px-4 py-3 cursor-default">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Avg. health</p>
          <p className={`mt-1 text-[26px] font-bold tabular-nums ${healthScoreColor(coverage.avg_health).text}`}>
            {coverage.avg_health}
          </p>
          <p className="text-[11px] text-text-tertiary">score 0–100</p>
          {/* hover tooltip */}
          <div className="pointer-events-none absolute left-0 top-full z-30 mt-1.5 hidden group-hover:block w-52 rounded-[12px] border border-border-subtle bg-surface-secondary shadow-lg p-3 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary mb-2">Severity breakdown</p>
            {[
              { label: "High", count: coverage.severity_counts?.high ?? 0, cls: "text-rose-400" },
              { label: "Medium", count: coverage.severity_counts?.medium ?? 0, cls: "text-yellow-400" },
              { label: "Low", count: coverage.severity_counts?.low ?? 0, cls: "text-emerald-400" },
            ].map(({ label, count, cls }) => (
              <div key={label} className="flex items-center justify-between">
                <span className={`text-[12px] font-semibold ${cls}`}>{label}</span>
                <span className="text-[12px] font-bold text-text-primary tabular-nums">{count}</span>
              </div>
            ))}
            {lastSync && <p className="text-[10px] text-text-tertiary pt-1 border-t border-border-subtle">Last sync {lastSync}</p>}
          </div>
        </div>

        {/* Pending */}
        <div className="rounded-[14px] border border-border-subtle bg-surface-elevated px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Pending</p>
          <p className="mt-1 text-[26px] font-bold tabular-nums text-text-primary">{pendingAudits}</p>
          <p className="text-[11px] text-text-tertiary">
            {pendingAudits === 0 ? "all up to date" : "not yet audited"}
          </p>
        </div>
      </div>

      {/* ── empty state ──────────────────────────────────────────────────── */}
      {coverage.blogs_found === 0 && !loading && (
        <CHEmptyState
          icon={<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803a7.5 7.5 0 0 0 10.607 0z" /></svg>}
          title="No blog URLs found"
          body={<>We couldn&apos;t find blog-style URLs in your sitemap. Try <strong>Discover Pages</strong> to browse all sitemap URLs, or use <strong>Content Analyser</strong> to audit a specific URL.</>}
          action={
            <ProjectNavLink href={`/projects/${projectId}/audit/discover-pages`} className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-5 py-2.5 text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors">
              Discover Pages
            </ProjectNavLink>
          }
        />
      )}

      {/* ── filter row ───────────────────────────────────────────────────── */}
      {coverage.blogs_audited > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label htmlFor="sev-filter" className="text-[12px] font-medium text-text-tertiary">Filter:</label>
            <select
              id="sev-filter"
              value={filter}
              onChange={e => dispatch(contentHealthAuditFilterSet({ projectId, filter: e.target.value as ContentHealthSeverityFilter }))}
              disabled={loading}
              className="h-8 rounded-[8px] border border-border-subtle bg-surface-elevated px-3 text-[13px] text-text-primary focus:outline-none focus:border-brand-action/50 disabled:opacity-50"
            >
              <option value="all">All ({coverage.blogs_audited})</option>
              <option value="high">High severity ({coverage.severity_counts?.high ?? 0})</option>
              <option value="medium">Medium ({coverage.severity_counts?.medium ?? 0})</option>
              <option value="low">Low ({coverage.severity_counts?.low ?? 0})</option>
            </select>
          </div>

          <span className="text-[12px] text-text-tertiary">
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
          </span>

          {/* Export CSV — right end */}
          {rows.length > 0 && (
            <button
              type="button"
              onClick={() => exportAuditsCsv(rows)}
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-elevated px-3 text-[12px] font-medium text-text-secondary hover:border-border-strong hover:text-text-primary transition-all"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Export CSV
            </button>
          )}
        </div>
      )}

      {/* ── audit list ───────────────────────────────────────────────────── */}
      {loading ? (
        <SkeletonRows count={6} />
      ) : filtered.length === 0 && coverage.blogs_found > 0 ? (
        <div className="rounded-[20px] border border-dashed border-border-strong bg-surface-secondary/50 py-16 text-center text-[14px] text-text-tertiary">
          {coverage.blogs_audited === 0
            ? "Use Discover Pages to audit your first blogs."
            : "No blogs match this filter."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row, idx) => {
            const a = row.analysis;
            const demand = a.keyword_demand;
            const crit = criticalityFromScore(row.health_score, a.page_status);
            const onCalendar = !!calendarLinkedByUrl[row.url];
            const calBusy = calendarAddingUrl === row.url;
            const kw = extractCalendarFocusKeyword(row);

            return (
              <div
                key={row.url}
                onClick={() => setModalAudit(row)}
                className="group flex gap-3 rounded-[14px] border border-border-subtle bg-surface-elevated p-3.5 shadow-sm transition-all hover:border-border-strong hover:shadow-md cursor-pointer"
              >
                {/* score */}
                <div className="shrink-0 mt-0.5">
                  <ScoreRing score={row.health_score} size={48} />
                </div>

                {/* content */}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div>
                    <p className="text-[14px] font-semibold leading-snug text-text-primary line-clamp-1" title={row.title || row.url}>
                      {row.title || row.url}
                    </p>
                    <a
                      href={row.url} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="mt-0.5 block truncate text-[11px] text-text-tertiary hover:text-brand-action transition-colors"
                      title={row.url}
                    >
                      {row.url}
                    </a>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <SeverityChip severity={crit} />
                    {demand && <DemandChip verdict={demand.verdict} volume={demand.volume} />}
                    {a.suggested_funnel_stage && <FunnelChip stage={a.suggested_funnel_stage} />}
                    {row.word_count > 0 && (
                      <span className="text-[11px] text-text-tertiary tabular-nums">{row.word_count.toLocaleString()} words</span>
                    )}
                    {kw && (
                      <span className="text-[11px] text-text-tertiary">
                        <span className="text-text-secondary font-medium">KW:</span> {kw}
                      </span>
                    )}
                  </div>

                  {a.plain_language_verdict && !row.error && (
                    <p className="text-[11px] text-text-tertiary line-clamp-1 leading-relaxed">{a.plain_language_verdict}</p>
                  )}
                  {row.error && <p className="text-[11px] text-rose-400 line-clamp-1">Error: {row.error}</p>}
                </div>

                {/* right actions */}
                <div className="flex shrink-0 flex-col items-end gap-1.5 ml-2" onClick={e => e.stopPropagation()}>
                  <span className="text-[10px] text-text-tertiary/50 tabular-nums">#{idx + 1}</span>

                  {calBusy ? (
                    <div className="flex h-7 items-center gap-1.5 rounded-[8px] border border-border-subtle px-2 text-[11px] text-text-tertiary">
                      <Spinner size={11} /> Scheduling…
                    </div>
                  ) : onCalendar ? (
                    <ProjectNavLink
                      href={`/projects/${projectId}/content-calendar`}
                      className="inline-flex h-7 items-center gap-1 rounded-[8px] border border-emerald-500/30 bg-emerald-500/10 px-2 text-[10px] font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                    >
                      <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7"/></svg>
                      Scheduled
                    </ProjectNavLink>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleAddToCalendar(row)}
                      disabled={calendarAddingUrl !== null}
                      className="inline-flex h-7 items-center gap-1 rounded-[8px] bg-brand-primary px-2 text-[10px] font-semibold text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                      Schedule
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {loadingMore && <SkeletonRows count={3} />}

          {chStore?.hasMore && !loading && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-6 text-[13px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 transition-all"
              >
                {loadingMore ? <><Spinner size={14} /> Loading…</> : `Load more (${chStore.rows.length} of ${chStore.total})`}
              </button>
            </div>
          )}
        </div>
      )}

      <Suspense fallback={null}>
        <AuditDetailModal
          open={!!modalAudit}
          row={modalAudit}
          projectId={projectId}
          onClose={() => setModalAudit(null)}
          onScheduleToCalendar={() => (modalAudit ? handleAddToCalendar(modalAudit) : Promise.resolve())}
          scheduleBusy={!!modalAudit && calendarAddingUrl === modalAudit.url}
          onCalendar={!!modalAudit && !!calendarLinkedByUrl[modalAudit.url]}
        />
      </Suspense>
    </div>
  );
}

export { formatVolume };
