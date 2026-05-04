"use client";

import { useState, useMemo } from "react";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import type { CalendarEntry } from "@/lib/types";

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
}: {
  entries: CalendarEntry[];
  projectId: string;
  schedulingKeywordId: string | null;
  schedulingKeywordPhrase: string;
  onDatePick: (date: string) => void;
  onCancelSchedule: () => void;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // Map date → entry for O(1) lookup
  const dateToEntry = useMemo(
    () => new Map(entries.map(e => [e.scheduled_date, e])),
    [entries]
  );

  // Normalised phrase for matching entries that have keyword_id: null (LLM mismatch)
  const normPhrase = schedulingKeywordPhrase.toLowerCase().trim();

  // Current date already assigned to the keyword being scheduled (if any).
  // Match by keyword_id first, then fall back to focus_keyword comparison so
  // entries created by generateCalendar (which may have keyword_id: null) are found.
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
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  return (
    <div className="rounded-[16px] border border-border-subtle bg-surface-elevated p-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-[18px] font-medium text-text-primary tracking-[-0.18px]">
            Content Calendar
          </h3>
          {schedulingKeywordId ? (
            <p className="mt-0.5 text-[13px] text-[#f59e0b]">
              {schedulingKeywordCurrentDate
                ? <>Rescheduling &ldquo;<span className="font-semibold">{schedulingKeywordPhrase}</span>&rdquo; — pick a new date</>
                : <>Pick a date for &ldquo;<span className="font-semibold">{schedulingKeywordPhrase}</span>&rdquo;</>
              }
            </p>
          ) : (
            <p className="mt-0.5 text-[13px] text-text-tertiary">
              {entries.length} keyword{entries.length !== 1 ? "s" : ""} scheduled
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {schedulingKeywordId && (
            <button
              type="button"
              onClick={onCancelSchedule}
              className="text-[12px] text-text-tertiary hover:text-text-primary transition-colors px-3 py-1 rounded-full border border-border-subtle hover:border-border-strong"
            >
              Cancel
            </button>
          )}
          <div className="flex items-center gap-1">
            <button type="button" onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover transition-colors text-text-secondary text-lg">
              ‹
            </button>
            <span className="text-[13px] font-medium text-text-primary w-36 text-center">{monthLabel}</span>
            <button type="button" onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover transition-colors text-text-secondary text-lg">
              ›
            </button>
          </div>
        </div>
      </div>

      {/* ── Day-of-week headers ─────────────────────────────────────────── */}
      <div className="grid grid-cols-7 mb-1 border-b border-border-subtle pb-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-text-tertiary py-1">
            {d}
          </div>
        ))}
      </div>

      {/* ── Date grid ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 gap-1 mt-1">
        {Array.from({ length: totalCells }).map((_, idx) => {
          const dayNum = idx - startOffset + 1;

          if (dayNum < 1 || dayNum > lastDay.getDate()) {
            return <div key={idx} className="min-h-[90px]" />;
          }

          const iso = toISO(viewYear, viewMonth, dayNum);
          const entry = dateToEntry.get(iso) ?? null;
          const isToday = iso === todayISO;
          const isPast = iso < todayISO;

          // Is this date occupied by the keyword currently being scheduled?
          const isOwnCurrentDate = !!schedulingKeywordId && iso === schedulingKeywordCurrentDate;

          // Is this date occupied by a DIFFERENT keyword?
          // When keyword_id is null (generateCalendar mismatch), fall back to focus_keyword comparison.
          const isOtherKeywordDate = !!entry && (() => {
            if (entry.keyword_id) return entry.keyword_id !== schedulingKeywordId;
            // null keyword_id: treat as "other" unless focus_keyword matches the phrase being scheduled
            return !normPhrase || entry.focus_keyword.toLowerCase().trim() !== normPhrase;
          })();

          // In scheduling mode: clickable when free OR it's the keyword's own current date (reschedule)
          const isPickable =
            !!schedulingKeywordId &&
            !isPast &&
            !isOtherKeywordDate &&
            iso !== schedulingKeywordCurrentDate; // don't let them "pick" the same date again

          // ── Own current date cell (reschedule context) ─────────────
          if (schedulingKeywordId && isOwnCurrentDate) {
            return (
              <div
                key={idx}
                className={`min-h-[90px] rounded-[8px] border border-dashed border-[#f59e0b]/50 bg-[#f59e0b]/[0.06] p-1.5 flex flex-col
                  ${isToday ? "ring-1 ring-[#f59e0b]/40" : ""}
                `}
              >
                <span className="text-[10px] font-bold text-[#f59e0b]/60 self-end leading-none">{dayNum}</span>
                <p className="text-[9px] text-[#f59e0b] font-medium flex-1 flex items-center justify-center text-center px-1 line-clamp-2">
                  {entry?.focus_keyword}
                </p>
                <span className="text-[9px] text-[#f59e0b]/60 text-center pb-0.5">current date</span>
              </div>
            );
          }

          // ── Scheduled cell (another keyword, not scheduling mode interaction) ──
          if (entry && !isOwnCurrentDate) {
            const kwData = entry.keywords as
              | { source_type?: string | null; volume?: number | null; kd?: number | null }
              | undefined;
            const volume = kwData?.volume;
            const kd_ = kdLabel(kwData?.kd);
            const isGenerated = entry.status === "generated" || entry.status === "downloaded";
            const isBlocked = !!schedulingKeywordId; // in scheduling mode → show dimmed

            if (isBlocked) {
              // Dimmed non-interactive card during scheduling mode
              return (
                <div
                  key={idx}
                  className={`min-h-[90px] rounded-[8px] border border-border-subtle/40 bg-surface-secondary/30 p-1.5 flex flex-col opacity-40
                    ${isToday ? "ring-1 ring-brand-action/20" : ""}
                  `}
                >
                  <span className="text-[10px] font-medium text-text-tertiary self-end leading-none">{dayNum}</span>
                  <p className="text-[9px] text-text-tertiary flex-1 flex items-center line-clamp-2 px-0.5">
                    {entry.focus_keyword}
                  </p>
                </div>
              );
            }

            // Normal scheduled card
            return (
              <div
                key={idx}
                className={`min-h-[90px] rounded-[8px] border p-2 flex flex-col gap-1 transition-all
                  ${isToday
                    ? "border-brand-action bg-brand-action/10"
                    : "border-brand-action/20 bg-brand-action/[0.06]"
                  }
                `}
              >
                <span className={`text-[10px] font-bold self-end leading-none ${isToday ? "text-brand-action" : "text-brand-action/60"}`}>
                  {dayNum}
                </span>
                <p className="text-[10px] font-semibold text-text-primary leading-tight line-clamp-2 flex-1" title={entry.focus_keyword}>
                  {entry.focus_keyword}
                </p>
                <div className="flex items-center gap-1 flex-wrap">
                  {volume != null && <span className="text-[9px] font-mono text-text-tertiary">{fmtVol(volume)}</span>}
                  {volume != null && kwData?.kd ? <span className="text-[9px] text-text-tertiary/50">·</span> : null}
                  {kwData?.kd ? <span className={`text-[9px] font-bold ${kd_.cls}`}>{kd_.text}</span> : null}
                </div>
                <ProjectNavLink
                  href={`/projects/${projectId}/blogs?entry=${entry.id}`}
                  className={`mt-auto w-full text-center text-[9px] font-bold uppercase tracking-wide rounded-[4px] py-1 transition-colors
                    ${isGenerated
                      ? "bg-[#10b981]/15 text-[#10b981] hover:bg-[#10b981]/25"
                      : "bg-brand-action/10 text-brand-action hover:bg-brand-action/20"
                    }
                  `}
                >
                  {isGenerated ? "View Blog" : "Generate →"}
                </ProjectNavLink>
              </div>
            );
          }

          // ── Pickable cell (free date in scheduling mode) ──────────
          if (isPickable) {
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onDatePick(iso)}
                className={`min-h-[90px] rounded-[8px] border border-dashed border-[#f59e0b]/40 bg-[#f59e0b]/[0.04]
                  hover:bg-[#f59e0b]/10 hover:border-[#f59e0b]/70 transition-all flex flex-col items-center justify-between px-1 py-1.5
                  ${isToday ? "ring-1 ring-[#f59e0b]/40" : ""}
                `}
              >
                <span className="text-[10px] font-bold text-[#f59e0b]/50 self-end leading-none">{dayNum}</span>
                <span className="text-[20px] text-[#f59e0b]/40 group-hover:text-[#f59e0b]">+</span>
                <span className="text-[9px] text-[#f59e0b]/60 font-medium">Pick</span>
              </button>
            );
          }

          // ── Empty / past / normal cell ────────────────────────────
          return (
            <div
              key={idx}
              className={`min-h-[90px] rounded-[8px] flex flex-col p-1.5
                ${isToday ? "ring-1 ring-brand-action/30 bg-brand-action/[0.03]" : ""}
                ${isPast ? "opacity-25" : ""}
                ${schedulingKeywordId && !isPast ? "opacity-20" : ""}
              `}
            >
              <span className={`text-[10px] font-medium self-end leading-none ${isToday ? "text-brand-action font-bold" : "text-text-tertiary"}`}>
                {dayNum}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Legend ─────────────────────────────────────────────────────── */}
      <div className="mt-4 pt-4 border-t border-border-subtle flex flex-wrap gap-4 text-[11px] text-text-tertiary">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[3px] bg-brand-action/10 border border-brand-action/20" />
          Scheduled
        </span>
        {schedulingKeywordId && (
          <>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-[3px] border border-dashed border-[#f59e0b]/50 bg-[#f59e0b]/[0.04]" />
              Click to schedule here
            </span>
            {schedulingKeywordCurrentDate && (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-[3px] border border-dashed border-[#f59e0b]/50 bg-[#f59e0b]/[0.06]" />
                Current date (pick a different one to move)
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
