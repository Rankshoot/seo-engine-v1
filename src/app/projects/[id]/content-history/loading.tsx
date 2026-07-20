import { PageHeader, Skeleton, TableSkeleton } from "@/components/common";

/**
 * Route-level fallback for Content History. Mirrors the real page 1:1 — the
 * static PageHeader (shown, never skeletoned) + the filter bar + a single
 * 6-column table skeleton in the exact position of the real table.
 */
export default function ContentHistoryLoading() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Content History"
        description="Track all generated content assets — blogs, ebooks, whitepapers, and social posts."
        actions={null}
      />

      <div className="flex-1 min-h-0 mt-6">
        <div className="flex h-full flex-col gap-4 pb-4">
          {/* Filter bar (static shapes) */}
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-9 w-[260px]" rounded="full" />
            <Skeleton className="h-9 w-28" rounded="full" />
          </div>
          {/* Table */}
          <div className="min-h-0 flex-1 overflow-hidden rounded-card border border-border-subtle bg-surface-elevated">
            <TableSkeleton rows={8} columns={6} />
          </div>
        </div>
      </div>
    </div>
  );
}
