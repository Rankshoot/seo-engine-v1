"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/common/empty-states/EmptyState";

/**
 * DataRegion — the single primitive that governs the *dynamic* area of a page.
 *
 * The rule it enforces (see the UI/UX brief):
 *   • Static chrome (headers, tabs, search, filters, buttons) lives OUTSIDE this
 *     component and renders immediately — it is never replaced by a skeleton.
 *   • Only the data-bearing region swaps a single, position-matched skeleton for
 *     the real content. The skeleton you pass MUST mirror the loaded layout
 *     (same grid, padding, row height) so there is zero content jump.
 *
 * Stale-while-revalidate comes for free: pass react-query's `isLoading`
 * (true only on the first load with no cache) — NOT `isFetching`. Revisiting a
 * page with cached data renders content instantly and never flashes a skeleton.
 *
 *   <DataRegion loading={q.isLoading} error={q.error} isEmpty={rows.length === 0}
 *     skeleton={<RowsSkeleton rows={8} />}
 *     empty={<EmptyState title="No keywords yet" ... />}
 *     onRetry={q.refetch}
 *   >
 *     <Rows data={rows} />
 *   </DataRegion>
 */
export interface DataRegionProps {
  /** First-load only (no cached data). Use react-query `isLoading`, not `isFetching`. */
  loading: boolean;
  /** Truthy → render the error state (with retry if `onRetry` is given). */
  error?: unknown;
  /** Loaded successfully but no rows → render `empty`. */
  isEmpty?: boolean;
  /** Position-matched skeleton. Mirror the loaded layout exactly. */
  skeleton: ReactNode;
  /** Rendered when `isEmpty`. Defaults to a generic EmptyState. */
  empty?: ReactNode;
  /** Retry handler surfaced by the default error state. */
  onRetry?: () => void;
  /** Copy for the default error state. */
  errorTitle?: string;
  children: ReactNode;
  className?: string;
}

export function DataRegion({
  loading,
  error,
  isEmpty,
  skeleton,
  empty,
  onRetry,
  errorTitle = "Couldn't load this",
  children,
  className,
}: DataRegionProps) {
  if (loading) {
    return (
      <div className={cn("animate-[fade-in_180ms_ease-out]", className)} aria-busy>
        {skeleton}
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <EmptyState
          variant="card"
          title={errorTitle}
          body={error instanceof Error ? error.message : "Something went wrong while loading this data."}
          action={
            onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-surface-elevated px-4 py-1.5 text-[12.5px] font-medium text-text-primary transition-colors hover:border-brand-violet/40 hover:text-brand-violet"
              >
                Try again
              </button>
            ) : null
          }
        />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className={cn("animate-[fade-in_180ms_ease-out]", className)}>
        {empty ?? <EmptyState variant="card" title="Nothing here yet" />}
      </div>
    );
  }

  return <div className={cn("animate-[fade-in_180ms_ease-out]", className)}>{children}</div>;
}
