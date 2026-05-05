"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, keywordsListQueryOptions } from "@/lib/query";
import {
  useAppDispatch,
  useAppSelector,
  selectCalendarRefreshVersion,
  selectCalendarLastSyncedVersion,
  selectCalendarScheduledKeywords,
} from "@/lib/redux/hooks";
import {
  calendarEntriesLoaded,
  calendarSyncVersionUpdated,
  calendarKeywordScheduled,
  calendarEntriesHydrated,
} from "@/lib/redux/keyword-workspace-slice";
import { calendarApi } from "@/frontend/api/calendar";
import { keywordsApi } from "@/frontend/api/keywords";
import type { CalendarEntry } from "@/lib/types";
import { resolveCalendarKeywordOrigin } from "@/lib/calendar-keyword-origin";
import { resolveCalendarLifecycleStatus } from "@/lib/calendar-lifecycle";
import { CalendarOriginPills } from "@/components/CalendarOriginPills";
import { TableSkeleton } from "@/components/Skeleton";
import { MiniCalendar } from "@/components/MiniCalendar";
import { CalendarDatePicker } from "@/components/CalendarDatePicker";

type CalendarResponse = Awaited<ReturnType<typeof calendarApi.entries>>;
type KeywordsResponse = Awaited<ReturnType<typeof keywordsApi.list>>;

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function LifecycleStatusBadge({
  display,
}: {
  display: ReturnType<typeof resolveCalendarLifecycleStatus>;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${display.color}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${display.dot}`} />
      {display.label}
    </span>
  );
}

// ── KD cell ───────────────────────────────────────────────────────────────────

function KdCell({ kd }: { kd?: number | null }) {
  if (!kd || kd <= 0) return <span className="text-text-tertiary text-[13px]">—</span>;
  if (kd < 30) return <span className="text-[12px] font-bold text-[#10b981]">Easy</span>;
  if (kd < 60) return <span className="text-[12px] font-bold text-[#f59e0b]">Medium</span>;
  return <span className="text-[12px] font-bold text-brand-coral">Hard</span>;
}

/** Blog title from the calendar entry: prefer the generated blog title, fall back to the placeholder title. */
function entryBlogTitle(entry: { title?: string; focus_keyword?: string; blog?: { title?: string } | null } | null): string {
  if (!entry) return "—";
  const bt = (entry as { blog?: { title?: string } }).blog?.title?.trim();
  if (bt) return bt;
  const et = entry.title?.trim();
  return et || entry.focus_keyword || "—";
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();

  const calendarRefreshVersion = useAppSelector((s) =>
    selectCalendarRefreshVersion(s, projectId)
  );
  const calendarLastSyncedVersion = useAppSelector((s) =>
    selectCalendarLastSyncedVersion(s, projectId)
  );
  // Per-keyword scheduling state: server data hydrated into Redux, updated
  // optimistically so the action column reflects the change immediately even
  // before the query refetch completes.
  const scheduledKeywordsMap = useAppSelector((s) =>
    selectCalendarScheduledKeywords(s, projectId)
  );

  const CALENDAR_KEY = qk.calendar(projectId);

  const [pickingDateFor, setPickingDateFor] = useState<string | null>(null);
  const [savingDate, setSavingDate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const pushToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // ── data queries ─────────────────────────────────────────────────────────

  const { data: entriesData, isLoading: loadingEntries, refetch: refetchCalendar } =
    useQuery<CalendarResponse>({
      queryKey: CALENDAR_KEY,
      queryFn: () => calendarApi.entries(projectId),
      enabled: !!projectId,
    });
  const entries: CalendarEntry[] = entriesData?.success ? entriesData.data : [];

  const { data: keywordsData, isLoading: loadingKeywords } =
    useQuery<KeywordsResponse>({
      ...keywordsListQueryOptions(projectId),
      enabled: !!projectId,
    });
  const allKeywords =
    keywordsData && "success" in keywordsData && keywordsData.success
      ? keywordsData.data
      : [];
  const approvedKeywords = allKeywords.filter((k) => k.status === "approved");

  // ── entry lookup maps ─────────────────────────────────────────────────────

  const entriesByKeywordId = useMemo(
    () =>
      new Map(entries.filter((e) => e.keyword_id).map((e) => [e.keyword_id!, e])),
    [entries]
  );
  const entriesByFocusKeyword = useMemo(
    () => new Map(entries.map((e) => [e.focus_keyword.toLowerCase().trim(), e])),
    [entries]
  );

  const findEntryForKeyword = useCallback(
    (kw: { id: string; keyword: string }) =>
      entriesByKeywordId.get(kw.id) ??
      entriesByFocusKeyword.get(kw.keyword.toLowerCase().trim()) ??
      null,
    [entriesByKeywordId, entriesByFocusKeyword]
  );

  // Repair entries from the audit page — these are calendar rows with
  // article_type='Repair' that don't correspond to any approved keyword row.
  const repairEntries = useMemo(() => {
    const approvedIds = new Set(approvedKeywords.map((k) => k.id));
    return entries.filter(
      (e) =>
        e.article_type === "Repair" &&
        (!e.keyword_id || !approvedIds.has(e.keyword_id))
    );
  }, [entries, approvedKeywords]);

  // Pre-built Set of all already-scheduled dates for the calendar picker
  const scheduledDatesSet = useMemo(
    () => new Set(entries.map((e) => e.scheduled_date)),
    [entries]
  );

  // ── Redux sync ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!entriesData?.success) return;
    dispatch(calendarEntriesLoaded({ projectId, count: entriesData.data.length }));
    // Hydrate per-keyword scheduling status into Redux so navigating away and
    // back reflects the correct status without waiting for the query to refetch.
    dispatch(
      calendarEntriesHydrated({
        projectId,
        entries: entriesData.data
          .filter((e) => !!e.keyword_id)
          .map((e) => ({
            keywordId: e.keyword_id!,
            date: e.scheduled_date,
            status: e.status,
          })),
      })
    );
  }, [dispatch, entriesData, projectId]);

  useEffect(() => {
    if (calendarRefreshVersion <= calendarLastSyncedVersion) return;
    dispatch(calendarSyncVersionUpdated({ projectId, version: calendarRefreshVersion }));
    void queryClient.invalidateQueries({ queryKey: CALENDAR_KEY });
  }, [
    calendarRefreshVersion,
    calendarLastSyncedVersion,
    dispatch,
    projectId,
    queryClient,
    CALENDAR_KEY,
  ]);

  // ── scheduling ────────────────────────────────────────────────────────────

  const handleScheduleKeyword = useCallback(
    async (keywordId: string, date: string): Promise<boolean> => {
      setSavingDate(true);
      const kw = approvedKeywords.find((k) => k.id === keywordId);
      try {
        const res = await calendarApi.addKeywordOnDate(projectId, { keywordId, date });
        if (res.success) {
          dispatch(
            calendarKeywordScheduled({ projectId, keywordId, date, status: "scheduled" })
          );
          const wasRescheduled = "rescheduled" in res && res.rescheduled;
          pushToast(
            `"${kw?.keyword ?? "Keyword"}" ${wasRescheduled ? "moved to" : "scheduled for"} ${fmtDate(date)}`
          );
          setPickingDateFor(null);
          await refetchCalendar();
          void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
          return true;
        }
        pushToast(res.error ?? "Could not schedule keyword");
        return false;
      } finally {
        setSavingDate(false);
      }
    },
    [approvedKeywords, projectId, dispatch, pushToast, refetchCalendar, queryClient]
  );

  // ── derived stats ─────────────────────────────────────────────────────────

  const totalScheduled = entries.length;
  const blogReady = entries.filter(
    (e) => e.status === "generated" || e.status === "downloaded"
  ).length;
  const awaitingGeneration = entries.filter((e) => e.status === "scheduled").length;

  const unscheduledApproved = useMemo(
    () => approvedKeywords.filter((k) => !findEntryForKeyword(k)),
    [approvedKeywords, findEntryForKeyword]
  );

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 pb-20 max-w-full px-4 mx-auto">

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div className="pt-4 pb-6 border-b border-border-subtle flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[48px] font-normal tracking-[-0.96px] leading-none text-text-primary font-display">
            Content Calendar
          </h1>
          <p className="mt-3 text-[15px] text-text-tertiary max-w-[480px]">
            Schedule approved keywords to publish dates and track blog generation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {blogReady > 0 && (
            <ProjectNavLink
              href={`/projects/${projectId}/blogs`}
              className="inline-flex h-10 items-center gap-2 rounded-[30px] border border-border-subtle bg-surface-secondary px-5 text-[14px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              View Blogs
              <span className="rounded-full bg-[#10b981]/15 px-2 py-0.5 text-[11px] font-bold text-[#10b981]">
                {blogReady} ready
              </span>
            </ProjectNavLink>
          )}
          <ProjectNavLink
            href={`/projects/${projectId}/keywords`}
            className="inline-flex h-10 items-center gap-2 rounded-[30px] border border-border-subtle bg-surface-elevated px-5 text-[14px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            Manage keywords
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </ProjectNavLink>
        </div>
      </div>

      {/* ── STATS BAR ───────────────────────────────────────────────────── */}
      {(approvedKeywords.length > 0 || totalScheduled > 0) && (
        <div className="flex flex-wrap gap-6 text-[13px]">
          <span className="text-text-tertiary">
            <span className="font-semibold text-text-primary">{approvedKeywords.length}</span>{" "}
            approved
          </span>
          <span className="text-text-tertiary">
            <span className="font-semibold text-text-primary">{totalScheduled}</span>{" "}
            scheduled
          </span>
          {awaitingGeneration > 0 && (
            <span className="text-text-tertiary">
              <span className="font-semibold text-text-primary">{awaitingGeneration}</span>{" "}
              awaiting generation
            </span>
          )}
          {blogReady > 0 && (
            <span className="text-[#10b981]">
              <span className="font-semibold">{blogReady}</span> blog{blogReady !== 1 ? "s" : ""} ready
            </span>
          )}
        </div>
      )}

      {/* ── KEYWORDS TABLE ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-[13px] font-bold uppercase tracking-widest text-text-tertiary">
          Approved Keywords
        </h2>

        {loadingKeywords || loadingEntries ? (
          <div className="rounded-[16px] border border-border-subtle bg-surface-elevated">
            <TableSkeleton rows={6} columns={7} />
          </div>
        ) : approvedKeywords.length === 0 && repairEntries.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-border-strong bg-surface-secondary py-16 text-center">
            <div className="mb-4 flex justify-center">
              <div className="w-14 h-14 rounded-[14px] bg-surface-tertiary flex items-center justify-center border border-border-subtle">
                <svg className="w-7 h-7 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                  <line x1="16" x2="16" y1="2" y2="6" />
                  <line x1="8" x2="8" y1="2" y2="6" />
                  <line x1="3" x2="21" y1="10" y2="10" />
                </svg>
              </div>
            </div>
            <p className="text-[15px] font-medium text-text-secondary">No approved keywords yet</p>
            <p className="mt-1 text-[13px] text-text-tertiary">
              Go to keywords, competitor, or audit pages to approve some.
            </p>
            <ProjectNavLink
              href={`/projects/${projectId}/keywords`}
              className="mt-5 inline-flex items-center justify-center rounded-[32px] bg-brand-primary px-6 py-2.5 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90"
            >
              Go to Keywords
            </ProjectNavLink>
          </div>
        ) : (
          <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-secondary text-[10px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                  <tr>
                    <th className="px-3 py-3 w-12 text-center">#</th>
                    <th className="px-5 py-3">Keyword</th>
                    <th className="px-4 py-3 w-[9.5rem]">Origin</th>
                    <th className="px-4 py-3 min-w-[10rem] max-w-[14rem]">Blog title</th>
                    <th className="px-4 py-3 w-24 text-right">Volume</th>
                    <th className="px-4 py-3 w-20 text-center">KD</th>
                    <th className="px-4 py-3 w-44">Status</th>
                    <th className="px-4 py-3 w-44 text-right pr-5">Schedule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/60">

                  {/* ── approved keyword rows ── */}
                  {approvedKeywords.map((kw, kwIndex) => {
                    const entry = findEntryForKeyword(kw);
                    const origin = resolveCalendarKeywordOrigin({
                      keywordSourceType: kw.source_type,
                      articleType: entry?.article_type,
                      aiSourceFromEntry: entry?.ai_source,
                      aiSourceFromKeyword: kw.ai_source,
                    });
                    const isPickingThis = pickingDateFor === kw.id;

                    // effectiveStatus / effectiveDate: server entry wins; Redux
                    // optimistic state fills the gap before the refetch lands.
                    const reduxState = scheduledKeywordsMap[kw.id];
                    const effectiveStatus = entry?.status ?? reduxState?.status;
                    const effectiveDate = entry?.scheduled_date ?? reduxState?.date;
                    const hasCalendarRow = !!entry || (!!effectiveDate && !!effectiveStatus);

                    const lifecycleDisplay = resolveCalendarLifecycleStatus({
                      hasCalendarEntry: hasCalendarRow,
                      calendarStatus: effectiveStatus,
                    });

                    // All branch decisions use effectiveStatus — NOT entry?.status
                    // — so the optimistic Redux update is reflected immediately.
                    const isLocked =
                      effectiveStatus === "generated" ||
                      effectiveStatus === "downloaded" ||
                      effectiveStatus === "approved"  ||
                      effectiveStatus === "published";
                    const isGenerating = effectiveStatus === "generating";

                    return (
                      <tr key={kw.id} className="hover:bg-surface-hover/50 transition-colors group">

                        {/* serial number */}
                        <td className="px-3 py-3 align-middle text-center text-[12px] font-mono text-text-tertiary tabular-nums">
                          {kwIndex + 1}
                        </td>

                        {/* keyword */}
                        <td className="px-5 py-3.5 align-middle max-w-xs">
                          <p className="truncate text-[14px] font-medium text-text-primary">
                            {kw.keyword}
                          </p>
                          {kw.secondary_keywords?.length ? (
                            <p className="mt-0.5 truncate text-[11px] text-text-tertiary">
                              {kw.secondary_keywords.slice(0, 3).join(" · ")}
                            </p>
                          ) : null}
                        </td>

                        {/* origin (keyword pipeline + optional AI) */}
                        <td className="px-4 py-3.5 align-middle">
                          <CalendarOriginPills resolved={origin} />
                        </td>

                        {/* blog title (from generated blog or calendar placeholder) */}
                        <td className="px-4 py-3.5 align-middle max-w-[14rem]">
                          <p className="truncate text-[12px] text-text-secondary" title={entryBlogTitle(entry)}>
                            {entryBlogTitle(entry)}
                          </p>
                        </td>

                        {/* volume */}
                        <td className="px-4 py-3.5 align-middle text-right text-[13px] font-mono text-text-secondary tabular-nums">
                          {kw.volume ? kw.volume.toLocaleString() : "—"}
                        </td>

                        {/* KD */}
                        <td className="px-4 py-3.5 align-middle text-center">
                          <KdCell kd={kw.kd} />
                        </td>

                        {/* status — calendar lifecycle (not keyword pending/reject; those live on Keywords page) */}
                        <td className="px-4 py-3.5 align-middle">
                          <LifecycleStatusBadge display={lifecycleDisplay} />
                        </td>

                        {/* schedule — date + hover-reveal pencil, plus View Blog / Pick date */}
                        <td className="px-4 py-3.5 align-middle text-right pr-5">
                          {effectiveDate ? (
                            <div className="flex flex-col items-end gap-1.5">
                              {/* Date row + pencil */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-[12px] font-medium text-text-primary tabular-nums">
                                  {fmtDate(effectiveDate)}
                                </span>
                                {!isGenerating && (
                                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <CalendarDatePicker
                                      open={isPickingThis}
                                      onOpenChange={(o) => setPickingDateFor(o ? kw.id : null)}
                                      currentDate={entry?.scheduled_date ?? effectiveDate}
                                      onConfirm={(d) => handleScheduleKeyword(kw.id, d)}
                                      saving={savingDate}
                                      scheduledDates={scheduledDatesSet}
                                      iconOnly
                                    />
                                  </div>
                                )}
                              </div>
                              {/* View Blog link if blog exists */}
                              {isLocked && (
                                entry ? (
                                  <ProjectNavLink
                                    href={`/projects/${projectId}/blogs?entry=${entry.id}`}
                                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#10b981]/10 border border-[#10b981]/20 text-[11px] font-semibold text-[#10b981] hover:bg-[#10b981]/20 transition-colors"
                                  >
                                    View Blog
                                  </ProjectNavLink>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#10b981]/10 border border-[#10b981]/20 text-[11px] font-semibold text-[#10b981]">
                                    Blog Ready
                                  </span>
                                )
                              )}
                              {isGenerating && (
                                <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full border border-[#f59e0b]/20 text-[11px] font-semibold text-[#f59e0b]/70 select-none">
                                  <span className="w-2 h-2 rounded-full bg-[#f59e0b] animate-pulse" />
                                  Generating…
                                </span>
                              )}
                            </div>
                          ) : (
                            /* not yet scheduled — pick a date */
                            <CalendarDatePicker
                              open={isPickingThis}
                              onOpenChange={(o) => setPickingDateFor(o ? kw.id : null)}
                              onConfirm={(d) => handleScheduleKeyword(kw.id, d)}
                              saving={savingDate}
                              scheduledDates={scheduledDatesSet}
                              variant="pick"
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* ── repair / audit rows (from audit page) ── */}
                  {repairEntries.map((entry) => {
                    const kwData = entry.keywords as
                      | { source_type?: string | null; volume?: number | null; kd?: number | null }
                      | undefined;
                    const origin = resolveCalendarKeywordOrigin({
                      keywordSourceType: kwData?.source_type,
                      articleType: entry.article_type,
                      aiSourceFromEntry: entry.ai_source,
                      aiSourceFromKeyword: null,
                    });
                    const repairLifecycle = resolveCalendarLifecycleStatus({
                      hasCalendarEntry: true,
                      calendarStatus: entry.status,
                    });
                    const isLocked =
                      entry.status === "generated" || entry.status === "downloaded" || entry.status === "approved" || entry.status === "published";

                    return (
                      <tr key={entry.id} className="hover:bg-surface-hover/50 transition-colors group">
                        <td className="px-3 py-3 align-middle text-center text-[12px] font-mono text-text-tertiary tabular-nums">
                          —
                        </td>
                        <td className="px-5 py-3.5 align-middle max-w-xs">
                          <p className="truncate text-[14px] font-medium text-text-primary">
                            {entry.focus_keyword}
                          </p>
                          <p className="mt-0.5 text-[11px] text-text-tertiary italic">Repair draft</p>
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          <CalendarOriginPills resolved={origin} />
                        </td>
                        <td className="px-4 py-3.5 align-middle max-w-[14rem]">
                          <p className="truncate text-[12px] text-text-secondary" title={entryBlogTitle(entry)}>
                            {entryBlogTitle(entry)}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 align-middle text-right text-[13px] font-mono text-text-secondary tabular-nums">
                          {kwData?.volume ? kwData.volume.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3.5 align-middle text-center">
                          <KdCell kd={kwData?.kd} />
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          <LifecycleStatusBadge display={repairLifecycle} />
                        </td>
                        <td className="px-4 py-3.5 align-middle text-right pr-5">
                          <div className="flex flex-col items-end gap-1.5">
                            <span className="text-[12px] font-medium text-text-primary tabular-nums">
                              {fmtDate(entry.scheduled_date)}
                            </span>
                            <ProjectNavLink
                              href={`/projects/${projectId}/blogs?entry=${entry.id}`}
                              className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-[11px] font-semibold transition-colors ${
                                isLocked
                                  ? "bg-[#10b981]/10 border-[#10b981]/20 text-[#10b981] hover:bg-[#10b981]/20"
                                  : "border-border-subtle bg-surface-elevated text-text-secondary hover:text-text-primary"
                              }`}
                            >
                              {isLocked ? "View Blog" : "Generate"}
                            </ProjectNavLink>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── VISUAL CALENDAR OVERVIEW ─────────────────────────────────────── */}
      {(entries.length > 0 || unscheduledApproved.length > 0) && (
        <section className="space-y-3">
          <h2 className="text-[13px] font-bold uppercase tracking-widest text-text-tertiary">
            Schedule Overview
          </h2>
          <MiniCalendar
            entries={entries}
            projectId={projectId}
            schedulingKeywordId={null}
            schedulingKeywordPhrase=""
            onDatePick={() => {}}
            onCancelSchedule={() => {}}
            unscheduledKeywords={unscheduledApproved.map((k) => ({
              id: k.id,
              keyword: k.keyword,
              volume: k.volume,
              kd: k.kd,
              traffic: k.traffic_potential ?? null,
            }))}
            onScheduleKeywordOnDate={(keywordId, date) => handleScheduleKeyword(keywordId, date)}
            scheduleBusy={savingDate}
          />
        </section>
      )}

      {/* ── TOAST ───────────────────────────────────────────────────────── */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-8 right-6 z-50 max-w-sm rounded-[12px] border border-brand-action/30 bg-surface-elevated px-4 py-3 text-[14px] text-text-primary shadow-lg ring-1 ring-brand-action/20"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
