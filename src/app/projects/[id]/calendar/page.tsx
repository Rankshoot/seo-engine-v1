"use client";

import { memo, useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, keywordsListQueryOptions, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
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
import { CalendarEntry, CONTENT_TYPE_LABEL, type ContentType } from "@/lib/types";
import { useGeneratedContentMap, generatedContentKey } from "@/hooks/useGeneratedContentMap";
import { getContentPreviewUrl } from "@/lib/content-routing";
import { resolveCalendarKeywordOrigin } from "@/lib/calendar-keyword-origin";
import { CalendarOriginPills } from "@/components/CalendarOriginPills";
import { TableSkeleton } from "@/components/Skeleton";
import { MiniCalendar } from "@/components/MiniCalendar";
import { CalendarDatePicker } from "@/components/CalendarDatePicker";
import { AddCustomKeywordModal } from "@/components/calendar/AddCustomKeywordModal";
import { PageHeader, Button, EmptyState } from "@/components/common";
import { motion } from "framer-motion";
import { Dialog } from "@/components/common/dialogs/Dialog";
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

// ── KD cell ───────────────────────────────────────────────────────────────────

function KdCell({ kd }: { kd?: number | null }) {
  if (!kd || kd <= 0) return <span className="text-text-tertiary text-[13px]">—</span>;
  if (kd < 30) return <span className="text-[12px] font-bold text-status-success">Easy</span>;
  if (kd < 60) return <span className="text-[12px] font-bold text-status-warning">Medium</span>;
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

// ── Module-level helpers ─────────────────────────────────────────────────────────────
function getDefaultCalendarView(): "list" | "grid" {
  if (typeof window === "undefined") return "grid";
  const stored = localStorage.getItem("calendar-view");
  if (stored === "list") return "list";
  localStorage.setItem("calendar-view", "grid");
  return "grid";
}

// ── Internal types ─────────────────────────────────────────────────────────────
type CalendarKwState = { status?: string; date?: string };

interface CalendarListRowProps {
  entry: CalendarEntry;
  isFirst: boolean;
  projectId: string;
  scheduledKeywordsMap: Record<string, CalendarKwState | undefined>;
  generatedMap: Map<string, { id: string; contentType?: string }>;
  pickingDateForEntryId: string | null;
  savingDate: boolean;
  scheduledDatesSet: Set<string>;
  removingEntryId: string | null;
  onPickingDateChange: (id: string | null) => void;
  onScheduleKeyword: (keywordId: string, date: string) => Promise<boolean>;
  onRemoveEntry: (entryId: string, keyword: string) => void;
}

/** Memoised row — re-renders only when its own entry or direct state changes. */
const CalendarListRow = memo(function CalendarListRow({
  entry,
  isFirst,
  projectId,
  scheduledKeywordsMap,
  generatedMap,
  pickingDateForEntryId,
  savingDate,
  scheduledDatesSet,
  removingEntryId,
  onPickingDateChange,
  onScheduleKeyword,
  onRemoveEntry,
}: CalendarListRowProps) {
  const kw = entry.keywords;
  const isRepairRow = entry.article_type === "Repair";

  const origin = resolveCalendarKeywordOrigin({
    contentHealthAudit: entry.content_health_audit,
    keywordSourceType: kw?.source_type,
    articleType: entry.article_type,
    aiSourceFromEntry: entry.ai_source,
    aiSourceFromKeyword: kw?.ai_source ?? null,
  });

  const reduxState = entry.keyword_id ? scheduledKeywordsMap[entry.keyword_id] : undefined;
  const effectiveStatus = entry.status ?? reduxState?.status;
  const effectiveDate   = entry.scheduled_date ?? reduxState?.date ?? "";

  const historyKey     = generatedContentKey(entry.focus_keyword, entry.article_type ?? "blog");
  const historyEntry   = generatedMap.get(historyKey);
  const resolvedBlogId = historyEntry?.id;

  const isLocked =
    !!resolvedBlogId ||
    effectiveStatus === "generated" ||
    effectiveStatus === "downloaded" ||
    effectiveStatus === "approved" ||
    effectiveStatus === "published";
  const isGenerating  = effectiveStatus === "generating";
  const isPickingThis = pickingDateForEntryId === entry.id;
  const canReschedule = Boolean(entry.keyword_id) && !isGenerating;

  const dateObj    = new Date(effectiveDate + "T12:00:00");
  const monthShort = dateObj.toLocaleDateString("en-US", { month: "short" });
  const dayNum     = dateObj.getDate();
  const weekday    = dateObj.toLocaleDateString("en-US", { weekday: "short" });
  const todayISO   = new Date().toISOString().slice(0, 10);
  const isPastDate = effectiveDate < todayISO;
  const blogTitle  = entryBlogTitle(entry);

  return (
    <div
      className={`group flex gap-4 px-4 py-3 transition-colors hover:bg-surface-hover/40 ${
        !isFirst ? "border-t border-border-subtle" : ""
      }`}
    >
      {/* Date card */}
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
              onOpenChange={(o) => onPickingDateChange(o ? entry.id : null)}
              currentDate={entry.scheduled_date}
              onConfirm={(d) => {
                if (entry.keyword_id) void onScheduleKeyword(entry.keyword_id, d);
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

        {blogTitle !== "—" && (
          <p className="truncate text-[12px] text-text-tertiary" title={blogTitle}>
            {blogTitle}
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

      {/* Right rail */}
      <div className="flex shrink-0 flex-col items-end justify-center gap-2 self-stretch pl-2">
        {isLocked && (
          <ProjectNavLink
            href={getContentPreviewUrl(projectId, resolvedBlogId || entry.id, historyEntry?.contentType || entry.article_type)}
            className="inline-flex items-center justify-center gap-1 rounded-full border border-status-success/20 bg-status-success/10 px-4 py-1.5 text-[12px] font-semibold text-status-success transition-colors hover:bg-status-success/20 whitespace-nowrap"
          >
            View {CONTENT_TYPE_LABEL[(historyEntry?.contentType || entry.article_type) as ContentType] || "Blog"}
          </ProjectNavLink>
        )}
        {isRepairRow && !isLocked && !isGenerating && (
          <ProjectNavLink
            href={`/projects/${projectId}/content-generator/blogs?entryId=${entry.id}`}
            className="inline-flex items-center justify-center gap-1 rounded-full border border-border-subtle bg-surface-secondary px-4 py-1.5 text-[12px] font-semibold text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary whitespace-nowrap"
          >
            Generate
          </ProjectNavLink>
        )}
        {isGenerating && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-status-warning/20 px-4 py-1.5 text-[12px] font-semibold text-status-warning/70 select-none whitespace-nowrap">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-warning" />
            Generating…
          </span>
        )}
        {!isGenerating && (
          <button
            type="button"
            onClick={() => onRemoveEntry(entry.id, entry.focus_keyword)}
            disabled={removingEntryId === entry.id}
            aria-label={`Remove ${entry.focus_keyword} from calendar`}
            className="inline-flex items-center justify-center gap-1 rounded-full border border-border-subtle/50 bg-transparent px-3 py-1 text-[11px] font-medium text-text-tertiary transition-colors hover:border-brand-coral/30 hover:bg-brand-coral/10 hover:text-brand-coral disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            title="Remove from calendar"
          >
            {removingEntryId === entry.id ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-coral/30 border-t-brand-coral" />
            ) : (
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            Remove
          </button>
        )}
      </div>
    </div>
  );
});

// ── main page ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const { generatedMap } = useGeneratedContentMap(projectId);

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
  const [removingEntryId, setRemovingEntryId] = useState<string | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [entryToRemove, setEntryToRemove] = useState<{ id: string; keyword: string } | null>(null);
  const [calendarView, setCalendarView] = useState<"list" | "grid">(getDefaultCalendarView);
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
      ...DEFAULT_QUERY_OPTIONS,
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
  const allKeywords = useMemo(() => {
    return keywordsData && "success" in keywordsData && keywordsData.success
      ? keywordsData.data
      : [];
  }, [keywordsData]);


  // Pre-built Set of all already-scheduled dates for the calendar picker
  const scheduledDatesSet = useMemo(
    () => new Set(entries.map((e) => e.scheduled_date)),
    [entries]
  );

  // Memoized approved keywords
  const approvedKeywords = useMemo(
    () => allKeywords.filter((k) => k.status === "approved"),
    [allKeywords]
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

  const handleRemoveEntry = useCallback(
    async (entryId: string, keyword: string) => {
      setEntryToRemove({ id: entryId, keyword });
      setRemoveConfirmOpen(true);
    },
    []
  );

  const confirmRemoveEntry = useCallback(async () => {
    if (!entryToRemove) return;
    setRemovingEntryId(entryToRemove.id);
    setRemoveConfirmOpen(false);
    try {
      const res = await calendarApi.deleteEntry(projectId, entryToRemove.id);
      if (res.success) {
        toast.success(`"${entryToRemove.keyword}" removed from calendar`);
        await refetchCalendar();
        void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
      } else {
        toast.error(res.error ?? "Could not remove entry");
      }
    } finally {
      setRemovingEntryId(null);
      setEntryToRemove(null);
    }
  }, [entryToRemove, projectId, refetchCalendar, queryClient]);

  // ── derived stats ─────────────────────────────────────────────────────────

  const { totalScheduled, blogReady, awaitingGeneration, sortedEntries } = useMemo(() => {
    let readyCount = 0;
    let awaitingCount = 0;
    for (const e of entries) {
      if (e.status === "generated" || e.status === "downloaded") readyCount++;
      else if (e.status === "scheduled") awaitingCount++;
    }
    return {
      totalScheduled: entries.length,
      blogReady: readyCount,
      awaitingGeneration: awaitingCount,
      sortedEntries: [...entries].sort((a, b) =>
        a.scheduled_date.localeCompare(b.scheduled_date)
      ),
    };
  }, [entries]);

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 pb-20 max-w-full px-4 mx-auto">

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <PageHeader
        title="Content Calendar"
        description="Schedule, track and manage your content pipeline."
        actions={
          <>
            {blogReady > 0 && (
              <ProjectNavLink
                href={`/projects/${projectId}/content-generator/blogs`}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-surface-secondary px-4 text-[13px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
              >
                View Blogs
                <span className="rounded-full bg-status-success/15 px-2 py-0.5 text-[11px] font-bold text-status-success">
                  {blogReady} ready
                </span>
              </ProjectNavLink>
            )}
            <Button
              variant="primary"
              shape="pill"
              size="md"
              onClick={() => setAddKeywordModalDate("")}
              iconLeft={
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              }
            >
              Add keyword
            </Button>
          </>
        }
      />

      {/* ── CALENDAR: list ↔ grid (same `calendar_entries` rows) ───────── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
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
                    <span className="text-status-success">
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
          <EmptyState
            illustration={
              <svg viewBox="0 0 160 96" className="w-40 h-24" fill="none" aria-hidden>
                <rect x="8" y="8" width="144" height="80" rx="10" stroke="var(--border-subtle)" strokeWidth="1.5" />
                <rect x="8" y="8" width="144" height="22" rx="10" stroke="var(--border-subtle)" strokeWidth="1.5" fill="var(--surface-secondary)" />
                <line x1="8" y1="30" x2="152" y2="30" stroke="var(--border-subtle)" strokeWidth="1" />
                {[0,1,2,3].map(col => (
                  <line key={col} x1={8 + col * 36} y1="30" x2={8 + col * 36} y2="88" stroke="var(--border-subtle)" strokeWidth="1" />
                ))}
                {[0,1,2].map(row => (
                  <line key={row} x1="8" y1={45 + row * 14} x2="152" y2={45 + row * 14} stroke="var(--border-subtle)" strokeWidth="1" />
                ))}
                <rect x="80" y="50" width="28" height="10" rx="3" fill="var(--brand-violet)" opacity="0.5" />
                <rect x="44" y="64" width="28" height="10" rx="3" fill="var(--brand-violet)" opacity="0.3" />
                <text x="22" y="22" fontSize="8" fill="var(--text-tertiary)" fontFamily="sans-serif">Mon</text>
                <text x="58" y="22" fontSize="8" fill="var(--text-tertiary)" fontFamily="sans-serif">Tue</text>
                <text x="94" y="22" fontSize="8" fill="var(--text-tertiary)" fontFamily="sans-serif">Wed</text>
                <text x="130" y="22" fontSize="8" fill="var(--text-tertiary)" fontFamily="sans-serif">Thu</text>
              </svg>
            }
            title="Your content calendar is empty"
            body="Approve keywords from the Keywords page — they'll be automatically scheduled here with dates, content types, and generation status."
            hints={[
              "Discover keywords for your niche",
              "Approve the best ones — they appear here instantly",
              "Generate the content directly from the calendar",
            ]}
            action={
              <ProjectNavLink
                href={`/projects/${projectId}/keywords`}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-violet px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                Discover keywords
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                </svg>
              </ProjectNavLink>
            }
          />
        ) : calendarView === "list" ? (
          sortedEntries.length === 0 ? (
            <EmptyState
              variant="card"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                </svg>
              }
              title="Nothing scheduled yet"
              body="Approved keywords are placed on the calendar automatically. Switch to Grid view to pin keywords to specific days."
            />
          ) : (
            <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
              {sortedEntries.map((entry, idx) => (
              <CalendarListRow
                key={entry.id}
                entry={entry}
                isFirst={idx === 0}
                projectId={projectId}
                scheduledKeywordsMap={scheduledKeywordsMap}
                generatedMap={generatedMap}
                pickingDateForEntryId={pickingDateForEntryId}
                savingDate={savingDate}
                scheduledDatesSet={scheduledDatesSet}
                removingEntryId={removingEntryId}
                onPickingDateChange={setPickingDateForEntryId}
                onScheduleKeyword={handleScheduleKeyword}
                onRemoveEntry={handleRemoveEntry}
              />
            ))}
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
            onRemoveEntry={handleRemoveEntry}
            generatedMap={generatedMap}
          />
        )}
      </section>
      </motion.div>

      {/* ── ADD CUSTOM KEYWORD MODAL ────────────────────────────────────── */}
      <AddCustomKeywordModal
        open={addKeywordModalDate !== null}
        onClose={() => setAddKeywordModalDate(null)}
        preselectedDate={addKeywordModalDate || null}
        onSubmit={handleAddCustomKeyword}
        busy={addKeywordBusy}
      />

      {/* ── REMOVE CONFIRMATION DIALOG ──────────────────────────────────── */}
      <Dialog
        open={removeConfirmOpen}
        onClose={() => setRemoveConfirmOpen(false)}
        size="sm"
        title="Remove from calendar"
        description={`Are you sure you want to remove "${entryToRemove?.keyword}" from the calendar? The keyword and any generated blog will remain in Keyword Discovery and Content History.`}
        footer={
          <>
            <button
              type="button"
              onClick={() => setRemoveConfirmOpen(false)}
              className="inline-flex items-center justify-center rounded-full border border-border-subtle bg-surface-secondary px-5 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmRemoveEntry}
              disabled={removingEntryId !== null}
              className="inline-flex items-center justify-center rounded-full bg-brand-coral px-5 py-2 text-[13px] font-medium text-brand-on-coral transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {removingEntryId ? "Removing..." : "Remove"}
            </button>
          </>
        }
      >
        <></>
      </Dialog>

    </div>
  );
}
