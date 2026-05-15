"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  /** "card" sits inside an existing card; "page" gets dashed border + big padding. */
  variant?: "page" | "card";
  className?: string;
}

/**
 * EmptyState — single source of truth for "no data" UI.
 * Replaces ad-hoc empty blocks across keywords/blogs/calendar/competitors.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  variant = "page",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        variant === "page"
          ? "rounded-card border border-dashed border-border-strong bg-surface-secondary/60 py-24 px-6"
          : "rounded-lg bg-transparent py-12 px-4",
        className,
      )}
    >
      {icon ? (
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-xl border border-border-subtle bg-surface-elevated text-text-tertiary [&>svg]:h-7 [&>svg]:w-7">
          {icon}
        </div>
      ) : null}
      <h3 className="mb-2 text-[18px] sm:text-[20px] font-medium tracking-tight text-text-primary font-display">
        {title}
      </h3>
      {body ? (
        <p className="mb-6 text-[14px] text-text-tertiary max-w-sm leading-relaxed">
          {body}
        </p>
      ) : null}
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
