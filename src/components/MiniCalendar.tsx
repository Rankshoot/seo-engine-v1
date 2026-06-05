"use client";

import { useState, useMemo, useRef, useEffect, useCallback, type DragEvent } from "react";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { CalendarOriginPills } from "@/components/CalendarOriginPills";
import type { CalendarEntry, CalendarEntryWithBlog } from "@/lib/types";
import { resolveCalendarKeywordOrigin } from "@/lib/calendar-keyword-origin";
import { resolveCalendarLifecycleStatus } from "@/lib/calendar-lifecycle";

const CAL_DRAG_MIME = "application/x-seo-calendar-entry";

function normalizeCalDay(raw: string): string {
  return String(raw).slice(0, 10);
}

function fmtVol(n: number | undefined | null): string {
  if (!n || n === 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function kdLabel(kd: number | undefined | null): { text: string; cls: string } {
  if (!kd || kd === 0) return { text: "—", cls: "text-text-tertiary" };
  if (kd < 30) return { text: "Easy", cls: "text-[#10b981]" };
  if (kd < 60) return { text: "Med", cls: "text-[#f59e0b]" };
  return { text: "Hard", cls: "text-brand-coral" };
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
}) {
  const today = new Date();
  const [calendarViewYM, setCalendarViewYM] = useState(() => ({
    y: today.getFullYear(),
    m: today.getMonth(),
  }));
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

  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  const startOffset = firstDay.getDay();
  const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const monthLabel = firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const pad = (n: number) => String(n).padStart(2, "0");
  const toISO = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate());

  const prevMonth = () =>
    setCalendarViewYM(v => (v.m === 0 ? { y: v.y - 1, m: 11 } : { ...v, m: v.m - 1 }));
  const nextMonth = () =>
    setCalendarViewYM(v => (v.m === 11 ? { y: v.y + 1, m: 0 } : { ...v, m: v.m + 1 }));

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
        onDrop: async (e: DragEvent) => {
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
          await onMoveEntryToDate(entryId, iso);
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
          <h3 className="text-[18px] font-medium tracking-[-0.18px] text-text-primary">Content Calendar</h3>
          {schedulingKeywordId ? (
            <p className="mt-0.5 text-[13px] text-[#f59e0b]">
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
              {onEmptyDayClick ? " · Click any free date to add a keyword" : ""}
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

          if (dayNum < 1 || dayNum > lastDay.getDate()) {
            return <div key={idx} className="min-h-[90px]" />;
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
                className={`flex min-h-[90px] flex-col rounded-[8px] border border-dashed border-[#f59e0b]/50 bg-[#f59e0b]/[0.06] p-1.5 ${
                  isToday ? "ring-1 ring-[#f59e0b]/40" : ""
                }`}
              >
                <span className="self-end text-[10px] font-bold leading-none text-[#f59e0b]/60">{dayNum}</span>
                <p className="line-clamp-2 flex flex-1 items-center justify-center px-1 text-center text-[9px] font-medium text-[#f59e0b]">
                  {schedulingEntry?.focus_keyword}
                </p>
                <span className="pb-0.5 text-center text-[9px] text-[#f59e0b]/60">current date</span>
              </div>
            );
          }

          if (hasDayEntry && !isOwnCurrentDate) {
            const isBlocked = !!schedulingKeywordId;

            if (isBlocked) {
              return (
                <div
                  key={idx}
                  className={`flex min-h-[90px] flex-col gap-1 rounded-[8px] border border-border-subtle/40 bg-surface-secondary/30 p-1.5 opacity-40 ${
                    isToday ? "ring-1 ring-brand-action/20" : ""
                  }`}
                >
                  <span className="self-end text-[10px] font-medium leading-none text-text-tertiary">{dayNum}</span>
                  <div className="flex min-h-0 flex-1 flex-col gap-1">
                    {dayEntries.map(e => (
                      <p
                        key={e.id}
                        className="line-clamp-2 px-0.5 text-[9px] text-text-tertiary"
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
            return (
              <div key={idx} className="flex min-h-[90px] flex-col gap-1">
                <span
                  className={`self-end text-[10px] font-bold leading-none ${
                    isToday ? "text-brand-action" : "text-brand-action/60"
                  }`}
                >
                  {dayNum}
                </span>
                <div className="flex min-h-0 flex-1 flex-col gap-1">
                  {dayEntries.map(entry => {
                    const kwData = entry.keywords as
                      | {
                          source_type?: string | null;
                          volume?: number | null;
                          kd?: number | null;
                          ai_source?: string | null;
                        }
                      | undefined;
                    const volume = kwData?.volume;
                    const kd_ = kdLabel(kwData?.kd);
                    const isGenerating = entry.status === "generating" || generatingId === entry.id;
                    const isGenerated = entry.status === "generated" || entry.status === "downloaded" || entry.status === "approved" || entry.status === "published";
                    const origin = resolveCalendarKeywordOrigin({
                      contentHealthAudit: entry.content_health_audit,
                      keywordSourceType: kwData?.source_type,
                      articleType: entry.article_type,
                      aiSourceFromEntry: entry.ai_source,
                      aiSourceFromKeyword: kwData?.ai_source ?? null,
                    });
                    const effectiveStatus = isGenerating ? "generating" : entry.status;
                    const life = resolveCalendarLifecycleStatus({
                      hasCalendarEntry: true,
                      calendarStatus: effectiveStatus,
                    });
                    const canDragThisEntry = dndActive && !isGenerating;

                    return (
                      <div
                        key={entry.id}
                        className={`relative flex min-h-0 flex-1 flex-col gap-0.5 rounded-[8px] border p-1.5 transition-all ${
                          draggingEntryId === entry.id ? "opacity-75" : ""
                        } ${
                          isToday
                            ? "border-brand-action bg-brand-action/10"
                            : "border-brand-action/20 bg-brand-action/[0.06]"
                        }`}
                      >
                        {canDragThisEntry ? (
                          <div
                            draggable
                            onDragStart={(e: DragEvent) => {
                              e.stopPropagation();
                              setDraggingEntryId(entry.id);
                              const payload = JSON.stringify({ entryId: entry.id });
                              e.dataTransfer.setData(CAL_DRAG_MIME, payload);
                              e.dataTransfer.setData("text/plain", entry.id);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            aria-label={`Drag to reschedule ${entry.focus_keyword}`}
                            title="Drag to another date"
                            className="absolute left-0.5 top-0.5 z-10 cursor-grab rounded border border-transparent p-0.5 text-text-tertiary hover:border-border-subtle hover:bg-surface-hover active:cursor-grabbing"
                          >
                            <svg
                              width="10"
                              height="14"
                              viewBox="0 0 10 14"
                              fill="currentColor"
                              aria-hidden
                              className="opacity-70"
                            >
                              <circle cx="3" cy="3" r="1.25" />
                              <circle cx="7" cy="3" r="1.25" />
                              <circle cx="3" cy="7" r="1.25" />
                              <circle cx="7" cy="7" r="1.25" />
                              <circle cx="3" cy="11" r="1.25" />
                              <circle cx="7" cy="11" r="1.25" />
                            </svg>
                          </div>
                        ) : null}
                        <p
                          className={`line-clamp-2 pl-4 text-[10px] font-semibold leading-tight text-text-primary ${
                            stack ? "text-[9px]" : ""
                          }`}
                          title={entry.focus_keyword}
                        >
                          {entry.focus_keyword}
                        </p>
                        <div className={`origin-left ${stack ? "scale-[0.82]" : "scale-[0.88]"}`}>
                          <CalendarOriginPills resolved={origin} />
                        </div>
                        <p className={`text-[8px] font-bold uppercase tracking-wide ${life.color}`}>{life.label}</p>
                        <div className="flex flex-wrap items-center gap-1">
                          {volume != null && (
                            <span className="font-mono text-[9px] text-text-tertiary">{fmtVol(volume)}</span>
                          )}
                          {volume != null && kwData?.kd ? (
                            <span className="text-[9px] text-text-tertiary/50">·</span>
                          ) : null}
                          {kwData?.kd ? (
                            <span className={`text-[9px] font-bold ${kd_.cls}`}>{kd_.text}</span>
                          ) : null}
                        </div>
                        {isGenerated ? (
                          <ProjectNavLink
                            href={`/projects/${projectId}/blogs/${entry.blog?.id || entry.id}`}
                            className="mt-auto w-full rounded-[4px] py-0.5 text-center text-[8px] font-bold uppercase tracking-wide transition-colors sm:py-1 sm:text-[9px] bg-[#10b981]/15 text-[#10b981] hover:bg-[#10b981]/25"
                          >
                            View Blog
                          </ProjectNavLink>
                        ) : isGenerating ? (
                          <button
                            type="button"
                            disabled
                            className="mt-auto w-full rounded-[4px] py-0.5 text-center text-[8px] font-bold uppercase tracking-wide select-none border border-[#f59e0b]/20 text-[#f59e0b]/70 sm:py-1 sm:text-[9px]"
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
                      </div>
                    );
                  })}
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
                className={`flex min-h-[90px] flex-col items-center justify-between rounded-[8px] border border-dashed border-[#f59e0b]/40 bg-[#f59e0b]/[0.04] px-1 py-1.5 transition-all hover:border-[#f59e0b]/70 hover:bg-[#f59e0b]/10 ${
                  isToday ? "ring-1 ring-[#f59e0b]/40" : ""
                }`}
              >
                <span className="self-end text-[10px] font-bold leading-none text-[#f59e0b]/50">{dayNum}</span>
                <span className="text-[20px] text-[#f59e0b]/40">+</span>
                <span className="text-[9px] font-medium text-[#f59e0b]/60">Pick</span>
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
        {onEmptyDayClick && !schedulingKeywordId ? (
          <span className="flex items-center gap-1.5">
            <span className="text-brand-action">+</span>
            Click a free date to add a keyword
          </span>
        ) : null}
        {schedulingKeywordId ? (
          <>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[3px] border border-dashed border-[#f59e0b]/50 bg-[#f59e0b]/[0.04]" />
              Click to schedule here
            </span>
            {schedulingKeywordCurrentDate ? (
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-[3px] border border-dashed border-[#f59e0b]/50 bg-[#f59e0b]/[0.06]" />
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
