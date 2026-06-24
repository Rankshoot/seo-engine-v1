"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  borderless?: boolean;
  className?: string;
  compact?: boolean;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  borderless,
  compact,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("shrink-0 bg-surface-primary/95 backdrop-blur-md", className)}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
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
              compact ? "text-[22px] sm:text-[26px]" : "text-[26px] sm:text-[30px]",
            )}
          >
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-[13px] text-text-tertiary max-w-[540px] leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-3 shrink-0 pb-1">{actions}</div>
        )}
      </div>
      {!borderless && (
        <>
          <div className="mt-5 h-px bg-gradient-to-r from-transparent via-border-subtle to-transparent" />
          <div className="h-px bg-gradient-to-r from-transparent via-brand-action/20 to-transparent" />
        </>
      )}
    </div>
  );
}
