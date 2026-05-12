"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query";
import type { AuditCoverage, PersistedBlogAudit } from "@/app/actions/audit-actions";
import { auditsApi } from "@/frontend/api/audits";
import { calendarApi } from "@/frontend/api/calendar";
import { AuditDetailModal } from "@/components/AuditDetailModal";
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
  contentHealthAuditReset,
  type ContentHealthSeverityFilter,
} from "@/lib/redux/content-health-audit-slice";
import {
  CHPageShell,
  CHEmptyState,
  CHFilterTabs,
  ScoreRing,
  SeverityChip,
  DemandChip,
  FunnelChip,
  StatTile,
  ErrorBanner,
  SuccessBanner,
  SkeletonRows,
  Spinner,
  healthScoreColor,
  formatVolume,
} from "./_shared/ch-ui";

// ─── local constants ───────────────────────────────────────────────────────

const EMPTY_COVERAGE: AuditCoverage = {
  blogs_found: 0,
  blogs_audited: 0,
  last_updated_at: null,
  avg_health: 0,
  high_severity: 0,
  severity_counts: { high: 0, medium: 0, low: 0 },
};
const BATCH_SIZE = 10;
const AUDIT_PAGE_SIZE = 20;
const dismissedKey = (id: string) => `seo-engine:ch-dismissed:${id}`;

function loadDismissed(projectId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(dismissedKey(projectId));
    const a = raw ? (JSON.parse(raw) as unknown) : null;
    return new Set(Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : []);
  } catch { return new Set(); }
}

// ─── page ──────────────────────────────────────────────────────────────────

export default function ContentHealthPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const chStore = useAppSelector(s => selectContentHealthAuditWorkspace(s, projectId));

  const [running, setRunning] = useState(false);
  const [runSummary, setRunSummary] = useState("");
  const [error, setError] = useState("");
  const [modalAudit, setModalAudit] = useState<PersistedBlogAudit | null>(null);
  const [calendarAddingUrl, setCalendarAddingUrl] = useState<string | null>(null);
  const [calendarLinkedByUrl, setCalendarLinkedByUrl] = useState<Record<string, boolean>>({});
  const [dismissedUrls, setDismissedUrls] = useState<Set<string>>(() => new Set());
  const loadSeq = useRef(0);

  useEffect(() => { setDismissedUrls(loadDismissed(projectId)); }, [projectId]);

  const persistDismissed = useCallback((next: Set<string>) => {
    try { localStorage.setItem(dismissedKey(projectId), JSON.stringify([...next])); } catch { /**/ }
  }, [projectId]);

  const dismissRow = useCallback((url: string) => {
    setDismissedUrls(prev => {
      const n = new Set(prev); n.add(url);
      persistDismissed(n); return n;
    });
  }, [persistDismissed]);

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
      dispatch(
        contentHealthAuditLoadSuccess({
          projectId,
          mode: "replace",
          data: res.data,
          coverage: res.coverage,
          total: res.total,
          hasMore: res.hasMore,
          limit: res.limit,
          offset: res.offset,
        })
      );
    },
    [dispatch, projectId]
  );

  useEffect(() => {
    if (!projectId) return;
    if (chStore == null) {
      void refetchFirstPage();
      return;
    }
    if (chStore.loading === "loading" || chStore.loading === "loadingMore") return;
    if (chStore.stale && chStore.coverage != null) {
      void refetchFirstPage({ silent: true });
      return;
    }
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

  const handleRun = async (force: boolean) => {
    setRunning(true); setRunSummary(""); setError("");
    const res = await auditsApi.run(projectId, { force, limit: BATCH_SIZE });
    if (res.success) {
      const remaining = Math.max(0, res.coverage.blogs_found - res.coverage.blogs_audited);
      setRunSummary(`Audited ${res.audited}${res.failed ? ` · failed ${res.failed}` : ""}${remaining ? ` · ${remaining} still pending` : ""}`);
      if (res.vendorTrace?.length) console.log("[content-health] vendorTrace", res.vendorTrace);
      await Promise.all([queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) }), refetchFirstPage()]);
    } else { setError(res.error ?? "Audit failed"); }
    setRunning(false);
  };

  const handleClear = async () => {
    if (!confirm("Delete all audit results? You can re-run any time.")) return;
    setRunning(true);
    await auditsApi.clear(projectId);
    dispatch(contentHealthAuditReset({ projectId }));
    await Promise.all([queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) }), refetchFirstPage()]);
    setRunning(false);
  };

  const handleAddToCalendar = async (row: PersistedBlogAudit) => {
    const focus = extractCalendarFocusKeyword(row);
    if (focus.length < 2) { setError("No usable focus keyword for this row."); return; }
    setCalendarAddingUrl(row.url); setError(""); setRunSummary("");
    const snapshot = buildContentHealthAuditSnapshot(row);
    const res = await calendarApi.addContentHealth(projectId, { focusKeyword: focus, auditUrl: row.url, contentHealthAudit: snapshot as unknown as Record<string, unknown> });
    if (res.success) {
      setCalendarLinkedByUrl(prev => ({ ...prev, [row.url]: true }));
      setModalAudit(null);
      const r = res as { data?: { scheduled_date?: string }; scheduled_date?: string };
      const sd = (typeof r.scheduled_date === "string" ? r.scheduled_date : undefined) ?? r.data?.scheduled_date;
      setRunSummary(sd ? `Added "${focus}" to calendar for ${sd}.` : `Added "${focus}" to calendar.`);
      await Promise.all([queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) }), queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) }), queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) })]);
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

  return (
    <CHPageShell
      title="Content health"
      subtitle={<>Audit each blog on its own merits — technical health, keyword demand, and writing quality. Click <strong className="text-text-secondary font-medium">See fixes</strong> to expand the diagnosis.</>}
      actions={
        <>
          <ProjectNavLink
            href={`/projects/${projectId}/audit/import`}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-4 text-[13px] font-medium text-text-secondary hover:border-brand-action/30 hover:text-text-primary transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
            Analyze content
          </ProjectNavLink>
          <ProjectNavLink
            href={`/projects/${projectId}/audit/discover-pages`}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-4 text-[13px] font-medium text-text-secondary hover:border-brand-action/30 hover:text-text-primary transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803a7.5 7.5 0 0 0 10.607 0z" /></svg>
            Discover pages
          </ProjectNavLink>
        </>
      }
    >
      {/* ── alerts ────────────────────────────────────────────────────────── */}
      {error && <ErrorBanner message={error} />}
      {runSummary && !error && <SuccessBanner message={runSummary} />}

      {/* ── stats ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Blogs found"
          value={coverage.blogs_found}
          sub="in your sitemap"
          icon={<Tooltip content="Total blog-style URLs found in your sitemap."><InfoIcon /></Tooltip>}
        />
        <StatTile
          label="Audited"
          value={coverage.blogs_audited}
          sub={pendingAudits > 0 ? `${pendingAudits} pending` : "up to date"}
          icon={<Tooltip content="How many blogs have been scraped and diagnosed."><InfoIcon /></Tooltip>}
        />
        <StatTile
          label="Avg. health"
          value={coverage.avg_health}
          sub="score 0–100"
          valueClass={healthScoreColor(coverage.avg_health).text}
          icon={<Tooltip content="Average health score across all audited blogs."><InfoIcon /></Tooltip>}
        />
        <StatTile
          label="High severity"
          value={coverage.high_severity}
          sub="need fixes now"
          valueClass="text-rose-400"
          icon={<Tooltip content="Blogs actively blocked from ranking today."><InfoIcon /></Tooltip>}
        />
      </div>

      {/* ── empty sitemap ─────────────────────────────────────────────────── */}
      {coverage.blogs_found === 0 && !loading && (
        <CHEmptyState
          icon={<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803a7.5 7.5 0 0 0 10.607 0z" /></svg>}
          title="No blog URLs found"
          body={<>We couldn't find blog-style URLs in your sitemap. Make sure <code className="rounded bg-surface-elevated px-1.5 py-0.5 text-[12px]">/blog/…</code> paths are included, then refresh your brief.</>}
          action={
            <ProjectNavLink href={`/projects/${projectId}/keywords`} className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-5 py-2.5 text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors">
              Refresh brief
            </ProjectNavLink>
          }
        />
      )}

      {/* ── filter tabs ───────────────────────────────────────────────────── */}
      {coverage.blogs_audited > 0 && (
        <CHFilterTabs
          items={[
            { id: "all" as ContentHealthSeverityFilter, label: "All", count: coverage.blogs_audited },
            { id: "high" as ContentHealthSeverityFilter, label: "High severity", count: coverage.severity_counts?.high ?? 0 },
            { id: "medium" as ContentHealthSeverityFilter, label: "Medium", count: coverage.severity_counts?.medium ?? 0 },
            { id: "low" as ContentHealthSeverityFilter, label: "Low", count: coverage.severity_counts?.low ?? 0 },
          ]}
          active={filter}
          onChange={f => dispatch(contentHealthAuditFilterSet({ projectId, filter: f }))}
          disabled={loading}
        />
      )}

      {/* ── audit list ────────────────────────────────────────────────────── */}
      {loading ? (
        <SkeletonRows count={6} />
      ) : filtered.length === 0 && coverage.blogs_found > 0 ? (
        <div className="rounded-[20px] border border-dashed border-border-strong bg-surface-secondary/50 py-16 text-center text-[14px] text-text-tertiary">
          {coverage.blogs_audited === 0
            ? `Use the audit controls below to run your first ${BATCH_SIZE} blogs.`
            : "No blogs match this filter."}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((row, idx) => {
            const a = row.analysis;
            const demand = a.keyword_demand;
            const crit = criticalityFromScore(row.health_score, a.page_status);
            const onCalendar = !!calendarLinkedByUrl[row.url];
            const calBusy = calendarAddingUrl === row.url;
            const kw = extractCalendarFocusKeyword(row);
            const dismissed = dismissedUrls.has(row.url);

            return (
              <div
                key={row.url}
                className={`group flex gap-4 rounded-[16px] border border-border-subtle bg-surface-elevated p-4 shadow-sm transition-opacity hover:border-border-strong ${dismissed ? "opacity-50" : ""}`}
              >
                {/* score ring */}
                <div className="shrink-0 mt-0.5">
                  <ScoreRing score={row.health_score} size={52} />
                </div>

                {/* content */}
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <p className="text-[15px] font-semibold leading-snug text-text-primary line-clamp-1" title={row.title || row.url}>
                      {row.title || row.url}
                    </p>
                    <a
                      href={row.url} target="_blank" rel="noopener noreferrer"
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
                        <span className="text-text-secondary font-medium">Keyword:</span> {kw}
                      </span>
                    )}
                  </div>

                  {row.error && <p className="text-[11px] text-rose-400 line-clamp-1">Error: {row.error}</p>}
                  {a.plain_language_verdict && !row.error && (
                    <p className="text-[12px] text-text-tertiary line-clamp-2 leading-relaxed">{a.plain_language_verdict}</p>
                  )}
                </div>

                {/* actions */}
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-[11px] text-text-tertiary tabular-nums">#{idx + 1}</span>

                  <button
                    type="button"
                    onClick={() => setModalAudit(row)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-violet-400/40 bg-linear-to-r from-violet-500/20 via-brand-action/12 to-fuchsia-500/12 px-3 text-[11px] font-semibold text-violet-200 shadow-sm transition-all hover:border-violet-300/55 hover:from-violet-500/30"
                  >
                    <svg className="h-3.5 w-3.5 text-violet-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.847-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                    </svg>
                    See fixes
                  </button>

                  {calBusy ? (
                    <div className="flex h-8 items-center gap-1.5 rounded-[10px] border border-border-subtle px-3 text-[11px] text-text-tertiary">
                      <Spinner size={12} /> Scheduling…
                    </div>
                  ) : onCalendar ? (
                    <ProjectNavLink
                      href={`/projects/${projectId}/calendar`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-emerald-500/30 bg-emerald-500/10 px-3 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7"/></svg>
                      Scheduled
                    </ProjectNavLink>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleAddToCalendar(row)}
                      disabled={calendarAddingUrl !== null}
                      className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-brand-primary px-3 text-[11px] font-semibold text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                      Schedule
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => dismissRow(row.url)}
                    className="text-[10px] text-text-tertiary/60 hover:text-rose-400 transition-colors mt-0.5"
                    title="Dismiss from view"
                  >
                    Dismiss
                  </button>
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
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-6 text-[13px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 transition-all"
              >
                {loadingMore ? <><Spinner size={14} /> Loading…</> : `Load more (${chStore.rows.length} of ${chStore.total})`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── controls ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 rounded-[20px] border border-border-subtle bg-surface-secondary/50 p-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-[12px] text-text-tertiary max-w-lg leading-relaxed">
          Audits run in batches of {BATCH_SIZE} to keep costs predictable. Open{" "}
          <ProjectNavLink href={`/projects/${projectId}/audit/discover-pages`} className="font-medium text-text-secondary underline-offset-2 hover:underline">Discover pages</ProjectNavLink>{" "}
          to browse your sitemap and audit specific URLs.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleRun(false)}
            disabled={running || (coverage.blogs_audited > 0 && pendingAudits === 0)}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-brand-primary px-5 text-[13px] font-semibold text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {running ? <><Spinner size={14} className="border-brand-on-primary/30 border-t-brand-on-primary" /> Auditing…</>
              : coverage.blogs_audited === 0 ? `Audit first ${Math.min(BATCH_SIZE, Math.max(coverage.blogs_found, BATCH_SIZE))} blogs`
              : pendingAudits === 0 ? "All audited"
              : `Audit ${Math.min(BATCH_SIZE, pendingAudits)} more`}
          </button>
          <button
            type="button"
            onClick={() => handleRun(true)}
            disabled={running || coverage.blogs_audited === 0}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-5 text-[13px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 transition-all"
          >
            Re-audit 10
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={running || coverage.blogs_audited === 0}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/8 px-4 text-[13px] font-medium text-rose-400 hover:bg-rose-500/15 disabled:opacity-40 transition-all"
          >
            Clear all
          </button>
        </div>
      </div>

      <AuditDetailModal
        open={!!modalAudit}
        row={modalAudit}
        projectId={projectId}
        onClose={() => setModalAudit(null)}
        onScheduleToCalendar={() => (modalAudit ? handleAddToCalendar(modalAudit) : Promise.resolve())}
        scheduleBusy={!!modalAudit && calendarAddingUrl === modalAudit.url}
        onCalendar={!!modalAudit && !!calendarLinkedByUrl[modalAudit.url]}
      />
    </CHPageShell>
  );
}

// keep formatVolume as a local re-export shim so old call sites still compile
export { formatVolume };
