"use client";

import type { CSSProperties } from "react";

type SkeletonProps = {
  /** Tailwind classes for sizing (e.g. "h-4 w-32"). */
  className?: string;
  /** Inline style — useful when width/height come from data. */
  style?: CSSProperties;
  /** "pulse" (default) or "wave". Wave is subtler for dense rows. */
  variant?: "pulse" | "wave";
  /** Optional rounded radius override. */
  rounded?: "sm" | "md" | "lg" | "xl" | "full";
};

const radiusClass: Record<NonNullable<SkeletonProps["rounded"]>, string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
};

/**
 * Premium loading placeholder used by every page-level Suspense boundary.
 * Uses a soft pulse against the elevated surface + a sliding violet-tinted
 * shimmer so the visual matches Rankit's AI-native theme in both light and
 * dark mode.
 */
export function Skeleton({
  className = "h-4 w-full",
  style,
  variant = "pulse",
  rounded = "md",
}: SkeletonProps) {
  const animation = variant === "wave" ? "animate-pulse" : "animate-pulse";
  return (
    <span
      aria-hidden
      className={`relative block overflow-hidden bg-surface-tertiary ${radiusClass[rounded]} ${animation} ${className}`}
      style={style}
    >
      <span className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_linear_infinite] bg-gradient-to-r from-transparent via-brand-violet/8 to-transparent" />
    </span>
  );
}

/** Convenience component for a multi-row table skeleton with an AI feel.
 *  Uses py-3 px-4 to match real table row padding so heights are identical. */
export function TableSkeleton({
  rows = 8,
  columns = 6,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="divide-y divide-border-subtle/50">
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid items-center gap-4 px-4 py-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, c) => (
            <div key={c} className={`flex ${c === 0 ? "justify-start" : "justify-center"}`}>
              <Skeleton
                className={c === 0 ? "h-4 w-3/4" : "h-3.5 w-1/2"}
                rounded={c === 0 ? "md" : "sm"}
                style={{ animationDelay: `${(r * 80) + (c * 40)}ms` }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Layout skeleton matching the keyword tables. */
export function KeywordTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated">
      <TableSkeleton rows={8} columns={9} />
    </div>
  );
}

/** Matches the exact height of the collapsed business-brief card. */
export function BusinessBriefSkeleton() {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-elevated p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Skeleton className="h-10 w-10 shrink-0" rounded="lg" />
          <div className="space-y-2 pt-0.5">
            <Skeleton className="h-3.5 w-48" rounded="sm" />
            <Skeleton className="h-4 w-80 max-w-full" rounded="sm" />
            <Skeleton className="h-4 w-60 max-w-full" rounded="sm" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24" rounded="full" />
          <Skeleton className="h-8 w-28" rounded="full" />
        </div>
      </div>
    </div>
  );
}

/** Card grid placeholder for projects/blogs grids. */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-card border border-border-subtle bg-surface-elevated p-5"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="flex items-start gap-4">
            <Skeleton className="h-12 w-12 shrink-0" rounded="lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" rounded="md" />
              <Skeleton className="h-3 w-1/2" rounded="sm" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
          <div className="mt-5 flex items-center gap-2">
            <Skeleton className="h-7 w-16" rounded="full" />
            <Skeleton className="h-7 w-20" rounded="full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stat strip skeleton — used while project stats are loading. */
export function StatStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle md:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2 bg-surface-elevated p-5">
          <Skeleton className="h-3 w-28" rounded="sm" style={{ animationDelay: `${i * 60}ms` }} />
          <Skeleton className="h-7 w-16" rounded="md" style={{ animationDelay: `${i * 60 + 40}ms` }} />
        </div>
      ))}
    </div>
  );
}
