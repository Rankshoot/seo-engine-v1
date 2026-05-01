import { Skeleton, TableSkeleton } from "@/components/Skeleton";

export default function CompetitorsLoading() {
  return (
    <div className="space-y-10 pb-16 pl-4 pr-4">
      {/* Header */}
      <div className="pt-4 pb-8 border-b border-border-subtle flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-[48px] w-80" rounded="lg" />
          <Skeleton className="h-4 w-72 max-w-full" rounded="sm" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-24" rounded="full" />
          <Skeleton className="h-10 w-36" rounded="full" />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="rounded-[16px] border border-border-subtle bg-surface-elevated p-5 flex flex-col gap-3">
            <Skeleton className="h-3 w-20" rounded="sm" style={{ animationDelay: `${i * 80}ms` }} />
            <Skeleton className="h-8 w-14" rounded="md" style={{ animationDelay: `${i * 80 + 40}ms` }} />
          </div>
        ))}
      </div>

      {/* Competitors table */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-52" rounded="lg" />
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated">
          <div className="border-b border-border-subtle bg-surface-secondary px-4 py-3 grid gap-4" style={{ gridTemplateColumns: "repeat(9, minmax(0, 1fr))" }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-3" rounded="sm" style={{ animationDelay: `${i * 40}ms` }} />
            ))}
          </div>
          <TableSkeleton rows={8} columns={9} />
        </div>
      </div>
    </div>
  );
}
