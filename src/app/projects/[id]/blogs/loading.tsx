import { Skeleton } from "@/components/Skeleton";

export default function BlogsLoading() {
  return (
    <div className="space-y-10 pb-16 pl-4 pr-4">
      {/* Header */}
      <div className="pt-4 pb-8 border-b border-border-subtle flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-[48px] w-64" rounded="lg" />
          <Skeleton className="h-4 w-80 max-w-full" rounded="sm" />
        </div>
        <Skeleton className="h-10 w-32" rounded="full" />
      </div>

      {/* Blog cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-[16px] border border-border-subtle bg-surface-elevated p-5 space-y-4" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4.5 w-3/4" rounded="sm" />
                <Skeleton className="h-3.5 w-full" rounded="sm" />
                <Skeleton className="h-3.5 w-2/3" rounded="sm" />
              </div>
              <Skeleton className="h-6 w-16 shrink-0" rounded="full" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Skeleton className="h-5 w-20" rounded="full" />
              <Skeleton className="h-5 w-16" rounded="full" />
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-border-subtle/50">
              <Skeleton className="h-3.5 w-24" rounded="sm" />
              <Skeleton className="h-8 w-24" rounded="full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
