"use client";

import { useState, useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
] as const;

const DAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string { return new Date().toISOString().split("T")[0]; }
function tomorrowISO(): string {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}
function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function fmtSelected(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

// ─── CalendarPanel (rendered via portal) ──────────────────────────────────────

interface PanelProps {
  panelRef: RefObject<HTMLDivElement | null>;
  initialDate: string;
  onConfirm: (d: string) => void;
  onCancel: () => void;
  minDate: string;
  scheduledDates: Set<string>;
  saving: boolean;
  position: { top: number; left: number };
}

function CalendarPanel({
  panelRef, initialDate, onConfirm, onCancel,
  minDate, scheduledDates, saving, position,
}: PanelProps) {
  const [selected, setSelected] = useState(initialDate);
  const [viewYear, setViewYear] = useState(() => parseInt(initialDate.split("-")[0]));
  const [viewMonth, setViewMonth] = useState(() => parseInt(initialDate.split("-")[1]) - 1);
  const [mode, setMode] = useState<"calendar" | "year">("calendar");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const today = todayISO();

  // Build day cells for current view
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const thisYear = new Date().getFullYear();
  const yearRange = Array.from({ length: 8 }, (_, i) => thisYear + i);

  const hasScheduledInView = Array.from(scheduledDates).some(d => {
    const [y, m] = d.split("-").map(Number);
    return y === viewYear && m - 1 === viewMonth;
  });

  return (
    <div
      ref={panelRef}
      className={[
        "fixed z-100 rounded-[14px] border border-border-subtle bg-surface-elevated shadow-2xl",
        "transition-[opacity,transform] duration-150 ease-out origin-top-right overflow-hidden",
        visible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 -translate-y-1.5",
      ].join(" ")}
      style={{ top: position.top, left: position.left, width: 272 }}
    >
      {mode === "year" ? (
        /* ── Year selector ──────────────────────────────────────────────── */
        <div className="p-4">
          <div className="flex items-center justify-between mb-3.5">
            <p className="text-[12px] font-semibold text-text-primary">Select Year</p>
            <button
              type="button"
              onClick={() => setMode("calendar")}
              className="text-[11px] font-medium text-text-tertiary hover:text-text-primary transition-colors"
            >
              ← Back
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {yearRange.map(y => (
              <button
                key={y}
                type="button"
                onClick={() => { setViewYear(y); setMode("calendar"); }}
                className={[
                  "h-9 rounded-[8px] text-[12px] font-medium transition-colors",
                  y === viewYear
                    ? "bg-brand-action text-white font-semibold"
                    : "text-text-secondary hover:bg-surface-hover",
                ].join(" ")}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* ── Month/year header ──────────────────────────────────────── */}
          <div className="flex items-center gap-1 px-3.5 py-3 border-b border-border-subtle">
            <button
              type="button"
              onClick={prevMonth}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-text-tertiary hover:bg-surface-hover hover:text-text-primary transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m15 19-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setMode("year")}
              className="flex-1 py-0.5 rounded-[6px] text-center text-[13px] font-semibold text-text-primary hover:text-brand-action hover:bg-surface-hover transition-colors"
            >
              {MONTH_NAMES[viewMonth]} {viewYear}
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-text-tertiary hover:bg-surface-hover hover:text-text-primary transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* ── Weekday labels ─────────────────────────────────────────── */}
          <div className="grid grid-cols-7 px-2.5 pt-2.5 pb-1">
            {DAY_LABELS.map(d => (
              <div key={d} className="flex items-center justify-center text-[9px] font-bold uppercase tracking-wider text-text-tertiary pb-1">
                {d}
              </div>
            ))}
          </div>

          {/* ── Day grid ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-7 gap-y-0.5 px-2 pb-2">
            {cells.map((day, i) => {
              if (day === null) return <div key={`empty-${i}`} className="h-8" />;

              const dateStr = toISO(viewYear, viewMonth, day);
              const isSel    = dateStr === selected;
              const isToday  = dateStr === today;
              const isDisabled = dateStr < minDate;
              const isSched  = scheduledDates.has(dateStr) && !isSel;

              return (
                <button
                  key={day}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => setSelected(dateStr)}
                  className={[
                    "relative flex flex-col items-center justify-center h-8 w-full rounded-[7px] text-[12px] font-medium transition-all",
                    isDisabled ? "opacity-20 cursor-not-allowed text-text-tertiary" : "cursor-pointer",
                    isSel ? "bg-brand-action text-white font-semibold" : "",
                    isToday && !isSel ? "ring-1 ring-brand-action/50 text-brand-action" : "",
                    !isSel && !isDisabled ? "hover:bg-surface-hover text-text-primary" : "",
                  ].join(" ")}
                >
                  <span className="leading-none">{day}</span>
                  {isSched && (
                    <span
                      className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-action/50"
                    />
                  )}
                  {isSel && scheduledDates.has(dateStr) && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/60" />
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Footer: legend + selected preview + actions ────────────── */}
          <div className="border-t border-border-subtle px-3.5 py-3 space-y-3">
            {/* Legend */}
            {hasScheduledInView && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-action/50" />
                <span className="text-[10px] text-text-tertiary">Dot = date already scheduled</span>
              </div>
            )}

            {/* Selected date preview */}
            {selected >= minDate && (
              <p className="text-[11px] text-text-tertiary leading-snug">
                Scheduling for{" "}
                <span className="font-semibold text-text-secondary">{fmtSelected(selected)}</span>
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="flex-1 h-9 rounded-[8px] border border-border-subtle text-[12px] font-medium text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onConfirm(selected)}
                disabled={saving || !selected || selected < minDate}
                className="flex-1 h-9 rounded-[8px] bg-brand-action text-[12px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {saving ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving…
                  </>
                ) : "Schedule"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export interface CalendarDatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDate?: string | null;
  onConfirm: (date: string) => void;
  saving: boolean;
  scheduledDates?: Set<string>;
  variant?: "pick" | "change";
  /** Renders as a small pencil icon instead of a full pill button */
  iconOnly?: boolean;
}

export function CalendarDatePicker({
  open,
  onOpenChange,
  currentDate,
  onConfirm,
  saving,
  scheduledDates = new Set<string>(),
  variant = "pick",
  iconOnly = false,
}: CalendarDatePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef   = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const [mounted, setMounted]   = useState(false);

  useEffect(() => setMounted(true), []);

  // Compute smart position when opening
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const calW  = 272;
    const calH  = 400; // conservative estimate
    let left = rect.right - calW;
    let top  = rect.bottom + 6;
    // Keep within horizontal bounds
    if (left < 8) left = 8;
    if (left + calW > window.innerWidth - 8) left = window.innerWidth - calW - 8;
    // Flip upward if not enough room below
    if (top + calH > window.innerHeight - 8) top = rect.top - calH - 6;
    setPanelPos({ top, left });
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onOpenChange]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  // Close on scroll (prevents stale position)
  useEffect(() => {
    if (!open) return;
    const handler = () => onOpenChange(false);
    window.addEventListener("scroll", handler, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", handler, true);
  }, [open, onOpenChange]);

  const minDate     = tomorrowISO();
  const initialDate = currentDate && currentDate >= minDate ? currentDate : minDate;

  return (
    <>
      {iconOnly ? (
        /* ── Icon-only pencil trigger ────────────────────────────────── */
        <button
          ref={triggerRef}
          type="button"
          disabled={saving}
          onClick={() => onOpenChange(!open)}
          className={[
            "flex h-6 w-6 items-center justify-center rounded-[5px] transition-colors disabled:opacity-50",
            open
              ? "text-brand-action bg-brand-action/10"
              : "text-text-tertiary hover:text-text-primary hover:bg-surface-hover",
          ].join(" ")}
          title="Change date"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
          </svg>
        </button>
      ) : (
        /* ── Full pill trigger ───────────────────────────────────────── */
        <button
          ref={triggerRef}
          type="button"
          disabled={saving}
          onClick={() => onOpenChange(!open)}
          className={[
            "inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-[11px] font-semibold transition-colors disabled:opacity-50",
            open
              ? "border-brand-action/40 bg-brand-action/10 text-brand-action"
              : variant === "change"
                ? "border-border-subtle bg-surface-elevated text-text-secondary hover:border-[#f59e0b]/40 hover:text-[#f59e0b] hover:bg-[#f59e0b]/5"
                : "border-border-subtle bg-surface-elevated text-text-secondary hover:border-brand-action/40 hover:text-brand-action hover:bg-brand-action/5",
          ].join(" ")}
        >
          {variant === "change" ? (
            <>
              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              {open ? "Close" : "Change date"}
            </>
          ) : (
            <>
              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
                <line x1="12" x2="12" y1="15" y2="18" />
                <line x1="10.5" x2="13.5" y1="16.5" y2="16.5" />
              </svg>
              {open ? "Close" : "Pick date"}
            </>
          )}
        </button>
      )}

      {mounted && open && createPortal(
        <CalendarPanel
          panelRef={panelRef}
          initialDate={initialDate}
          onConfirm={(d) => { onConfirm(d); onOpenChange(false); }}
          onCancel={() => onOpenChange(false)}
          minDate={minDate}
          scheduledDates={scheduledDates}
          saving={saving}
          position={panelPos}
        />,
        document.body,
      )}
    </>
  );
}
