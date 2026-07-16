import { Skeleton, StatStripSkeleton, ListRowsSkeleton } from "@/components/common";

/**
 * Route-level fallback for the project overview. It mirrors the real page's
 * chrome and region layout 1:1 (same container, header, stat strip, brief card,
 * today's-content list) so navigating in produces zero position jump — the
 * skeleton lands exactly where the content will render.
 */
export default function ProjectOverviewLoading() {
  return (
    <div className="pb-20">
      {/* Header chrome */}
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-1.5">
          <Skeleton className="h-3 w-14" rounded="full" />
          <Skeleton className="h-3 w-3" rounded="full" />
          <Skeleton className="h-3 w-32" rounded="full" />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <Skeleton className="h-7 w-56" rounded="lg" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" rounded="full" />
            <Skeleton className="h-9 w-32" rounded="full" />
          </div>
        </div>
        <div className="mt-4 h-px bg-gradient-to-r from-transparent via-border-subtle to-transparent" />
      </div>

      <div className="space-y-6">
        {/* Stat strip */}
        <StatStripSkeleton count={4} />

        {/* AI daily brief card */}
        <div className="rounded-xl border border-border-subtle bg-surface-elevated p-5">
          <div className="flex items-start gap-4">
            <Skeleton className="h-10 w-10 shrink-0" rounded="xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-24" rounded="sm" />
              <Skeleton className="h-4 w-72 max-w-full" rounded="sm" />
              <Skeleton className="h-3.5 w-96 max-w-full" rounded="sm" />
            </div>
            <Skeleton className="h-9 w-32 shrink-0" rounded="full" />
          </div>
        </div>

        {/* Today's content */}
        <div>
          <Skeleton className="mb-3 h-4 w-40" rounded="md" />
          <ListRowsSkeleton rows={2} />
        </div>
      </div>
    </div>
  );
}
