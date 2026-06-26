"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone =
  | "neutral"
  | "info"
  | "positive"
  | "warning"
  | "critical"
  | "accent"
  | "muted";

export type BadgeSize = "xs" | "sm" | "md";
export type BadgeShape = "pill" | "rounded";

const toneClass: Record<BadgeTone, string> = {
  neutral:
    "border-border-subtle bg-surface-elevated text-text-secondary",
  muted: "border-border-subtle bg-surface-tertiary text-text-tertiary",
  info: "border-status-info/30 bg-status-info/10 text-status-info",
  positive: "border-status-success/30 bg-status-success/10 text-status-success",
  warning: "border-status-warning/30 bg-status-warning/10 text-status-warning",
  critical: "border-status-danger/30 bg-status-danger/10 text-status-danger",
  accent: "border-brand-action/40 bg-brand-action/10 text-brand-action",
};

const sizeClass: Record<BadgeSize, string> = {
  xs: "px-1.5 py-0.5 text-[10px] gap-1",
  sm: "px-2 py-0.5 text-[11px] gap-1",
  md: "px-2.5 py-1 text-[12px] gap-1.5",
};

export interface BadgeProps {
  tone?: BadgeTone;
  size?: BadgeSize;
  shape?: BadgeShape;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  /** Optional bold uppercase eyebrow look used for severity chips. */
  emphasis?: boolean;
}

export function Badge({
  tone = "neutral",
  size = "sm",
  shape = "pill",
  icon,
  emphasis = false,
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center border font-semibold whitespace-nowrap",
        shape === "pill" ? "rounded-full" : "rounded-sm",
        emphasis && "uppercase tracking-wide font-bold",
        toneClass[tone],
        sizeClass[size],
        className,
      )}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      {children}
    </span>
  );
}

/** Coloured dot badge — for severity-style chips with a leading bullet. */
export function DotBadge({
  tone = "neutral",
  size = "sm",
  emphasis = true,
  children,
  className,
}: Omit<BadgeProps, "icon" | "shape">) {
  const dotColor: Record<BadgeTone, string> = {
    neutral: "bg-text-tertiary",
    muted: "bg-text-tertiary",
    info: "bg-status-info",
    positive: "bg-status-success",
    warning: "bg-status-warning",
    critical: "bg-status-danger",
    accent: "bg-brand-action",
  };
  return (
    <Badge
      tone={tone}
      size={size}
      emphasis={emphasis}
      className={className}
      icon={<span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotColor[tone])} />}
    >
      {children}
    </Badge>
  );
}
