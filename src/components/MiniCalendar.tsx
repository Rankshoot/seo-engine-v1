"use client";

import { useState, useMemo } from "react";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { CalendarOriginPills } from "@/components/CalendarOriginPills";
import type { CalendarEntry } from "@/lib/types";
import { resolveCalendarKeywordOrigin } from "@/lib/calendar-keyword-origin";
import { resolveCalendarLifecycleStatus } from "@/lib/calendar-lifecycle";

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

function fmtModalDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function MiniCalendar({
  entries,
  projectId,
  schedulingKeywordId,
  schedulingKeywordPhrase,
  onDatePick,
  onCancelSchedule,
  unscheduledKeywords = [],
  onScheduleKeywordOnDate,
  scheduleBusy = false,
}: {
  entries: CalendarEntry[];
  projectId: string;
  schedulingKeywordId: string | null;
  schedulingKeywordPhrase: string;
  onDatePick: (date: string) => void;
  onCancelSchedule: () => void;
  unscheduledKeywords?: Array<{
    id: string;
    keyword: string;
    volume?: number | null;
    kd?: number | null;
    /** Traffic potential (e.g. Ahrefs-style estimate for top-ranking page). */
    traffic?: number | null;
  }>;
  onScheduleKeywordOnDate?: (keywordId: string, date: string) => boolean | Promise<boolean>;
  scheduleBusy?: boolean;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [pickKeywordModalDate, setPickKeywordModalDate] = useState<string | null>(null);

  const dateToEntry = useMemo(
    () => new Map(entries.map(e => [e.scheduled_date, e])),
    [entries]
  );

  const normPhrase = schedulingKeywordPhrase.toLowerCase().trim();

  const schedulingKeywordCurrentDate = useMemo(() => {
    if (!schedulingKeywordId) return null;
    const e =
      entries.find(e => e.keyword_id === schedulingKeywordId) ??
      entries.find(e => !e.keyword_id && normPhrase && e.focus_keyword.toLowerCase().trim() === normPhrase);
    return e?.scheduled_date ?? null;
  }, [entries, schedulingKeywordId, normPhrase]);

  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  const startOffset = firstDay.getDay();
  const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const monthLabel = firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const pad = (n: number) => String(n).padStart(2, "0");
  const toISO = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate());

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(y => y - 1);
      setViewMonth(11);
    } else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(y => y + 1);
      setViewMonth(0);
    } else setViewMonth(m => m + 1);
  };

  const canOpenAddModal = Boolean(onScheduleKeywordOnDate) && unscheduledKeywords.length > 0;

  return (
    <div className="rounded-[16px] border border-border-subtle bg-surface-elevated p-6">
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
              {unscheduledKeywords.length > 0
                ? ` · ${unscheduledKeywords.length} waiting for a date`
                : ""}
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
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-text-secondary transition-colors hover:bg-surface-hover"
            >
              ‹
            </button>
            <span className="w-36 text-center text-[13px] font-medium text-text-primary">{monthLabel}</span>
            <button
              type="button"
              onClick={nextMonth}
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-text-secondary transition-colors hover:bg-surface-hover"
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
          const entry = dateToEntry.get(iso) ?? null;
          const isToday = iso === todayISO;
          const isPast = iso < todayISO;

          const isOwnCurrentDate = !!schedulingKeywordId && iso === schedulingKeywordCurrentDate;

          const isOtherKeywordDate =
            !!entry &&
            (() => {
              if (entry.keyword_id) return entry.keyword_id !== schedulingKeywordId;
              return !normPhrase || entry.focus_keyword.toLowerCase().trim() !== normPhrase;
            })();

          const isPickable =
            !!schedulingKeywordId &&
            !isPast &&
            !isOtherKeywordDate &&
            iso !== schedulingKeywordCurrentDate;

          if (schedulingKeywordId && isOwnCurrentDate) {
            return (
              <div
                key={idx}
                className={`flex min-h-[90px] flex-col rounded-[8px] border border-dashed border-[#f59e0b]/50 bg-[#f59e0b]/[0.06] p-1.5 ${
                  isToday ? "ring-1 ring-[#f59e0b]/40" : ""
                }`}
              >
                <span className="self-end text-[10px] font-bold leading-none text-[#f59e0b]/60">{dayNum}</span>
                <p className="line-clamp-2 flex flex-1 items-center justify-center px-1 text-center text-[9px] font-medium text-[#f59e0b]">
                  {entry?.focus_keyword}
                </p>
                <span className="pb-0.5 text-center text-[9px] text-[#f59e0b]/60">current date</span>
              </div>
            );
          }

          if (entry && !isOwnCurrentDate) {
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
            const isGenerated = entry.status === "generated" || entry.status === "downloaded";
            const isBlocked = !!schedulingKeywordId;

            const origin = resolveCalendarKeywordOrigin({
              keywordSourceType: kwData?.source_type,
              articleType: entry.article_type,
              aiSourceFromEntry: entry.ai_source,
              aiSourceFromKeyword: kwData?.ai_source ?? null,
            });
            const life = resolveCalendarLifecycleStatus({
              hasCalendarEntry: true,
              calendarStatus: entry.status,
            });

            if (isBlocked) {
              return (
                <div
                  key={idx}
                  className={`flex min-h-[90px] flex-col rounded-[8px] border border-border-subtle/40 bg-surface-secondary/30 p-1.5 opacity-40 ${
                    isToday ? "ring-1 ring-brand-action/20" : ""
                  }`}
                >
                  <span className="self-end text-[10px] font-medium leading-none text-text-tertiary">{dayNum}</span>
                  <p className="line-clamp-2 flex flex-1 items-center px-0.5 text-[9px] text-text-tertiary">
                    {entry.focus_keyword}
                  </p>
                </div>
              );
            }

            return (
              <div
                key={idx}
                className={`flex min-h-[90px] flex-col gap-1 rounded-[8px] border p-2 transition-all ${
                  isToday
                    ? "border-brand-action bg-brand-action/10"
                    : "border-brand-action/20 bg-brand-action/[0.06]"
                }`}
              >
                <span
                  className={`self-end text-[10px] font-bold leading-none ${
                    isToday ? "text-brand-action" : "text-brand-action/60"
                  }`}
                >
                  {dayNum}
                </span>
                <p
                  className="line-clamp-2 flex-1 text-[10px] font-semibold leading-tight text-text-primary"
                  title={entry.focus_keyword}
                >
                  {entry.focus_keyword}
                </p>
                <div className="origin-left scale-[0.88]">
                  <CalendarOriginPills resolved={origin} />
                </div>
                <p className={`text-[8px] font-bold uppercase tracking-wide ${life.color}`}>{life.label}</p>
                <div className="flex flex-wrap items-center gap-1">
                  {volume != null && (
                    <span className="font-mono text-[9px] text-text-tertiary">{fmtVol(volume)}</span>
                  )}
                  {volume != null && kwData?.kd ? <span className="text-[9px] text-text-tertiary/50">·</span> : null}
                  {kwData?.kd ? (
                    <span className={`text-[9px] font-bold ${kd_.cls}`}>{kd_.text}</span>
                  ) : null}
                </div>
                <ProjectNavLink
                  href={`/projects/${projectId}/blogs?entry=${entry.id}`}
                  className={`mt-auto w-full rounded-[4px] py-1 text-center text-[9px] font-bold uppercase tracking-wide transition-colors ${
                    isGenerated
                      ? "bg-[#10b981]/15 text-[#10b981] hover:bg-[#10b981]/25"
                      : "bg-brand-action/10 text-brand-action hover:bg-brand-action/20"
                  }`}
                >
                  {isGenerated ? "View Blog" : "Generate →"}
                </ProjectNavLink>
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

          if (!schedulingKeywordId && !isPast && canOpenAddModal) {
            return (
              <div
                key={idx}
                className={`group relative flex min-h-[90px] flex-col rounded-[8px] p-1.5 ${
                  isToday ? "bg-brand-action/[0.03] ring-1 ring-brand-action/30" : "border border-transparent hover:border-border-subtle"
                }`}
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
                  onClick={() => setPickKeywordModalDate(iso)}
                  className="absolute inset-1 flex flex-col items-center justify-center rounded-[6px] border border-transparent bg-surface-elevated/0 opacity-0 transition-all hover:border-brand-action/25 hover:bg-brand-action/10 group-hover:opacity-100"
                >
                  <span className="text-xl font-light leading-none text-brand-action">+</span>
                  <span className="mt-0.5 text-[9px] font-semibold text-text-secondary">Add keyword</span>
                </button>
              </div>
            );
          }

          return (
            <div
              key={idx}
              className={`flex min-h-[90px] flex-col rounded-[8px] p-1.5 ${
                isToday ? "bg-brand-action/[0.03] ring-1 ring-brand-action/30" : ""
              } ${isPast ? "opacity-25" : ""} ${schedulingKeywordId && !isPast ? "opacity-20" : ""}`}
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
        {canOpenAddModal && !schedulingKeywordId ? (
          <span className="flex items-center gap-1.5">
            <span className="text-brand-action">+</span>
            Hover a free date — add keyword
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
      </div>

      {pickKeywordModalDate && onScheduleKeywordOnDate ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mini-cal-add-kw-title"
          onClick={() => setPickKeywordModalDate(null)}
        >
          <div
            className="w-full max-w-2xl rounded-[16px] border border-border-subtle bg-surface-elevated p-5 shadow-xl ring-1 ring-border-subtle/80"
            onClick={e => e.stopPropagation()}
          >
            <h4 id="mini-cal-add-kw-title" className="text-[16px] font-medium text-text-primary">
              Add keyword — {fmtModalDate(pickKeywordModalDate)}
            </h4>
            <p className="mt-1 text-[13px] text-text-tertiary">
              Approved keywords that are not on the calendar yet. Pick one to schedule on this date.
            </p>
            {unscheduledKeywords.length === 0 ? (
              <p className="mt-4 text-[13px] text-text-tertiary">Nothing to schedule — all approved keywords have dates.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <div className="min-w-[28rem]">
                <div className="grid grid-cols-[minmax(0,1fr)_4rem_3.25rem_4rem_auto] gap-x-2 gap-y-1 border-b border-border-subtle pb-2 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
                  <span>Keyword</span>
                  <span className="text-right">Vol</span>
                  <span className="text-center">KD</span>
                  <span className="text-right">Traffic</span>
                  <span className="text-right" aria-hidden />
                </div>
                <ul className="max-h-64 space-y-1 overflow-y-auto pr-1 pt-2">
                  {unscheduledKeywords.map(row => {
                    const kd = kdLabel(row.kd);
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          disabled={scheduleBusy}
                          onClick={async () => {
                            if (scheduleBusy) return;
                            const ok = await onScheduleKeywordOnDate(row.id, pickKeywordModalDate);
                            if (ok) setPickKeywordModalDate(null);
                          }}
                          className="grid w-full grid-cols-[minmax(0,1fr)_4rem_3.25rem_4rem_auto] items-center gap-x-2 rounded-[10px] border border-border-subtle bg-surface-secondary px-2 py-2 text-left text-[13px] text-text-primary transition-colors hover:border-brand-action/35 hover:bg-surface-hover disabled:opacity-50"
                        >
                          <span className="min-w-0 truncate pl-1 font-medium" title={row.keyword}>
                            {row.keyword}
                          </span>
                          <span className="text-right font-mono text-[11px] tabular-nums text-text-secondary">
                            {fmtVol(row.volume)}
                          </span>
                          <span className={`text-center text-[11px] font-bold ${kd.cls}`}>{kd.text}</span>
                          <span className="text-right font-mono text-[11px] tabular-nums text-text-secondary">
                            {fmtVol(row.traffic)}
                          </span>
                          <span className="shrink-0 pr-1 text-[11px] font-semibold text-brand-action">Schedule →</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                </div>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPickKeywordModalDate(null)}
                className="rounded-full border border-border-subtle px-4 py-2 text-[13px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
