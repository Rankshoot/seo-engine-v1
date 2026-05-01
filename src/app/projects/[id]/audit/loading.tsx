import { Skeleton } from "@/components/Skeleton";

export default function AuditLoading() {
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="rounded-[16px] border border-border-subtle bg-surface-elevated p-5 flex flex-col gap-3">
            <Skeleton className="h-3 w-20" rounded="sm" style={{ animationDelay: `${i * 80}ms` }} />
            <Skeleton className="h-8 w-12" rounded="md" style={{ animationDelay: `${i * 80 + 40}ms` }} />
            <Skeleton className="h-3 w-28" rounded="sm" style={{ animationDelay: `${i * 80 + 80}ms` }} />
          </div>
        ))}
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {[60, 52, 72, 56, 64].map((w, i) => (
          <Skeleton key={i} className="h-8" style={{ width: w, animationDelay: `${i * 50}ms` }} rounded="full" />
        ))}
      </div>

      {/* Audit card rows */}
      <div className="space-y-3">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} className="rounded-[16px] border border-border-subtle bg-surface-elevated p-5 space-y-3" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-2/3" rounded="sm" />
                <Skeleton className="h-3 w-1/2" rounded="sm" />
              </div>
              <Skeleton className="h-6 w-20 shrink-0" rounded="full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16" rounded="full" />
              <Skeleton className="h-5 w-20" rounded="full" />
              <Skeleton className="h-5 w-14" rounded="full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
