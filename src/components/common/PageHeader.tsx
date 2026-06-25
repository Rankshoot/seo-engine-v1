"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode | null;
  borderless?: boolean;
  className?: string;
  compact?: boolean;
  /** Set to false to opt out of sticky positioning (e.g. when a parent handles it). */
  sticky?: boolean;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  borderless,
  compact,
  sticky = true,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "shrink-0 bg-surface-primary/98 backdrop-blur-md pb-4 sm:pb-5",
        sticky && "sticky -top-4 sm:-top-6 lg:-top-8 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 -mt-4 sm:-mt-6 lg:-mt-8 pt-4 sm:pt-6 lg:pt-8",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className={compact ? "mb-2" : "mb-3"}>
              <span className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-secondary px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-action" />
                {eyebrow}
              </span>
            </div>
          )}
          <h1
            className={cn(
              "font-semibold tracking-tight text-text-primary leading-none",
              compact ? "text-[19px] sm:text-[22px]" : "text-[21px] sm:text-[26px]",
            )}
          >
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 text-[13px] text-text-tertiary max-w-[540px] leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">{actions}</div>
        )}
      </div>
      {!borderless && (
        <>
          <div className="mt-4 h-px bg-gradient-to-r from-transparent via-border-subtle to-transparent" />
          <div className="h-px bg-gradient-to-r from-transparent via-brand-action/20 to-transparent" />
        </>
      )}
    </div>
  );
}
