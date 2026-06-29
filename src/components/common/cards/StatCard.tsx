"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  valueClassName?: string;
  className?: string;
  /** Subtle color tint applied to the value — useful for severity/health stats. */
  tone?: "default" | "positive" | "warning" | "critical" | "info";
}

const toneClass: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-text-primary",
  positive: "text-status-success",
  warning: "text-status-warning",
  critical: "text-status-danger",
  info: "text-status-info",
};

/**
 * StatCard — single KPI tile. Drop-in replacement for the ad-hoc `StatTile`
 * defined in audit/_shared/ch-ui.tsx, with optional tone presets for severity.
 */
export function StatCard({
  label,
  value,
  sub,
  icon,
  valueClassName,
  className,
  tone = "default",
}: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-elevated p-5",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">
          {label}
        </p>
        {icon ? (
          <span className="text-text-tertiary/50 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        ) : null}
      </div>
      <p
        className={cn(
          "font-mono text-[30px] font-bold tabular-nums leading-none",
          toneClass[tone],
          valueClassName,
        )}
      >
        {value}
      </p>
      {sub ? <p className="text-[12px] text-text-tertiary">{sub}</p> : null}
    </div>
  );
}
