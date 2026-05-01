import { Skeleton } from "@/components/Skeleton";

export default function OverviewLoading() {
  return (
    <div className="space-y-10 pb-16 pl-4 pr-4">
      {/* Header */}
      <div className="pt-4 pb-8 border-b border-border-subtle">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Skeleton className="h-6 w-28" rounded="full" />
          <Skeleton className="h-4 w-32" rounded="sm" />
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-4 w-16" rounded="sm" />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-3">
            <Skeleton className="h-[48px] w-80" rounded="lg" />
            <Skeleton className="h-4 w-48" rounded="sm" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-24" rounded="lg" />
            <Skeleton className="h-10 w-28" rounded="full" />
          </div>
        </div>
      </div>

      {/* Site explorer metrics */}
      <div className="space-y-3">
        <div className="flex items-end justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-36" rounded="sm" />
            <Skeleton className="h-3.5 w-48" rounded="sm" />
          </div>
          <Skeleton className="h-9 w-32" rounded="full" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="p-5 border-r last:border-r-0 border-border-subtle flex flex-col gap-2">
              <Skeleton className="h-3 w-24" rounded="sm" style={{ animationDelay: `${i * 80}ms` }} />
              <Skeleton className="h-7 w-20" rounded="md" style={{ animationDelay: `${i * 80 + 40}ms` }} />
              <Skeleton className="h-3 w-32" rounded="sm" style={{ animationDelay: `${i * 80 + 80}ms` }} />
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming content */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-48" rounded="lg" />
          <Skeleton className="h-4 w-16" rounded="sm" />
        </div>
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className={`flex items-center gap-5 p-5 ${i > 0 ? "border-t border-border-subtle" : ""}`}>
              <Skeleton className="h-12 w-12 shrink-0" rounded="lg" style={{ animationDelay: `${i * 60}ms` }} />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" rounded="sm" style={{ animationDelay: `${i * 60 + 30}ms` }} />
                <Skeleton className="h-3 w-1/3" rounded="sm" style={{ animationDelay: `${i * 60 + 60}ms` }} />
              </div>
              <Skeleton className="h-6 w-20 shrink-0" rounded="sm" style={{ animationDelay: `${i * 60 + 90}ms` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
