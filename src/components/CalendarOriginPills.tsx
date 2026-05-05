"use client";

import type { ResolvedCalendarOrigin } from "@/lib/calendar-keyword-origin";

export function CalendarOriginPills({
  resolved,
}: {
  resolved: ResolvedCalendarOrigin;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${resolved.badgeClass}`}
      >
        {resolved.label}
      </span>
      {resolved.aiBadge ? (
        <span
          className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${resolved.aiBadge.className}`}
        >
          {resolved.aiBadge.label}
        </span>
      ) : null}
    </div>
  );
}
