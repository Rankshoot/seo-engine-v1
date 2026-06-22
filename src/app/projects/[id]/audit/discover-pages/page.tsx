"use client";

import { useCallback, useMemo, useState, lazy, Suspense } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { auditsApi } from "@/frontend/api/audits";
import { qk } from "@/lib/query";
import { useAppDispatch } from "@/lib/redux/hooks";
import { contentHealthAuditMarkStale } from "@/lib/redux/content-health-audit-slice";
import type { PersistedBlogAudit, SitemapPage } from "@/app/actions/audit-actions";
import { getAuditByUrl } from "@/app/actions/audit-actions";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { DataTable, type ColumnDef } from "@/components/DataTable";

// Lazy load heavy modal to improve initial page load
const AuditDetailModal = lazy(() =>
  import("@/components/AuditDetailModal").then(m => ({
    default: m.AuditDetailModal,
  }))
);
import { calendarApi } from "@/frontend/api/calendar";
import { buildContentHealthAuditSnapshot, extractCalendarFocusKeyword } from "@/lib/content-health-calendar";
import {
  CHEmptyState,
  ScoreRing,
  ErrorBanner,
  SuccessBanner,
  SkeletonRows,
  Spinner,
} from "../_shared/ch-ui";

const MAX_SELECT = 5;
const PAGE_SIZE = 50;

const basePathKey = (projectId: string) => `seo-engine:discover-base-path:${projectId}`;

function loadBasePath(projectId: string): string {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem(basePathKey(projectId)) ?? ""; } catch { return ""; }
}

function saveBasePath(projectId: string, value: string) {
  try {
    if (value) localStorage.setItem(basePathKey(projectId), value);
    else localStorage.removeItem(basePathKey(projectId));
  } catch { /**/ }
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    const slug = path.split("/").pop() ?? "";
    return slug ? `${u.hostname}/…/${slug}` : u.hostname;
  } catch {
    return url;
  }
}

export default function DiscoverPagesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();

  const [basePath, setBasePath] = useState(() => loadBasePath(projectId ?? ""));
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [massSelectMode, setMassSelectMode] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [auditingUrl, setAuditingUrl] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionOk, setActionOk] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // ── Audit detail modal ─────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAudit, setModalAudit] = useState<PersistedBlogAudit | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [calendarAddingUrl, setCalendarAddingUrl] = useState<string | null>(null);
  const [calendarLinkedByUrl, setCalendarLinkedByUrl] = useState<Record<string, boolean>>({});

  function closeModal() { setModalOpen(false); setModalAudit(null); setModalLoading(false); }

  async function openModal(url: string) {
    setModalAudit(null);
    setModalLoading(true);
    setModalOpen(true);
    const res = await getAuditByUrl(projectId, url);
    setModalLoading(false);
    if (res.success) setModalAudit(res.record);
    else { setModalOpen(false); setActionError(res.error); }
  }

  async function handleScheduleToCalendar() {
    if (!modalAudit || !projectId) return;
    const focus = extractCalendarFocusKeyword(modalAudit);
    if (focus.length < 2) { setActionError("No usable focus keyword for this row."); return; }
    setCalendarAddingUrl(modalAudit.url);
    setActionError("");
    const snapshot = buildContentHealthAuditSnapshot(modalAudit);
    const res = await calendarApi.addContentHealth(projectId, {
      focusKeyword: focus,
      auditUrl: modalAudit.url,
      contentHealthAudit: snapshot as unknown as Record<string, unknown>,
    });
    if (res.success) {
      setCalendarLinkedByUrl(prev => ({ ...prev, [modalAudit.url]: true }));
      setModalAudit(null);
      const r = res as { data?: { scheduled_date?: string }; scheduled_date?: string };
      const sd = (typeof r.scheduled_date === "string" ? r.scheduled_date : undefined) ?? r.data?.scheduled_date;
      setActionOk(sd ? `Added "${focus}" to calendar for ${sd}.` : `Added "${focus}" to calendar.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) }),
      ]);
    } else {
      const msg = "error" in res && typeof res.error === "string" ? res.error : "Could not add to calendar";
      if (/already on your calendar|already scheduled/i.test(msg)) {
        setCalendarLinkedByUrl(prev => ({ ...prev, [modalAudit.url]: true }));
      }
      setActionError(msg);
    }
    setCalendarAddingUrl(null);
  }

  // ── Sitemap data ───────────────────────────────────────────────────────
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sitemap-pages", projectId, basePath],
    queryFn: () => auditsApi.sitemapPages(projectId, basePath || undefined),
    enabled: Boolean(projectId),
    staleTime: 60_000,
  });

  const allPages = data?.success ? data.pages : [];
  const basePaths = data?.success ? data.basePaths : [];
  const totalSitemap = data?.success ? data.total : 0;
  const listError = (!data?.success && (data as { error?: string } | undefined)?.error)
    ? (data as { error?: string }).error ?? ""
    : error ? String(error) : "";

  // Client-side search + pagination
  const filteredPages = useMemo(() => {
    if (!search.trim()) return allPages;
    const q = search.toLowerCase();
    return allPages.filter(p => p.url.toLowerCase().includes(q) || (p.primaryKeyword ?? "").toLowerCase().includes(q));
  }, [allPages, search]);

  const pages = filteredPages.slice(0, visibleCount);
  const hasMore = filteredPages.length > visibleCount;

  const toggle = useCallback((url: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(url)) { next.delete(url); return next; }
      if (next.size >= MAX_SELECT) return prev;
      next.add(url);
      return next;
    });
  }, []);

  function enterMassSelect() { setMassSelectMode(true); setSelected(new Set()); }
  function exitMassSelect() { setMassSelectMode(false); setSelected(new Set()); }

  const auditSingleUrl = async (url: string) => {
    if (!projectId || auditingUrl) return;
    setAuditingUrl(url); setActionError(""); setActionOk("");
    try {
      const res = await auditsApi.auditSelected(projectId, [url]);
      if (res.success) {
        setActionOk(`Audited: ${url}`);
        await queryClient.invalidateQueries({ queryKey: qk.audits(projectId) });
        dispatch(contentHealthAuditMarkStale({ projectId }));
        await refetch();
        // Open audit modal to show results
        await openModal(url);
      } else { setActionError(res.error ?? "Audit failed."); }
    } catch (e) { setActionError(e instanceof Error ? e.message : "Audit failed."); }
    finally { setAuditingUrl(null); }
  };

  const runSelected = async () => {
    if (!projectId || selected.size === 0) return;
    setAuditing(true); setActionError(""); setActionOk("");
    try {
      const res = await auditsApi.auditSelected(projectId, [...selected]);
      if (res.success) {
        setActionOk(`Audited ${res.audited} page${res.audited === 1 ? "" : "s"}.${res.failed ? ` ${res.failed} failed.` : ""}`);
        exitMassSelect();
        await queryClient.invalidateQueries({ queryKey: qk.audits(projectId) });
        dispatch(contentHealthAuditMarkStale({ projectId }));
        await refetch();
      } else { setActionError(res.error ?? "Audit failed."); }
    } catch (e) { setActionError(e instanceof Error ? e.message : "Audit failed."); }
    finally { setAuditing(false); }
  };

  const auditedCount = allPages.filter(p => p.audited).length;
  const pendingCount = allPages.length - auditedCount;

  // ── Column definitions ─────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<SitemapPage>[]>(() => [
    {
      id: "no",
      header: "#",
      cell: (_row, i) => (
        <span className="text-[12px] font-mono tabular-nums text-text-tertiary/60 select-none">{i + 1}</span>
      ),
    },
    {
      id: "url",
      header: "URL / Keyword",
      cell: (p) => (
        <div className="min-w-0">
          <a
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            title={p.url}
            className="block truncate text-[12px] font-mono text-brand-action hover:underline max-w-[360px]"
          >
            {shortUrl(p.url)}
          </a>
          {p.primaryKeyword && (
            <p className="mt-0.5 text-[11px] text-text-tertiary truncate">
              <span className="text-text-secondary font-medium">KW:</span> {p.primaryKeyword}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "prefix",
      header: "Prefix",
      cell: (p) => (
        <span className="font-mono text-[11px] text-text-tertiary">{p.basePath}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (p) => (
        p.audited ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 whitespace-nowrap">
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
            </svg>
            Audited
          </span>
        ) : (
          <span className="text-[11px] text-text-tertiary/60">Pending</span>
        )
      ),
    },
    {
      id: "score",
      header: "Score",
      align: "right",
      cell: (p) => (
        p.healthScore != null ? (
          <ScoreRing score={p.healthScore} size={40} />
        ) : (
          <span className="text-[12px] text-text-tertiary/50 tabular-nums">—</span>
        )
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (p) => {
        const isRunning = auditingUrl === p.url;
        return (
          <button
            type="button"
            disabled={!!auditingUrl || auditing}
            onClick={e => { e.stopPropagation(); void auditSingleUrl(p.url); }}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-elevated px-3 text-[11px] font-semibold text-text-secondary hover:border-brand-action/50 hover:text-brand-action transition-colors disabled:opacity-40"
          >
            {isRunning ? <Spinner size={10} /> : (
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803a7.5 7.5 0 0 0 10.607 0z" /></svg>
            )}
            {isRunning ? "Auditing…" : "Audit"}
          </button>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [massSelectMode, auditingUrl, auditing]);

  return (
    <>
      <div className="relative space-y-6 pb-16 pl-4 pr-4 -mt-6 lg:-mt-8">
        {/* ── sticky header ─────────────────────────────────────────────── */}
        <div className="sticky -top-6 lg:-top-8 z-20 -mx-4 border-b border-border-subtle bg-surface-primary/95 px-4 pb-6 pt-6 lg:pt-8 backdrop-blur-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <ProjectNavLink href={`/projects/${projectId}/audit`} className="text-[12px] text-text-tertiary hover:text-text-primary transition-colors flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" /></svg>
                  Content Health
                </ProjectNavLink>
              </div>
              <h1 className="text-[26px] font-bold tracking-tight text-text-primary">Discover Pages</h1>
              <p className="mt-1 text-[14px] text-text-tertiary">
                {totalSitemap > 0
                  ? <><span className="font-semibold text-text-secondary">{totalSitemap}</span> URLs · <span className="text-emerald-400 font-medium">{auditedCount} audited</span> · <span className="text-amber-400 font-medium">{pendingCount} pending</span></>
                  : "Browse every URL in your live sitemap and queue targeted audits."}
              </p>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void refetch()}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-elevated px-4 text-[12px] font-semibold text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" /></svg>
                Refresh sitemap
              </button>
            </div>
          </div>
        </div>

        {/* ── alerts ──────────────────────────────────────────────────────── */}
        {(listError || actionError) && <ErrorBanner message={listError || actionError} />}
        {actionOk && <SuccessBanner message={actionOk} />}

        {/* ── filter bar ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803a7.5 7.5 0 0 0 10.607 0z"/></svg>
            <input
              type="search"
              placeholder="Filter by URL or keyword…"
              value={search}
              onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
              className="w-full rounded-[10px] border border-border-subtle bg-surface-elevated pl-8 pr-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary/60 focus:outline-none focus:border-brand-action/50"
            />
          </div>

          {/* Path prefix */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-text-tertiary">Path:</span>
            <select
              value={basePath}
              onChange={e => { const v = e.target.value; setBasePath(v); saveBasePath(projectId, v); setSelected(new Set()); setVisibleCount(PAGE_SIZE); }}
              className="rounded-[10px] border border-border-subtle bg-surface-elevated px-3 py-2 text-[13px] text-text-primary min-w-[140px] focus:outline-none focus:border-brand-action/50"
            >
              <option value="">All ({totalSitemap})</option>
              {basePaths.map(bp => (
                <option key={bp} value={bp}>{bp}</option>
              ))}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[12px] text-text-tertiary">
              {search ? `${filteredPages.length} of ${allPages.length}` : `${allPages.length}`} URL{allPages.length === 1 ? "" : "s"}
            </span>
            {massSelectMode ? (
              <>
                {selected.size > 0 && (
                  <button type="button" onClick={() => setSelected(new Set())}
                    className="text-[12px] text-text-tertiary hover:text-text-primary transition-colors">
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  disabled={auditing || selected.size === 0}
                  onClick={runSelected}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-primary px-4 text-[12px] font-semibold text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {auditing ? <><Spinner size={12} /> Auditing…</> : `Audit ${selected.size}/${MAX_SELECT}`}
                </button>
                <button type="button" onClick={exitMassSelect} disabled={auditing}
                  className="inline-flex h-8 items-center rounded-full border border-border-subtle bg-surface-elevated px-3 text-[12px] font-medium text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40">
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" onClick={enterMassSelect}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-elevated px-3 text-[12px] font-semibold text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors">
                <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1.25" />
                  <rect x="14" y="3" width="7" height="7" rx="1.25" />
                  <rect x="3" y="14" width="7" height="7" rx="1.25" />
                  <path d="M14 17.5 16 19.5 21 13.5" />
                </svg>
                Select & audit
              </button>
            )}
          </div>
        </div>

        {/* ── page list ───────────────────────────────────────────────────── */}
        {isLoading ? (
          <SkeletonRows count={8} />
        ) : allPages.length === 0 ? (
          <CHEmptyState
            icon={<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" /></svg>}
            title="No URLs found"
            body="No URLs match this filter. Try selecting a different path prefix or check that your sitemap is reachable."
          />
        ) : filteredPages.length === 0 ? (
          <div className="py-12 text-center text-[14px] text-text-tertiary">
            No URLs match &ldquo;{search}&rdquo;.{" "}
            <button onClick={() => setSearch("")} className="text-brand-action hover:underline">Clear filter</button>
          </div>
        ) : (
          <>
            <DataTable<SitemapPage>
              data={pages}
              columns={columns}
              keyExtractor={p => p.url}
              massSelectMode={massSelectMode}
              selectedIds={selected}
              onToggleSelect={toggle}
              isSelectable={p => massSelectMode ? (!selected.has(p.url) ? selected.size < MAX_SELECT : true) : true}
              onRowClick={p => {
                if (!massSelectMode && p.audited) void openModal(p.url);
              }}
              rowClassName={p => {
                const isSel = selected.has(p.url);
                const clickable = massSelectMode ? true : p.audited;
                return [
                  "transition-colors duration-150",
                  isSel ? "bg-brand-action/5" : "",
                  clickable ? "cursor-pointer hover:bg-surface-hover/90" : "cursor-default",
                ].join(" ");
              }}
              minWidth="640px"
              footer={
                <div className="border-t border-border-subtle bg-surface-secondary px-4 py-2.5 flex items-center justify-between gap-4">
                  <p className="text-[11px] text-text-tertiary">
                    Showing {pages.length} of {filteredPages.length} URLs
                    {massSelectMode && selected.size > 0 && ` · ${selected.size} selected`}
                  </p>
                  {!massSelectMode && (
                    <p className="text-[10px] text-text-tertiary/50">Click an audited row to view diagnosis</p>
                  )}
                </div>
              }
            />

            {/* Load more pagination */}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-5 text-[13px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-all"
                >
                  Show {Math.min(PAGE_SIZE, filteredPages.length - visibleCount)} more
                  <span className="text-[11px] text-text-tertiary">({filteredPages.length - visibleCount} remaining)</span>
                </button>
              </div>
            )}

            {massSelectMode && (
              <p className="text-[12px] text-text-tertiary leading-relaxed">
                Select up to {MAX_SELECT} URLs and click <strong className="text-text-secondary">Audit selected</strong>. Results save to{" "}
                <ProjectNavLink href={`/projects/${projectId}/audit`} className="underline underline-offset-2 hover:text-text-primary transition-colors">Content Health</ProjectNavLink> instantly.
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Audit detail modal ────────────────────────────────────────────── */}
      <Suspense fallback={null}>
        <AuditDetailModal
          open={modalOpen}
          loading={modalLoading}
          row={modalAudit}
          projectId={projectId}
          onClose={closeModal}
          onScheduleToCalendar={handleScheduleToCalendar}
          scheduleBusy={!!modalAudit && calendarAddingUrl === modalAudit.url}
          onCalendar={!!modalAudit && !!calendarLinkedByUrl[modalAudit.url]}
        />
      </Suspense>
    </>
  );
}
