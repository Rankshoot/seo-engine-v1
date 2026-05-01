"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
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
import {
  getCalendarEntries,
  addKeywordToCalendarOnDate,
} from "@/app/actions/calendar-actions";
import { getKeywords } from "@/app/actions/keyword-actions";
import type { CalendarEntry } from "@/lib/types";
import { TableSkeleton } from "@/components/Skeleton";
import { MiniCalendar } from "@/components/MiniCalendar";

type CalendarResponse = Awaited<ReturnType<typeof getCalendarEntries>>;
type KeywordsResponse = Awaited<ReturnType<typeof getKeywords>>;

// ── helpers ───────────────────────────────────────────────────────────────────

function getTomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function sourceInfo(
  sourceType?: string | null,
  articleType?: string | null
): { label: string; color: string } {
  if (articleType === "Repair") {
    return {
      label: "Audit",
      color: "bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/20",
    };
  }
  switch (sourceType) {
    case "competitor_gap":
      return {
        label: "Gap",
        color: "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20",
      };
    case "quick_win":
      return {
        label: "Competitor",
        color: "bg-[#8b5cf6]/10 text-[#8b5cf6] border-[#8b5cf6]/20",
      };
    default:
      return {
        label: "Discovery",
        color: "bg-brand-action/10 text-brand-action border-brand-action/20",
      };
  }
}

/**
 * Maps a raw calendar_entries.status value to a display label + colour.
 * Uses the exact DB status names so the UI stays in sync with the backend.
 */
const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  scheduled:  { label: "Scheduled",    color: "text-text-tertiary",  dot: "bg-border-strong" },
  generating: { label: "Generating…",  color: "text-[#f59e0b]",      dot: "bg-[#f59e0b] animate-pulse" },
  generated:  { label: "Generated",    color: "text-[#10b981]",      dot: "bg-[#10b981]" },
  downloaded: { label: "Downloaded",   color: "text-brand-action",   dot: "bg-brand-action" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.scheduled;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── DatePickerPopover ─────────────────────────────────────────────────────────

function DatePickerPopover({
  currentDate,
  onConfirm,
  onCancel,
  saving,
}: {
  currentDate?: string | null;
  onConfirm: (date: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const minDate = getTomorrowISO();
  const [date, setDate] = useState(
    currentDate && currentDate >= minDate ? currentDate : minDate
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onCancel]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-[14px] border border-border-strong bg-surface-elevated shadow-xl p-3.5 flex flex-col gap-3"
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
        {currentDate ? "Change date" : "Pick a date"}
      </p>
      <input
        type="date"
        min={minDate}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full rounded-[8px] border border-border-subtle bg-surface-secondary px-3 py-2 text-[13px] text-text-primary outline-none focus:border-brand-action transition-colors"
      />
      <div className="flex gap-2">
        <button
          disabled={saving || !date || date < minDate}
          onClick={() => onConfirm(date)}
          className="flex-1 h-8 rounded-[8px] bg-brand-primary text-brand-on-primary text-[12px] font-semibold disabled:opacity-50 transition-opacity hover:opacity-90"
        >
          {saving ? (
            <span className="flex items-center justify-center gap-1.5">
              <span className="w-3 h-3 border-2 border-brand-on-primary/30 border-t-brand-on-primary rounded-full animate-spin" />
              Saving…
            </span>
          ) : (
            "Schedule"
          )}
        </button>
        <button
          onClick={onCancel}
          className="h-8 px-3 rounded-[8px] border border-border-subtle text-[12px] text-text-tertiary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── KD cell ───────────────────────────────────────────────────────────────────

function KdCell({ kd }: { kd?: number | null }) {
  if (!kd || kd <= 0) return <span className="text-text-tertiary text-[13px]">—</span>;
  if (kd < 30) return <span className="text-[12px] font-bold text-[#10b981]">Easy</span>;
  if (kd < 60) return <span className="text-[12px] font-bold text-[#f59e0b]">Medium</span>;
  return <span className="text-[12px] font-bold text-brand-coral">Hard</span>;
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
  const KEYWORDS_KEY = qk.keywords(projectId, { limit: 200, offset: 0 });

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
      queryFn: () => getCalendarEntries(projectId),
      enabled: !!projectId,
      staleTime: 0,
      gcTime: 30 * 60_000,
      refetchOnMount: "always",
    });
  const entries: CalendarEntry[] = entriesData?.success ? entriesData.data : [];

  const { data: keywordsData, isLoading: loadingKeywords } =
    useQuery<KeywordsResponse>({
      queryKey: KEYWORDS_KEY,
      queryFn: () => getKeywords(projectId, { limit: 200, offset: 0 }),
      enabled: !!projectId,
      staleTime: 0,
      gcTime: 30 * 60_000,
      refetchOnMount: "always",
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
    async (keywordId: string, date: string) => {
      setSavingDate(true);
      const kw = approvedKeywords.find((k) => k.id === keywordId);
      const res = await addKeywordToCalendarOnDate(keywordId, projectId, date);
      if (res.success) {
        // Optimistic Redux update — action column reflects new state immediately
        // before the query refetch completes.
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
        void queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
      } else {
        pushToast(res.error ?? "Could not schedule keyword");
      }
      setSavingDate(false);
    },
    [approvedKeywords, projectId, dispatch, pushToast, refetchCalendar, queryClient]
  );

  // ── derived stats ─────────────────────────────────────────────────────────

  const totalScheduled = entries.length;
  const blogReady = entries.filter(
    (e) => e.status === "generated" || e.status === "downloaded"
  ).length;
  const awaitingGeneration = entries.filter((e) => e.status === "scheduled").length;

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
            <Link
              href={`/projects/${projectId}/blogs`}
              className="inline-flex h-10 items-center gap-2 rounded-[30px] border border-border-subtle bg-surface-secondary px-5 text-[14px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              View Blogs
              <span className="rounded-full bg-[#10b981]/15 px-2 py-0.5 text-[11px] font-bold text-[#10b981]">
                {blogReady} ready
              </span>
            </Link>
          )}
          <Link
            href={`/projects/${projectId}/keywords`}
            className="inline-flex h-10 items-center gap-2 rounded-[30px] border border-border-subtle bg-surface-elevated px-5 text-[14px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            Manage keywords
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
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
            <TableSkeleton rows={6} columns={6} />
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
            <Link
              href={`/projects/${projectId}/keywords`}
              className="mt-5 inline-flex items-center justify-center rounded-[32px] bg-brand-primary px-6 py-2.5 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90"
            >
              Go to Keywords
            </Link>
          </div>
        ) : (
          <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-secondary text-[10px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                  <tr>
                    <th className="px-5 py-3">Keyword</th>
                    <th className="px-4 py-3 w-28">Source</th>
                    <th className="px-4 py-3 w-24 text-right">Volume</th>
                    <th className="px-4 py-3 w-20 text-center">KD</th>
                    <th className="px-4 py-3 w-52">Status</th>
                    <th className="px-4 py-3 w-40 text-right pr-5">Schedule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/60">

                  {/* ── approved keyword rows ── */}
                  {approvedKeywords.map((kw) => {
                    const entry = findEntryForKeyword(kw);
                    const src = sourceInfo(kw.source_type);
                    const isPickingThis = pickingDateFor === kw.id;

                    // effectiveStatus / effectiveDate: server entry wins; Redux
                    // optimistic state fills the gap before the refetch lands.
                    const reduxState = scheduledKeywordsMap[kw.id];
                    const effectiveStatus = entry?.status ?? reduxState?.status;
                    const effectiveDate = entry?.scheduled_date ?? reduxState?.date;

                    // All branch decisions use effectiveStatus — NOT entry?.status
                    // — so the optimistic Redux update is reflected immediately.
                    const isLocked =
                      effectiveStatus === "generated" ||
                      effectiveStatus === "downloaded";
                    const isGenerating = effectiveStatus === "generating";
                    const isScheduledOnly = !!effectiveDate && !isLocked && !isGenerating;

                    return (
                      <tr key={kw.id} className="hover:bg-surface-hover/50 transition-colors group">

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

                        {/* source */}
                        <td className="px-4 py-3.5 align-middle">
                          <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full border ${src.color}`}>
                            {src.label}
                          </span>
                        </td>

                        {/* volume */}
                        <td className="px-4 py-3.5 align-middle text-right text-[13px] font-mono text-text-secondary tabular-nums">
                          {kw.volume ? kw.volume.toLocaleString() : "—"}
                        </td>

                        {/* KD */}
                        <td className="px-4 py-3.5 align-middle text-center">
                          <KdCell kd={kw.kd} />
                        </td>

                        {/* status — shows scheduled date + DB status badge */}
                        <td className="px-4 py-3.5 align-middle">
                          {effectiveDate ? (
                            <div className="flex flex-col gap-1">
                              <span className="text-[12px] font-medium text-text-primary tabular-nums">
                                {fmtDate(effectiveDate)}
                              </span>
                              <StatusBadge status={effectiveStatus!} />
                            </div>
                          ) : (
                            <span className="text-[13px] text-text-tertiary">—</span>
                          )}
                        </td>

                        {/* action — derived entirely from effectiveStatus */}
                        <td className="px-4 py-3.5 align-middle text-right pr-5">
                          <div className="relative inline-block">
                            {isLocked ? (
                              /* generated / downloaded — link to blog if entry available */
                              entry ? (
                                <Link
                                  href={`/projects/${projectId}/blogs?entry=${entry.id}`}
                                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#10b981]/10 border border-[#10b981]/20 text-[11px] font-semibold text-[#10b981] hover:bg-[#10b981]/20 transition-colors"
                                >
                                  View Blog
                                </Link>
                              ) : (
                                /* optimistic lock — entry.id not yet available */
                                <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#10b981]/10 border border-[#10b981]/20 text-[11px] font-semibold text-[#10b981]">
                                  Blog Ready
                                </span>
                              )
                            ) : isGenerating ? (
                              /* generating — no action available */
                              <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full border border-[#f59e0b]/20 text-[11px] font-semibold text-[#f59e0b]/70 select-none">
                                <span className="w-2 h-2 rounded-full bg-[#f59e0b] animate-pulse" />
                                Generating…
                              </span>
                            ) : isScheduledOnly ? (
                              /* scheduled, no blog yet — allow date change */
                              <>
                                <button
                                  type="button"
                                  disabled={savingDate}
                                  onClick={() =>
                                    setPickingDateFor(isPickingThis ? null : kw.id)
                                  }
                                  className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-[11px] font-semibold transition-colors ${
                                    isPickingThis
                                      ? "border-brand-action/40 bg-brand-action/10 text-brand-action"
                                      : "border-border-subtle bg-surface-elevated text-text-secondary hover:border-[#f59e0b]/40 hover:text-[#f59e0b] hover:bg-[#f59e0b]/5"
                                  }`}
                                >
                                  <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                                  </svg>
                                  {isPickingThis ? "Cancel" : "Change date"}
                                </button>
                                {isPickingThis && (
                                  <DatePickerPopover
                                    currentDate={entry?.scheduled_date ?? effectiveDate}
                                    onConfirm={(d) => handleScheduleKeyword(kw.id, d)}
                                    onCancel={() => setPickingDateFor(null)}
                                    saving={savingDate}
                                  />
                                )}
                              </>
                            ) : (
                              /* not yet scheduled — pick a date */
                              <>
                                <button
                                  type="button"
                                  disabled={savingDate}
                                  onClick={() =>
                                    setPickingDateFor(isPickingThis ? null : kw.id)
                                  }
                                  className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-[11px] font-semibold transition-colors ${
                                    isPickingThis
                                      ? "border-brand-action/40 bg-brand-action/10 text-brand-action"
                                      : "border-border-subtle bg-surface-elevated text-text-secondary hover:border-brand-action/40 hover:text-brand-action hover:bg-brand-action/5"
                                  }`}
                                >
                                  <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                                    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                                    <line x1="16" x2="16" y1="2" y2="6" />
                                    <line x1="8" x2="8" y1="2" y2="6" />
                                    <line x1="3" x2="21" y1="10" y2="10" />
                                    <line x1="12" x2="12" y1="15" y2="18" />
                                    <line x1="10.5" x2="13.5" y1="16.5" y2="16.5" />
                                  </svg>
                                  {isPickingThis ? "Cancel" : "Pick date"}
                                </button>
                                {isPickingThis && (
                                  <DatePickerPopover
                                    onConfirm={(d) => handleScheduleKeyword(kw.id, d)}
                                    onCancel={() => setPickingDateFor(null)}
                                    saving={savingDate}
                                  />
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* ── repair / audit rows (from audit page) ── */}
                  {repairEntries.map((entry) => {
                    const kwData = entry.keywords as
                      | { source_type?: string | null; volume?: number | null; kd?: number | null }
                      | undefined;
                    const src = sourceInfo(kwData?.source_type, "Repair");
                    const isLocked =
                      entry.status === "generated" || entry.status === "downloaded";

                    return (
                      <tr key={entry.id} className="hover:bg-surface-hover/50 transition-colors group">
                        <td className="px-5 py-3.5 align-middle max-w-xs">
                          <p className="truncate text-[14px] font-medium text-text-primary">
                            {entry.focus_keyword}
                          </p>
                          <p className="mt-0.5 text-[11px] text-text-tertiary italic">Repair draft</p>
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full border ${src.color}`}>
                            {src.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 align-middle text-right text-[13px] font-mono text-text-secondary tabular-nums">
                          {kwData?.volume ? kwData.volume.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3.5 align-middle text-center">
                          <KdCell kd={kwData?.kd} />
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          <div className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-text-primary tabular-nums">
                              {fmtDate(entry.scheduled_date)}
                            </span>
                            <StatusBadge status={entry.status} />
                          </div>
                        </td>
                        <td className="px-4 py-3.5 align-middle text-right pr-5">
                          <Link
                            href={`/projects/${projectId}/blogs?entry=${entry.id}`}
                            className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-[11px] font-semibold transition-colors ${
                              isLocked
                                ? "bg-[#10b981]/10 border-[#10b981]/20 text-[#10b981] hover:bg-[#10b981]/20"
                                : "border-border-subtle bg-surface-elevated text-text-secondary hover:text-text-primary"
                            }`}
                          >
                            {isLocked ? "View Blog" : "Generate"}
                          </Link>
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
      {entries.length > 0 && (
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
          />
        </section>
      )}

      {/* ── SCHEDULED ENTRIES LIST ──────────────────────────────────────── */}
      {!loadingEntries && entries.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[13px] font-bold uppercase tracking-widest text-text-tertiary">
            Scheduled Content ({entries.length})
          </h2>
          <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-secondary text-[10px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                  <tr>
                    <th className="px-5 py-3 w-32">Date</th>
                    <th className="px-4 py-3">Keyword / Title</th>
                    <th className="px-4 py-3 w-28">Source</th>
                    <th className="px-4 py-3 w-32 text-center">Status</th>
                    <th className="px-4 py-3 w-28 text-right pr-5">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/60">
                  {entries
                    .slice()
                    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
                    .map((entry) => {
                      const src = sourceInfo(
                        (entry.keywords as { source_type?: string | null } | undefined)?.source_type,
                        entry.article_type
                      );
                      const isReady =
                        entry.status === "generated" || entry.status === "downloaded";
                      return (
                        <tr key={entry.id} className="hover:bg-surface-hover/50 transition-colors">
                          <td className="px-5 py-3 align-middle">
                            <span className="text-[12px] font-medium text-text-primary tabular-nums">
                              {fmtDate(entry.scheduled_date)}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-middle max-w-sm">
                            <p className="text-[13px] font-medium text-text-primary truncate">
                              {entry.title || entry.focus_keyword}
                            </p>
                            {entry.title && (
                              <p className="mt-0.5 text-[11px] font-mono text-brand-action/70 truncate">
                                {entry.focus_keyword}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full border ${src.color}`}>
                              {src.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-middle text-center">
                            <StatusBadge status={entry.status} />
                          </td>
                          <td className="px-4 py-3 align-middle text-right pr-5">
                            <Link
                              href={`/projects/${projectId}/blogs?entry=${entry.id}`}
                              className={`inline-flex h-7 items-center justify-center rounded-full border px-3 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                                isReady
                                  ? "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20 hover:bg-[#10b981]/20"
                                  : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary hover:border-border-strong"
                              }`}
                            >
                              {isReady ? "View Blog" : "Generate"}
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
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
