"use client";

import { useState, useMemo, useRef, useEffect, useCallback, type DragEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { CalendarOriginPills } from "@/components/CalendarOriginPills";
import { CalendarEntry, CalendarEntryWithBlog, CONTENT_TYPE_LABEL, type ContentType } from "@/lib/types";
import { resolveCalendarKeywordOrigin } from "@/lib/calendar-keyword-origin";
import { getContentPreviewUrl } from "@/lib/content-routing";
import { generatedContentKey } from "@/hooks/useGeneratedContentMap";
import { contentTypeTone } from "@/components/content-generator/shared/section-helpers";
import { DropdownMenu } from "@/components/common/dropdowns/DropdownMenu";
import { cn } from "@/lib/cn";

const CAL_DRAG_MIME = "application/x-seo-calendar-entry";
/** Cards rendered directly in a day cell before the rest collapse into "+N more". */
const MAX_VISIBLE_PER_DAY = 2;

function normalizeCalDay(raw: string): string {
  return String(raw).slice(0, 10);
}

/** Short content-type code shown on every calendar card (blog/ebook/whitepaper/LinkedIn). */
function typeShortLabel(articleType: string | undefined | null): string {
  const t = (articleType || "").toLowerCase();
  if (t === "ebook") return "EBOOK";
  if (t === "whitepaper") return "WHITEPAPER";
  if (t.includes("linkedin")) return "LINKEDIN";
  return "BLOG";
}

function fmtVol(n: number | undefined | null): string {
  if (!n || n === 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function kdLabel(kd: number | undefined | null): { text: string; cls: string } {
  if (!kd || kd === 0) return { text: "—", cls: "text-text-tertiary" };
  if (kd < 30) return { text: "Easy", cls: "text-status-success" };
  if (kd < 60) return { text: "Med", cls: "text-status-warning" };
  return { text: "Hard", cls: "text-brand-coral" };
}

interface DayEntryCardProps {
  entry: CalendarEntryWithBlog;
  projectId: string;
  /** Compact rendering: used when 2+ cards share a cell, or inside the overflow list. */
  compact: boolean;
  isToday: boolean;
  dndActive: boolean;
  draggingEntryId: string | null;
  generatingId: string | null;
  generatedMap?: Map<string, { id: string; contentType?: string }>;
  onDragStart: (entryId: string, e: DragEvent) => void;
  onGenerateClick?: (entryId: string) => void;
  onRemoveEntry?: (entryId: string, keyword: string) => void;
}

/** A single scheduled entry's card — shared by the visible day-cell stack and the overflow list. */
function DayEntryCard({
  entry,
  projectId,
  compact,
  isToday,
  dndActive,
  draggingEntryId,
  generatingId,
  generatedMap,
  onDragStart,
  onGenerateClick,
  onRemoveEntry,
}: DayEntryCardProps) {
  const kwData = entry.keywords as
    | { source_type?: string | null; volume?: number | null; kd?: number | null; ai_source?: string | null }
    | undefined;
  const volume = kwData?.volume;
  const kd_ = kdLabel(kwData?.kd);
  const isGenerating = entry.status === "generating" || generatingId === entry.id;

  const calendarBlogId = entry.blog?.id;
  const historyKey = generatedMap ? generatedContentKey(entry.focus_keyword, entry.article_type ?? "blog") : "";
  const historyEntry = generatedMap?.get(historyKey);
  const resolvedBlogId = calendarBlogId ?? historyEntry?.id;

  const isGenerated =
    !!resolvedBlogId ||
    entry.status === "generated" ||
    entry.status === "downloaded" ||
    entry.status === "approved" ||
    entry.status === "published";
  const origin = resolveCalendarKeywordOrigin({
    contentHealthAudit: entry.content_health_audit,
    keywordSourceType: kwData?.source_type,
    articleType: entry.article_type,
    aiSourceFromEntry: entry.ai_source,
    aiSourceFromKeyword: kwData?.ai_source ?? null,
  });
  const canDragThisEntry = dndActive && !isGenerating;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={cn(
        "relative flex flex-col gap-0.5 rounded-[8px] border p-1.5",
        compact ? "shrink-0" : "min-h-0 flex-1",
        draggingEntryId === entry.id ? "opacity-60" : "",
        isToday ? "border-brand-action bg-brand-action/10" : "border-brand-action/20 bg-brand-action/[0.06]"
      )}
    >
      {canDragThisEntry ? (
        <div
          draggable
          onDragStart={(e: DragEvent) => onDragStart(entry.id, e)}
          aria-label={`Drag to reschedule ${entry.focus_keyword}`}
          title="Drag to another date"
          className="absolute left-0.5 top-0.5 z-10 cursor-grab rounded border border-transparent p-0.5 text-text-tertiary hover:border-border-subtle hover:bg-surface-hover active:cursor-grabbing"
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden className="opacity-70">
            <circle cx="3" cy="3" r="1.25" />
            <circle cx="7" cy="3" r="1.25" />
            <circle cx="3" cy="7" r="1.25" />
            <circle cx="7" cy="7" r="1.25" />
            <circle cx="3" cy="11" r="1.25" />
            <circle cx="7" cy="11" r="1.25" />
          </svg>
        </div>
      ) : null}
      <div className="flex items-center gap-1 pl-4">
        <span
          className={cn(
            "shrink-0 rounded-[3px] border px-1 py-[1px] font-mono text-[7px] font-bold uppercase leading-none tracking-wide",
            contentTypeTone(entry.article_type)
          )}
          title={typeShortLabel(entry.article_type)}
        >
          {typeShortLabel(entry.article_type).slice(0, 2)}
        </span>
        <p className="line-clamp-1 flex-1 text-[11px] font-semibold leading-tight text-text-primary" title={entry.focus_keyword}>
          {entry.focus_keyword}
        </p>
      </div>
      {!compact && (
        <>
          <div className="origin-left">
            <CalendarOriginPills resolved={origin} />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {volume != null && <span className="font-mono text-[9px] text-text-tertiary">{fmtVol(volume)}</span>}
            {volume != null && kwData?.kd ? <span className="text-[9px] text-text-tertiary/50">·</span> : null}
            {kwData?.kd ? <span className={`text-[9px] font-bold ${kd_.cls}`}>{kd_.text}</span> : null}
          </div>
        </>
      )}
      {isGenerated ? (
        <ProjectNavLink
          href={getContentPreviewUrl(projectId, resolvedBlogId || entry.blog?.id || entry.id, historyEntry?.contentType || entry.article_type)}
          className="mt-auto w-full rounded-[4px] py-0.5 text-center text-[8px] font-bold uppercase tracking-wide transition-colors sm:py-1 sm:text-[9px] bg-status-success/15 text-status-success hover:bg-status-success/25"
        >
          View {CONTENT_TYPE_LABEL[(historyEntry?.contentType || entry.article_type) as ContentType] || "Blog"}
        </ProjectNavLink>
      ) : isGenerating ? (
        <button
          type="button"
          disabled
          className="mt-auto w-full rounded-[4px] py-0.5 text-center text-[8px] font-bold uppercase tracking-wide select-none border border-status-warning/20 text-status-warning/70 sm:py-1 sm:text-[9px]"
        >
          Generating…
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onGenerateClick?.(entry.id);
          }}
          disabled={generatingId !== null}
          className="mt-auto w-full rounded-[4px] py-0.5 text-center text-[8px] font-bold uppercase tracking-wide transition-colors sm:py-1 sm:text-[9px] bg-brand-action/10 text-brand-action hover:bg-brand-action/20 disabled:opacity-50"
        >
          Generate →
        </button>
      )}
      {!isGenerating && onRemoveEntry && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveEntry(entry.id, entry.focus_keyword);
          }}
          className="absolute right-1 top-1 rounded border border-border-subtle/30 bg-surface-elevated/80 p-0.5 text-text-tertiary transition-colors hover:border-brand-coral/30 hover:bg-brand-coral/10 hover:text-brand-coral"
          title="Remove from calendar"
        >
          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </motion.div>
  );
}


export function MiniCalendar({
  entries,
  projectId,
  schedulingKeywordId,
  schedulingKeywordPhrase,
  onDatePick,
  onCancelSchedule,
  scheduleBusy = false,
  /** Drag a scheduled row to another day (grid). Disabled while `schedulingKeywordId` is set. */
  onMoveEntryToDate,
  /** Called when the user clicks an empty future day in the grid. Opens the add-keyword modal. */
  onEmptyDayClick,
  onGenerateClick,
  onRemoveEntry,
  generatingId = null,
  generatedMap,
}: {
  entries: CalendarEntryWithBlog[];
  projectId: string;
  schedulingKeywordId: string | null;
  schedulingKeywordPhrase: string;
  onDatePick: (date: string) => void;
  onCancelSchedule: () => void;
  scheduleBusy?: boolean;
  onMoveEntryToDate?: (entryId: string, date: string) => boolean | Promise<boolean>;
  onEmptyDayClick?: (date: string) => void;
  onGenerateClick?: (entryId: string) => void;
  onRemoveEntry?: (entryId: string, keyword: string) => void;
  generatingId?: string | null;
  generatedMap?: Map<string, { id: string; contentType?: string }>;
}) {
  const [calendarViewYM, setCalendarViewYM] = useState(() => {
    const today = new Date();
    return {
      y: today.getFullYear(),
      m: today.getMonth(),
    };
  });
  const viewYear = calendarViewYM.y;
  const viewMonth = calendarViewYM.m;
  const [draggingEntryId, setDraggingEntryId] = useState<string | null>(null);
  const [dragOverIso, setDragOverIso] = useState<string | null>(null);
  const monthNavIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopMonthNavInterval = useCallback(() => {
    if (monthNavIntervalRef.current) {
      clearInterval(monthNavIntervalRef.current);
      monthNavIntervalRef.current = null;
    }
  }, []);

  const endDragSession = useCallback(() => {
    setDraggingEntryId(null);
    setDragOverIso(null);
    stopMonthNavInterval();
  }, [stopMonthNavInterval]);

  useEffect(() => {
    return () => stopMonthNavInterval();
  }, [stopMonthNavInterval]);

  /** All entries per calendar day (multiple keywords can share the same date). */
  const entriesByDate = useMemo(() => {
    const m = new Map<string, CalendarEntryWithBlog[]>();
    for (const e of entries) {
      const k = normalizeCalDay(e.scheduled_date);
      const list = m.get(k) ?? [];
      list.push(e);
      m.set(k, list);
    }
    for (const list of m.values()) {
      list.sort((a, b) => a.focus_keyword.localeCompare(b.focus_keyword));
    }
    return m;
  }, [entries]);

  const normPhrase = schedulingKeywordPhrase.toLowerCase().trim();

  const entryConflictsWithScheduling = useCallback(
    (e: CalendarEntry) => {
      if (!schedulingKeywordId) return false;
      if (e.keyword_id) return e.keyword_id !== schedulingKeywordId;
      return !normPhrase || e.focus_keyword.toLowerCase().trim() !== normPhrase;
    },
    [schedulingKeywordId, normPhrase]
  );

  const schedulingKeywordCurrentDate = useMemo(() => {
    if (!schedulingKeywordId) return null;
    const e =
      entries.find(e => e.keyword_id === schedulingKeywordId) ??
      entries.find(e => !e.keyword_id && normPhrase && e.focus_keyword.toLowerCase().trim() === normPhrase);
    return e ? normalizeCalDay(e.scheduled_date) : null;
  }, [entries, schedulingKeywordId, normPhrase]);

  // ── Grid math ─────────────────────────────────────────────────────────────
  // Recalculated only when the displayed month/year changes, not on drag/hover.
  const { startOffset, totalCells, lastDayDate, monthLabel, todayISO, toISO } = useMemo(() => {
    const fd = new Date(viewYear, viewMonth, 1);
    const ld = new Date(viewYear, viewMonth + 1, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
    const t = new Date();
    return {
      startOffset: fd.getDay(),
      totalCells: Math.ceil((fd.getDay() + ld.getDate()) / 7) * 7,
      lastDayDate: ld.getDate(),
      monthLabel: fd.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      todayISO: iso(t.getFullYear(), t.getMonth(), t.getDate()),
      toISO: iso,
    };
  }, [viewYear, viewMonth]);

  const prevMonth = useCallback(
    () => setCalendarViewYM(v => (v.m === 0 ? { y: v.y - 1, m: 11 } : { ...v, m: v.m - 1 })),
    []
  );
  const nextMonth = useCallback(
    () => setCalendarViewYM(v => (v.m === 11 ? { y: v.y + 1, m: 0 } : { ...v, m: v.m + 1 })),
    []
  );

  const dndActive = Boolean(onMoveEntryToDate) && !schedulingKeywordId;

  const emptyDayDropProps = useCallback(
    (iso: string, eligible: boolean) => {
      if (!dndActive || !eligible) return {};
      return {
        onDragOver: (e: DragEvent) => {
          if (!draggingEntryId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragOverIso(iso);
        },
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          if (!draggingEntryId || scheduleBusy || !onMoveEntryToDate) return;
          let entryId = draggingEntryId;
          try {
            const raw = e.dataTransfer.getData(CAL_DRAG_MIME);
            if (raw) {
              const parsed = JSON.parse(raw) as { entryId?: string };
              if (parsed.entryId) entryId = parsed.entryId;
            }
          } catch {
            /* use draggingEntryId */
          }
          // Fire-and-forget: the parent applies an optimistic cache update
          // synchronously, so the card should snap to its new cell right away
          // instead of waiting on this promise.
          void onMoveEntryToDate(entryId, iso);
          endDragSession();
        },
      };
    },
    [dndActive, draggingEntryId, scheduleBusy, onMoveEntryToDate, endDragSession]
  );

  return (
    <div className="rounded-[16px] border border-border-subtle bg-surface-elevated p-6" onDragEnd={endDragSession}>
      <div className="mb-5 flex items-center justify-between">
        <div>
          {schedulingKeywordId ? (
            <p className="mt-0.5 text-[13px] text-status-warning">
              {schedulingKeywordCurrentDate ? (
                <>
                  Rescheduling &ldquo;<span className="font-semibold">{schedulingKeywordPhrase}</span>&rdquo; — pick a
                  new date
                </>
              ) : (
                <>
                  Pick a date for &ldquo;<span className="font-semibold">{schedulingKeywordPhrase}</span>&rdquo;
                </>
              )}
            </p>
          ) : (
            <p className="mt-0.5 text-[13px] text-text-tertiary">
              {entries.length} scheduled
              {dndActive ? " · Drag a card by its handle to reschedule" : ""}
              {onEmptyDayClick ? " · Click any date to add a keyword" : ""}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {schedulingKeywordId && (
            <button
              type="button"
              onClick={onCancelSchedule}
              className="rounded-full border border-border-subtle px-3 py-1 text-[12px] text-text-tertiary transition-colors hover:border-border-strong hover:text-text-primary"
            >
              Cancel
            </button>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevMonth}
              onDragEnter={e => {
                if (!draggingEntryId) return;
                e.preventDefault();
                stopMonthNavInterval();
                monthNavIntervalRef.current = setInterval(() => {
                  prevMonth();
                }, 480);
              }}
              onDragLeave={() => {
                stopMonthNavInterval();
              }}
              title={dndActive && draggingEntryId ? "Hold drag here to go to previous month" : undefined}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-lg text-text-secondary transition-colors hover:bg-surface-hover ${
                draggingEntryId ? "ring-1 ring-brand-action/30 bg-brand-action/5" : ""
              }`}
            >
              ‹
            </button>
            <span className="w-36 text-center text-[13px] font-medium text-text-primary">{monthLabel}</span>
            <button
              type="button"
              onClick={nextMonth}
              onDragEnter={e => {
                if (!draggingEntryId) return;
                e.preventDefault();
                stopMonthNavInterval();
                monthNavIntervalRef.current = setInterval(() => {
                  nextMonth();
                }, 480);
              }}
              onDragLeave={() => {
                stopMonthNavInterval();
              }}
              title={dndActive && draggingEntryId ? "Hold drag here to go to next month" : undefined}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-lg text-text-secondary transition-colors hover:bg-surface-hover ${
                draggingEntryId ? "ring-1 ring-brand-action/30 bg-brand-action/5" : ""
              }`}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <div className="mb-1 grid grid-cols-7 border-b border-border-subtle pb-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div
            key={d}
            className="py-1 text-center text-[10px] font-bold uppercase tracking-widest text-text-tertiary"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: totalCells }).map((_, idx) => {
          const dayNum = idx - startOffset + 1;

          if (dayNum < 1 || dayNum > lastDayDate) {
            return <div key={idx} className="min-h-[120px]" />;
          }

          const iso = toISO(viewYear, viewMonth, dayNum);
          const dayEntries = entriesByDate.get(iso) ?? [];
          const hasDayEntry = dayEntries.length > 0;
          const isToday = iso === todayISO;
          const isPast = iso < todayISO;

          const isOwnCurrentDate = !!schedulingKeywordId && iso === schedulingKeywordCurrentDate;

          const isOtherKeywordDate =
            !!schedulingKeywordId && dayEntries.some(e => entryConflictsWithScheduling(e));

          const isPickable =
            !!schedulingKeywordId &&
            !isPast &&
            !isOtherKeywordDate &&
            iso !== schedulingKeywordCurrentDate;

          if (schedulingKeywordId && isOwnCurrentDate) {
            const schedulingEntry =
              dayEntries.find(e => e.keyword_id === schedulingKeywordId) ??
              dayEntries.find(
                e => !e.keyword_id && normPhrase && e.focus_keyword.toLowerCase().trim() === normPhrase
              ) ??
              dayEntries[0] ??
              null;
            return (
              <div
                key={idx}
                className={`flex min-h-[120px] flex-col rounded-[8px] border border-dashed border-status-warning/50 bg-status-warning/[0.06] p-1.5 ${
                  isToday ? "ring-1 ring-status-warning/40" : ""
                }`}
              >
                <span className="self-end text-[10px] font-bold leading-none text-status-warning/60">{dayNum}</span>
                <p className="line-clamp-2 flex flex-1 items-center justify-center px-1 text-center text-[11px] font-medium text-status-warning">
                  {schedulingEntry?.focus_keyword}
                </p>
                <span className="pb-0.5 text-center text-[9px] text-status-warning/60">current date</span>
              </div>
            );
          }

          if (hasDayEntry && !isOwnCurrentDate) {
            const isBlocked = !!schedulingKeywordId;

            if (isBlocked) {
              return (
                <div
                  key={idx}
                  className={`flex min-h-[120px] flex-col gap-1 rounded-[8px] border border-border-subtle/40 bg-surface-secondary/30 p-1.5 opacity-40 ${
                    isToday ? "ring-1 ring-brand-action/20" : ""
                  }`}
                >
                  <span className="self-end text-[10px] font-medium leading-none text-text-tertiary">{dayNum}</span>
                  <div className="flex min-h-0 flex-1 flex-col gap-1">
                    {dayEntries.map(e => (
                      <p
                        key={e.id}
                        className="line-clamp-2 px-0.5 text-[11px] text-text-tertiary"
                        title={e.focus_keyword}
                      >
                        {e.focus_keyword}
                      </p>
                    ))}
                  </div>
                </div>
              );
            }

            const stack = dayEntries.length > 1;
            const visibleEntries = dayEntries.slice(0, MAX_VISIBLE_PER_DAY);
            const overflowEntries = dayEntries.slice(MAX_VISIBLE_PER_DAY);
            const canAddMore = !schedulingKeywordId && !isPast && !!onEmptyDayClick;
            const cardProps = (entry: CalendarEntryWithBlog) => ({
              entry,
              projectId,
              isToday,
              dndActive,
              draggingEntryId,
              generatingId,
              generatedMap,
              onGenerateClick,
              onRemoveEntry,
              onDragStart: (entryId: string, e: DragEvent) => {
                e.stopPropagation();
                setDraggingEntryId(entryId);
                e.dataTransfer.setData(CAL_DRAG_MIME, JSON.stringify({ entryId }));
                e.dataTransfer.setData("text/plain", entryId);
                e.dataTransfer.effectAllowed = "move";
              },
            });
            return (
              <div key={idx} className="group flex min-h-[152px] flex-col gap-1">
                <span
                  className={`self-end text-[10px] font-bold leading-none ${
                    isToday ? "text-brand-action" : "text-brand-action/60"
                  }`}
                >
                  {dayNum}
                </span>
                <div className="flex min-h-0 flex-1 flex-col gap-1">
                  <AnimatePresence initial={false} mode="popLayout">
                    {visibleEntries.map(entry => (
                      <DayEntryCard key={entry.id} {...cardProps(entry)} compact={stack} />
                    ))}
                  </AnimatePresence>
                  {overflowEntries.length > 0 && (
                    <DropdownMenu
                      align="start"
                      menuWidth="md"
                      trigger={
                        <button
                          type="button"
                          className="flex h-5 shrink-0 items-center justify-center rounded-[5px] border border-border-subtle bg-surface-elevated px-1.5 text-[9px] font-semibold text-text-secondary transition-colors hover:border-brand-action/40 hover:text-brand-action"
                        >
                          +{overflowEntries.length} more
                        </button>
                      }
                    >
                      <div className="max-h-72 space-y-1 overflow-y-auto p-0.5">
                        {overflowEntries.map(entry => (
                          <DayEntryCard key={entry.id} {...cardProps(entry)} compact />
                        ))}
                      </div>
                    </DropdownMenu>
                  )}
                  {/* Collapsed until the day cell is hovered — content keeps its full
                      height at rest, and this row grows in (shrinking the cards above)
                      only when the user is about to interact with this date. */}
                  {canAddMore && (
                    <div className="grid shrink-0 grid-rows-[0fr] overflow-hidden transition-[grid-template-rows] duration-200 ease-out group-hover:grid-rows-[1fr]">
                      <div className="min-h-0 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => onEmptyDayClick!(iso)}
                          className="mt-1 flex h-5 w-full items-center justify-center gap-0.5 rounded-[5px] border border-dashed border-border-subtle text-[9px] font-semibold text-text-tertiary transition-colors hover:border-brand-action/40 hover:bg-brand-action/5 hover:text-brand-action"
                        >
                          + Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (isPickable) {
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onDatePick(iso)}
                className={`flex min-h-[90px] flex-col items-center justify-between rounded-[8px] border border-dashed border-status-warning/40 bg-status-warning/[0.04] px-1 py-1.5 transition-all hover:border-status-warning/70 hover:bg-status-warning/10 ${
                  isToday ? "ring-1 ring-status-warning/40" : ""
                }`}
              >
                <span className="self-end text-[10px] font-bold leading-none text-status-warning/50">{dayNum}</span>
                <span className="text-[20px] text-status-warning/40">+</span>
                <span className="text-[9px] font-medium text-status-warning/60">Pick</span>
              </button>
            );
          }

          if (!schedulingKeywordId && !isPast && onEmptyDayClick) {
            const dropRing = dragOverIso === iso && draggingEntryId ? "ring-2 ring-brand-action/50" : "";
            return (
              <div
                key={idx}
                className={`group relative flex min-h-[90px] flex-col rounded-[8px] p-1.5 ${
                  isToday ? "bg-brand-action/3 ring-1 ring-brand-action/30" : "border border-transparent hover:border-border-subtle"
                } ${dropRing}`}
                {...emptyDayDropProps(iso, true)}
              >
                <span
                  className={`self-end text-[10px] font-medium leading-none ${
                    isToday ? "font-bold text-brand-action" : "text-text-tertiary"
                  }`}
                >
                  {dayNum}
                </span>
                <button
                  type="button"
                  onClick={() => onEmptyDayClick(iso)}
                  className="absolute inset-1 flex flex-col items-center justify-center rounded-[6px] border border-transparent bg-surface-elevated/0 opacity-0 transition-all hover:border-brand-action/25 hover:bg-brand-action/10 group-hover:opacity-100"
                >
                  <span className="text-xl font-light leading-none text-brand-action">+</span>
                  <span className="mt-0.5 text-[9px] font-semibold text-text-secondary">Add keyword</span>
                </button>
              </div>
            );
          }

          const dropRingDefault = !isPast && dragOverIso === iso && draggingEntryId ? "ring-2 ring-brand-action/50" : "";
          return (
            <div
              key={idx}
              className={`flex min-h-[90px] flex-col rounded-[8px] p-1.5 ${
                isToday ? "bg-brand-action/3 ring-1 ring-brand-action/30" : ""
              } ${isPast ? "opacity-25" : ""} ${schedulingKeywordId && !isPast ? "opacity-20" : ""} ${dropRingDefault}`}
              {...emptyDayDropProps(iso, !isPast)}
            >
              <span
                className={`self-end text-[10px] font-medium leading-none ${
                  isToday ? "font-bold text-brand-action" : "text-text-tertiary"
                }`}
              >
                {dayNum}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 border-t border-border-subtle pt-4 text-[11px] text-text-tertiary">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] border border-brand-action/20 bg-brand-action/10" />
          Scheduled
        </span>
        {schedulingKeywordId ? (
          <>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[3px] border border-dashed border-status-warning/50 bg-status-warning/[0.04]" />
              Click to schedule here
            </span>
            {schedulingKeywordCurrentDate ? (
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-[3px] border border-dashed border-status-warning/50 bg-status-warning/[0.06]" />
                Current date (pick a different one to move)
              </span>
            ) : null}
          </>
        ) : null}
        {dndActive ? (
          <span className="flex items-center gap-1.5">
            <span className="text-text-secondary">‹ ›</span>
            While dragging, hover the month arrows to change month
          </span>
        ) : null}
      </div>

    </div>
  );
}
