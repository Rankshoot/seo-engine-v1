/**
 * Display labels for the content calendar: keyword scheduling + blog pipeline.
 * Distinct from keyword workspace actions (pending / approved / rejected on the Keywords page).
 */

export interface CalendarLifecycleDisplay {
  label: string;
  color: string;
  dot: string;
}

export function resolveCalendarLifecycleStatus(input: {
  /** True when a `calendar_entries` row exists for this keyword. */
  hasCalendarEntry: boolean;
  /** `calendar_entries.status` when present. */
  calendarStatus?: string | null;
}): CalendarLifecycleDisplay {
  if (!input.hasCalendarEntry) {
    return {
      label: "Not scheduled",
      color: "text-text-tertiary",
      dot: "bg-text-tertiary/50",
    };
  }

  const s = (input.calendarStatus ?? "scheduled").toLowerCase();

  switch (s) {
    case "scheduled":
      return {
        label: "Scheduled",
        color: "text-sky-400",
        dot: "bg-sky-400",
      };
    case "generating":
      return {
        label: "Generating…",
        color: "text-[#f59e0b]",
        dot: "bg-[#f59e0b] animate-pulse",
      };
    case "generated":
    case "downloaded":
      return {
        label: "Generated",
        color: "text-[#10b981]",
        dot: "bg-[#10b981]",
      };
    case "approved":
      return {
        label: "Approved",
        color: "text-brand-action",
        dot: "bg-brand-action",
      };
    case "published":
      return {
        label: "Published",
        color: "text-[#10b981]",
        dot: "bg-[#10b981]",
      };
    default:
      return {
        label: "Scheduled",
        color: "text-text-secondary",
        dot: "bg-text-tertiary",
      };
  }
}
