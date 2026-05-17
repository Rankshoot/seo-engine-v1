"use client";

import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "violet" | "aqua";

const toneClass: Record<StatusTone, string> = {
  neutral: "border-border-subtle bg-surface-tertiary text-text-secondary",
  info: "border-status-info/30 bg-status-info/10 text-status-info",
  success: "border-status-success/30 bg-status-success/10 text-status-success",
  warning: "border-status-warning/30 bg-status-warning/12 text-status-warning",
  danger: "border-status-danger/30 bg-status-danger/10 text-status-danger",
  violet: "border-brand-violet/30 bg-brand-violet/10 text-brand-violet",
  aqua: "border-brand-aqua/30 bg-brand-aqua/12 text-brand-aqua",
};

export type StatusSize = "xs" | "sm" | "md";

const sizeClass: Record<StatusSize, string> = {
  xs: "h-5 px-1.5 text-[10.5px] gap-1",
  sm: "h-6 px-2 text-[11.5px] gap-1.5",
  md: "h-7 px-2.5 text-[12px] gap-1.5",
};

/**
 * Single canonical pill component used by every status surface (keyword
 * status, calendar progress, audit severity, AI source labels). Replaces
 * the ~10 ad-hoc badge inlines scattered across feature pages.
 */
export function StatusBadge({
  tone = "neutral",
  size = "sm",
  icon,
  children,
  className,
  rounded = "pill",
}: {
  tone?: StatusTone;
  size?: StatusSize;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  rounded?: "pill" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium border tabular-nums shrink-0",
        rounded === "pill" ? "rounded-full" : "rounded-md",
        sizeClass[size],
        toneClass[tone],
        className,
      )}
    >
      {icon && <span className="inline-flex shrink-0 [&>svg]:h-3 [&>svg]:w-3">{icon}</span>}
      <span className="truncate">{children}</span>
    </span>
  );
}
