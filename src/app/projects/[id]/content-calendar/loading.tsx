import { PageHeader, Skeleton, TableSkeleton } from "@/components/common";

/**
 * Route-level fallback for the Content Calendar. Previously missing — so
 * navigating here fell back to the project-overview skeleton (a total mismatch).
 * This mirrors `ScheduledCalendar` 1:1: static PageHeader + the stats/view-toggle
 * row + one bordered table skeleton in the exact position of the real calendar.
 */
export default function ContentCalendarLoading() {
  return (
    <div className="mx-auto max-w-full space-y-8 px-4 pb-20">
      <PageHeader
        title="Content Calendar"
        description="Schedule approved keywords to publish dates and track asset generation."
        actions={
          <>
            <Skeleton className="h-9 w-40" rounded="full" />
            <Skeleton className="h-9 w-32" rounded="full" />
          </>
        }
      />

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Stats legend (dynamic → skeleton) */}
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-4 w-24" rounded="full" />
            <Skeleton className="h-4 w-24" rounded="full" />
            <Skeleton className="h-4 w-32" rounded="full" />
          </div>
          {/* View toggle (static labels, not skeletoned) */}
          <div className="inline-flex rounded-full border border-border-subtle bg-surface-secondary/70 p-0.5">
            <span className="rounded-full bg-surface-elevated px-4 py-1.5 text-[12px] font-semibold text-text-primary shadow-sm">
              List
            </span>
            <span className="rounded-full px-4 py-1.5 text-[12px] font-semibold text-text-tertiary">
              Grid
            </span>
          </div>
        </div>

        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated">
          <TableSkeleton rows={6} columns={8} />
        </div>
      </section>
    </div>
  );
}
