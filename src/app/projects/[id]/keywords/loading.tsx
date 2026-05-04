import { Skeleton, BusinessBriefSkeleton, TableSkeleton } from "@/components/Skeleton";

export default function KeywordsLoading() {
  return (
    <div className="space-y-10 pb-16 pl-4 pr-4">
      {/* Header */}
      <div className="pt-4 pb-8 border-b border-border-subtle flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-[48px] w-72" rounded="lg" />
          <Skeleton className="h-4 w-96 max-w-full" rounded="sm" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-28" rounded="full" />
          <Skeleton className="h-10 w-36" rounded="full" />
        </div>
      </div>

      {/* Business brief */}
      <BusinessBriefSkeleton />

      {/* Filter pills — fixed widths (Tailwind cannot JIT dynamic class strings). */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-20" rounded="full" style={{ animationDelay: "0ms" }} />
        <Skeleton className="h-8 w-16" rounded="full" style={{ animationDelay: "60ms" }} />
        <Skeleton className="h-8 w-[4.5rem]" rounded="full" style={{ animationDelay: "120ms" }} />
        <Skeleton className="h-8 w-16" rounded="full" style={{ animationDelay: "180ms" }} />
        <Skeleton className="h-8 w-14" rounded="full" style={{ animationDelay: "240ms" }} />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-24" rounded="full" />
          <Skeleton className="h-8 w-20" rounded="full" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-[16px] border border-border-subtle bg-surface-elevated">
        <div
          className="border-b border-border-subtle bg-surface-secondary px-4 py-3 grid gap-4"
          style={{ gridTemplateColumns: "2rem 1fr 7rem 7rem 7rem 7rem 7rem" }}
        >
          <Skeleton className="h-3 w-4" rounded="sm" />
          <Skeleton className="h-3 w-[120px]" rounded="sm" />
          <Skeleton className="h-3 w-16" rounded="sm" />
          <Skeleton className="h-3 w-16" rounded="sm" />
          <Skeleton className="h-3 w-14" rounded="sm" />
          <Skeleton className="h-3 w-14" rounded="sm" />
          <Skeleton className="h-3 w-14" rounded="sm" />
        </div>
        <TableSkeleton rows={8} columns={7} />
      </div>
    </div>
  );
}
