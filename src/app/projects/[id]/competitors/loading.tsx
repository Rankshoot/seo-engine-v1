import { TableSkeleton } from "@/components/Skeleton";

export default function CompetitorsLoading() {
  return (
    <div className="space-y-4 pb-16 relative">
      <div className="sticky -top-6 lg:-top-8 z-40 bg-surface-primary/95 backdrop-blur-md -mx-6 lg:-mx-8 -mt-6 lg:-mt-8 px-10 lg:px-12 pt-6 lg:pt-8 pb-4 border-b border-border-subtle">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-8 w-48 rounded-lg bg-surface-elevated animate-pulse" />
            <div className="h-4 w-80 rounded-full bg-surface-elevated animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-36 rounded-full bg-surface-elevated animate-pulse" />
          </div>
        </div>
      </div>
      <div className="space-y-4 pt-2 px-4">
        <div className="rounded-card border border-border-subtle bg-surface-elevated overflow-hidden">
          <div className="grid items-center gap-4 px-4 py-3 border-b border-border-subtle"
            style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-3 rounded-sm bg-surface-tertiary animate-pulse" />
            ))}
          </div>
          <TableSkeleton rows={8} columns={6} />
        </div>
      </div>
    </div>
  );
}
