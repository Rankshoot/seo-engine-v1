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
 * Solid-color, gradient-free loading placeholder. Used by the keywords,
 * competitors and blogs lists while data is in flight. Animation is a single
 * `animate-pulse` so it doesn't fight the page-level transitions.
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
      className={`block bg-surface-elevated ${radiusClass[rounded]} ${animation} ${className}`}
      style={style}
    />
  );
}

/** Convenience component for a multi-row table skeleton. */
export function TableSkeleton({
  rows = 8,
  columns = 6,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="divide-y divide-border-subtle">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid items-center gap-3 px-3 py-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton
              key={c}
              className={c === 0 ? "h-4 w-3/4" : "h-3 w-1/2"}
              rounded={c === 0 ? "md" : "sm"}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Card grid placeholder for projects/blogs grids. */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-border-subtle bg-surface-base p-5"
        >
          <Skeleton className="mb-3 h-5 w-3/4" rounded="lg" />
          <Skeleton className="mb-2 h-3 w-full" />
          <Skeleton className="mb-4 h-3 w-5/6" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-16" rounded="full" />
            <Skeleton className="h-7 w-20" rounded="full" />
          </div>
        </div>
      ))}
    </div>
  );
}
