"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
import { AddCustomKeywordModal } from "@/components/calendar/AddCustomKeywordModal";
import { toast } from "react-hot-toast";

type CalendarResponse = Awaited<ReturnType<typeof calendarApi.entries>>;
type KeywordsResponse = Awaited<ReturnType<typeof keywordsApi.list>>;

/** Normalize API date strings so grid keys always match YYYY-MM-DD cells. */
function normalizeCalendarDay(raw: string): string {
  return String(raw).slice(0, 10);
}

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

/** Blog title from the calendar entry: prefer joined `blog_title`, then placeholder `title`. */
function entryBlogTitle(entry: CalendarEntry | null): string {
  if (!entry) return "—";
  const fromJoin = entry.blog_title?.trim();
  if (fromJoin) return fromJoin;
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

  /** Calendar entry id when the date pencil is open (list view reschedule only). */
  const [pickingDateForEntryId, setPickingDateForEntryId] = useState<string | null>(null);
  const [savingDate, setSavingDate] = useState(false);
  /** null = closed, "" = open with no preselected date, "YYYY-MM-DD" = open pre-filled from grid click */
  const [addKeywordModalDate, setAddKeywordModalDate] = useState<string | null>(null);
  const [addKeywordBusy, setAddKeywordBusy] = useState(false);
  const [calendarView, setCalendarView] = useState<"list" | "grid">(() => {
    if (typeof window === "undefined") return "list";
    const stored = localStorage.getItem("calendar-view");
    return stored === "grid" ? "grid" : "list";
  });
  const handleCalendarViewChange = useCallback((view: "list" | "grid") => {
    setCalendarView(view);
    localStorage.setItem("calendar-view", view);
  }, []);

  // ── data queries ─────────────────────────────────────────────────────────

  const { data: entriesData, isLoading: loadingEntries, refetch: refetchCalendar } =
    useQuery<CalendarResponse>({
      queryKey: CALENDAR_KEY,
      queryFn: () => calendarApi.entries(projectId),
      enabled: !!projectId,
    });
  const entries: CalendarEntry[] = useMemo(() => {
    if (!entriesData?.success) return [];
    return entriesData.data.map((e) => ({
      ...e,
      scheduled_date: normalizeCalendarDay(e.scheduled_date),
    }));
  }, [entriesData]);

  const { data: keywordsData } = useQuery<KeywordsResponse>({
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
            date: normalizeCalendarDay(e.scheduled_date),
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
          toast.success(
            `"${kw?.keyword ?? "Keyword"}" ${wasRescheduled ? "moved to" : "scheduled for"} ${fmtDate(date)}`
          );
          setPickingDateForEntryId(null);
          await refetchCalendar();
          void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
          return true;
        }
        toast.error(res.error ?? "Could not schedule keyword");
        return false;
      } finally {
        setSavingDate(false);
      }
    },
    [approvedKeywords, projectId, dispatch, refetchCalendar, queryClient]
  );

  const handleMoveEntryToDate = useCallback(
    async (entryId: string, date: string): Promise<boolean> => {
      const entry = entries.find((e) => e.id === entryId);
      const dateNorm = normalizeCalendarDay(date);
      setSavingDate(true);
      try {
        const res = await calendarApi.rescheduleEntry(projectId, { entryId, date: dateNorm });
        if (res.success) {
          if (res.rescheduled && entry?.keyword_id) {
            dispatch(
              calendarKeywordScheduled({
                projectId,
                keywordId: entry.keyword_id,
                date: dateNorm,
                status: entry.status ?? "scheduled",
              })
            );
          }
          if (res.rescheduled) {
            toast.success(`"${entry?.focus_keyword ?? "Entry"}" moved to ${fmtDate(dateNorm)}`);
          }
          setPickingDateForEntryId(null);
          queryClient.setQueryData<CalendarResponse>(CALENDAR_KEY, (old) => {
            if (!old?.success) return old;
            return {
              ...old,
              data: old.data.map((row) =>
                row.id === entryId ? { ...row, scheduled_date: dateNorm } : row
              ),
            };
          });
          await refetchCalendar();
          void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
          return true;
        }
        toast.error(res.error ?? "Could not move entry");
        return false;
      } finally {
        setSavingDate(false);
      }
    },
    [entries, projectId, dispatch, refetchCalendar, queryClient, CALENDAR_KEY]
  );

  const handleAddCustomKeyword = useCallback(
    async (data: {
      keyword: string;
      title: string;
      articleType: string;
      writerNotes: string;
      targetDate?: string;
    }) => {
      setAddKeywordBusy(true);
      try {
        const res = await calendarApi.addCustomKeyword(projectId, {
          keyword: data.keyword,
          title: data.title || undefined,
          articleType: data.articleType,
          writerNotes: data.writerNotes || undefined,
          targetDate: data.targetDate,
        });
        if (res.success) {
          toast.success(`"${data.keyword}" scheduled for ${fmtDate(res.scheduled_date)}`);
          setAddKeywordModalDate(null);
          await refetchCalendar();
          void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
          return { success: true };
        }
        return { success: false, error: res.error };
      } finally {
        setAddKeywordBusy(false);
      }
    },
    [projectId, refetchCalendar, queryClient]
  );

  // ── derived stats ─────────────────────────────────────────────────────────

  const totalScheduled = entries.length;
  const blogReady = entries.filter(
    (e) => e.status === "generated" || e.status === "downloaded"
  ).length;
  const awaitingGeneration = entries.filter((e) => e.status === "scheduled").length;

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)),
    [entries]
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
          <button
            type="button"
            onClick={() => setAddKeywordModalDate("")}
            className="inline-flex h-10 items-center gap-2 rounded-[30px] bg-brand-primary px-5 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add keyword
          </button>
        </div>
      </div>

      {/* ── CALENDAR: list ↔ grid (same `calendar_entries` rows) ───────── */}
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Stats inline where the heading used to be */}
          <div className="flex flex-wrap items-center gap-4 text-[13px]">
            {approvedKeywords.length > 0 || totalScheduled > 0 ? (
              <>
                <span className="text-text-tertiary">
                  <span className="font-semibold text-text-primary">{approvedKeywords.length}</span>{" "}approved
                </span>
                <span className="text-text-tertiary/30">·</span>
                <span className="text-text-tertiary">
                  <span className="font-semibold text-text-primary">{totalScheduled}</span>{" "}scheduled
                </span>
                {awaitingGeneration > 0 && (
                  <>
                    <span className="text-text-tertiary/30">·</span>
                    <span className="text-text-tertiary">
                      <span className="font-semibold text-text-primary">{awaitingGeneration}</span>{" "}awaiting generation
                    </span>
                  </>
                )}
                {blogReady > 0 && (
                  <>
                    <span className="text-text-tertiary/30">·</span>
                    <span className="text-[#10b981]">
                      <span className="font-semibold">{blogReady}</span> blog{blogReady !== 1 ? "s" : ""} ready
                    </span>
                  </>
                )}
              </>
            ) : null}
          </div>
          {(approvedKeywords.length > 0 || entries.length > 0) && (
            <div
              className="inline-flex rounded-full border border-border-subtle bg-surface-secondary/70 p-0.5"
              role="tablist"
              aria-label="Calendar view"
            >
              <button
                type="button"
                role="tab"
                aria-selected={calendarView === "list"}
                onClick={() => handleCalendarViewChange("list")}
                className={`rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors ${
                  calendarView === "list"
                    ? "bg-surface-elevated text-text-primary shadow-sm"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                List
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={calendarView === "grid"}
                onClick={() => handleCalendarViewChange("grid")}
                className={`rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors ${
                  calendarView === "grid"
                    ? "bg-surface-elevated text-text-primary shadow-sm"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                Grid
              </button>
            </div>
          )}
        </div>

        {loadingEntries ? (
          <div className="rounded-[16px] border border-border-subtle bg-surface-elevated">
            <TableSkeleton rows={6} columns={8} />
          </div>
        ) : approvedKeywords.length === 0 && entries.length === 0 ? (
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
            <p className="text-[15px] font-medium text-text-secondary">No calendar content yet</p>
            <p className="mt-1 text-[13px] text-text-tertiary">
              Approve keywords or queue content from the audit flow — dates are assigned automatically.
            </p>
            <ProjectNavLink
              href={`/projects/${projectId}/keywords`}
              className="mt-5 inline-flex items-center justify-center rounded-[32px] bg-brand-primary px-6 py-2.5 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90"
            >
              Go to Keywords
            </ProjectNavLink>
          </div>
        ) : calendarView === "list" ? (
          sortedEntries.length === 0 ? (
            <div className="rounded-[16px] border border-border-subtle bg-surface-secondary/50 px-6 py-12 text-center">
              <p className="text-[15px] font-medium text-text-secondary">Nothing on the calendar yet</p>
              <p className="mt-2 text-[13px] text-text-tertiary max-w-md mx-auto leading-relaxed">
                Approved keywords get a date automatically. To place remaining keywords on specific days, switch to{" "}
                <span className="font-medium text-text-secondary">Grid</span> view.
              </p>
            </div>
          ) : (
            <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
              {sortedEntries.map((entry, idx) => {
                const kw = entry.keywords;
                const isRepairRow = entry.article_type === "Repair";
                const origin = resolveCalendarKeywordOrigin({
                  keywordSourceType: kw?.source_type,
                  articleType: entry.article_type,
                  aiSourceFromEntry: entry.ai_source,
                  aiSourceFromKeyword: kw?.ai_source ?? null,
                });
                const reduxState = entry.keyword_id ? scheduledKeywordsMap[entry.keyword_id] : undefined;
                const effectiveStatus = entry.status ?? reduxState?.status;
                const effectiveDate = entry.scheduled_date ?? reduxState?.date;
                const lifecycleDisplay = resolveCalendarLifecycleStatus({
                  hasCalendarEntry: true,
                  calendarStatus: effectiveStatus,
                });
                const isLocked =
                  effectiveStatus === "generated" ||
                  effectiveStatus === "downloaded" ||
                  effectiveStatus === "approved" ||
                  effectiveStatus === "published";
                const isGenerating = effectiveStatus === "generating";
                const isPickingThis = pickingDateForEntryId === entry.id;
                const canReschedule = Boolean(entry.keyword_id) && !isGenerating;

                const dateObj = new Date(effectiveDate + "T12:00:00");
                const monthShort = dateObj.toLocaleDateString("en-US", { month: "short" });
                const dayNum = dateObj.getDate();
                const weekday = dateObj.toLocaleDateString("en-US", { weekday: "short" });
                const isPastDate = effectiveDate < new Date().toISOString().slice(0, 10);

                return (
                  <div
                    key={entry.id}
                    className={`group flex gap-4 px-4 py-3 transition-colors hover:bg-surface-hover/40 ${
                      idx !== 0 ? "border-t border-border-subtle" : ""
                    }`}
                  >
                    {/* Calendar date card on left */}
                    <div className="flex shrink-0 flex-col items-center pt-0.5">
                      <div className="flex w-14 flex-col items-center">
                        <span
                          className={`text-[9px] font-bold uppercase tracking-widest ${
                            isPastDate ? "text-text-tertiary" : "text-brand-action/70"
                          }`}
                        >
                          {monthShort}
                        </span>
                        <span
                          className={`-mt-0.5 text-[24px] font-bold leading-none tabular-nums ${
                            isPastDate ? "text-text-secondary" : "text-brand-action"
                          }`}
                        >
                          {dayNum}
                        </span>
                        <span className="text-[8px] font-medium text-text-tertiary">{weekday}</span>
                      </div>
                      {canReschedule && (
                        <div className="mt-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <CalendarDatePicker
                            open={isPickingThis}
                            onOpenChange={(o) => setPickingDateForEntryId(o ? entry.id : null)}
                            currentDate={entry.scheduled_date}
                            onConfirm={(d) => {
                              if (entry.keyword_id) void handleScheduleKeyword(entry.keyword_id, d);
                            }}
                            saving={savingDate}
                            scheduledDates={scheduledDatesSet}
                            iconOnly
                          />
                        </div>
                      )}
                    </div>

                    {/* Entry details */}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="min-w-0">
                        <h4 className="truncate text-[15px] font-semibold leading-tight text-text-primary">
                          {entry.focus_keyword}
                        </h4>
                        {isRepairRow ? (
                          <p className="mt-0.5 text-[11px] italic text-text-tertiary">Repair draft</p>
                        ) : entry.secondary_keywords?.length ? (
                          <p className="mt-0.5 truncate text-[11px] text-text-tertiary">
                            {entry.secondary_keywords.slice(0, 4).join(" · ")}
                          </p>
                        ) : null}
                      </div>

                      {entryBlogTitle(entry) !== "—" && (
                        <p className="truncate text-[12px] text-text-tertiary" title={entryBlogTitle(entry)}>
                          {entryBlogTitle(entry)}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <CalendarOriginPills resolved={origin} />
                        </div>
                        {kw?.volume ? (
                          <div className="flex items-center gap-1">
                            <span className="text-text-tertiary">Vol</span>
                            <span className="font-mono font-medium tabular-nums text-text-secondary">
                              {kw.volume.toLocaleString()}
                            </span>
                          </div>
                        ) : null}
                        {kw?.kd != null && kw.kd > 0 ? (
                          <div className="flex items-center gap-1">
                            <span className="text-text-tertiary">KD</span>
                            <KdCell kd={kw.kd} />
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Status + primary action — right rail */}
                    <div className="flex shrink-0 flex-col items-end justify-center gap-2 self-stretch pl-2">
                      <LifecycleStatusBadge display={lifecycleDisplay} />
                      {isLocked && (
                        <ProjectNavLink
                          href={`/projects/${projectId}/blogs?entry=${entry.id}`}
                          className="inline-flex items-center justify-center gap-1 rounded-full border border-[#10b981]/20 bg-[#10b981]/10 px-4 py-1.5 text-[12px] font-semibold text-[#10b981] transition-colors hover:bg-[#10b981]/20 whitespace-nowrap"
                        >
                          View Blog
                        </ProjectNavLink>
                      )}
                      {isRepairRow && !isLocked && !isGenerating && (
                        <ProjectNavLink
                          href={`/projects/${projectId}/blogs?entry=${entry.id}`}
                          className="inline-flex items-center justify-center gap-1 rounded-full border border-border-subtle bg-surface-secondary px-4 py-1.5 text-[12px] font-semibold text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary whitespace-nowrap"
                        >
                          Generate
                        </ProjectNavLink>
                      )}
                      {isGenerating && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f59e0b]/20 px-4 py-1.5 text-[12px] font-semibold text-[#f59e0b]/70 select-none whitespace-nowrap">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#f59e0b]" />
                          Generating…
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <MiniCalendar
            entries={entries}
            projectId={projectId}
            schedulingKeywordId={null}
            schedulingKeywordPhrase=""
            onDatePick={() => {}}
            onCancelSchedule={() => {}}
            onEmptyDayClick={(date) => setAddKeywordModalDate(date)}
            scheduleBusy={savingDate || addKeywordBusy}
            onMoveEntryToDate={handleMoveEntryToDate}
          />
        )}
      </section>

      {/* ── ADD CUSTOM KEYWORD MODAL ────────────────────────────────────── */}
      <AddCustomKeywordModal
        open={addKeywordModalDate !== null}
        onClose={() => setAddKeywordModalDate(null)}
        preselectedDate={addKeywordModalDate || null}
        onSubmit={handleAddCustomKeyword}
        busy={addKeywordBusy}
      />

    </div>
  );
}
