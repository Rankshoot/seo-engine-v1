import { Skeleton, TableSkeleton } from "@/components/Skeleton";

export default function KeywordsLoading() {
  return (
    <div className="space-y-4 pb-16 pl-4 pr-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-16" rounded="full" style={{ animationDelay: "0ms" }} />
          <Skeleton className="h-8 w-20" rounded="full" style={{ animationDelay: "60ms" }} />
          <Skeleton className="h-8 w-[4.5rem]" rounded="full" style={{ animationDelay: "120ms" }} />
          <Skeleton className="h-8 w-16" rounded="full" style={{ animationDelay: "180ms" }} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-28" rounded="full" />
          <Skeleton className="h-9 w-24" rounded="full" />
          <Skeleton className="h-9 w-24" rounded="full" />
          <Skeleton className="h-8 w-24" rounded="full" />
          <Skeleton className="h-8 w-28" rounded="full" />
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated">
        <TableSkeleton rows={10} columns={7} />
      </div>
    </div>
  );
}
