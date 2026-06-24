"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon?: ReactNode;
  /** Optional SVG art rendered above the icon (replaces icon when provided). */
  illustration?: ReactNode;
  title: string;
  body?: ReactNode;
  /** Bullet list of contextual hints shown below the body. */
  hints?: string[];
  action?: ReactNode;
  secondaryAction?: ReactNode;
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
  illustration,
  title,
  body,
  hints,
  action,
  secondaryAction,
  variant = "page",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        variant === "page"
          ? "rounded-card border border-dashed border-border-strong bg-surface-secondary/60 py-20 px-6"
          : "rounded-lg bg-transparent py-12 px-4",
        className,
      )}
    >
      {illustration ? (
        <div className="mb-6 opacity-80">{illustration}</div>
      ) : icon ? (
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-xl border border-border-subtle bg-surface-elevated text-text-tertiary [&>svg]:h-7 [&>svg]:w-7">
          {icon}
        </div>
      ) : null}
      <h3 className="mb-2 text-[18px] sm:text-[20px] font-medium tracking-tight text-text-primary font-display">
        {title}
      </h3>
      {body ? (
        <p className="mb-4 text-[14px] text-text-tertiary max-w-sm leading-relaxed">
          {body}
        </p>
      ) : null}
      {hints && hints.length > 0 ? (
        <ul className="mb-6 space-y-1.5 text-left max-w-xs w-full">
          {hints.map((hint, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-text-tertiary leading-snug">
              <span className="mt-0.5 h-4 w-4 shrink-0 flex items-center justify-center rounded-full bg-surface-elevated border border-border-subtle text-[9px] font-bold text-text-tertiary tabular-nums">
                {i + 1}
              </span>
              {hint}
            </li>
          ))}
        </ul>
      ) : !body ? null : <div className="mb-6" />}
      {(action || secondaryAction) ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
