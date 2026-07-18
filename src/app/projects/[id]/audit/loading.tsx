import { PageHeader, Skeleton, ListRowsSkeleton } from "@/components/common";

/**
 * Route-level fallback for the Content Audit Studio. Mirrors the real page — the
 * static PageHeader (shown, never skeletoned) + the centered max-w-5xl column
 * with the audit input card and a single history-list skeleton — so navigating
 * in lands the skeleton exactly where the content renders.
 */
export default function AuditLoading() {
  return (
    <div className="relative space-y-10 pb-20">
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <span>Content Audit Studio</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-brand-violet/15 text-brand-violet border border-brand-violet/20 tracking-normal uppercase">
              Beta
            </span>
          </div>
        }
        description="Audit any blog by URL or uploaded content — SEO, GEO, AEO scores, competitor insights, and one-click enhanced regeneration."
        actions={null}
        className="[&_h1]:text-[28px] [&_h1]:sm:text-[34px]"
      />

      <div className="mx-auto max-w-5xl space-y-12">
        {/* Input card (static shell) */}
        <div className="mx-auto w-full max-w-3xl rounded-[24px] border border-brand-violet/20 bg-gradient-to-b from-surface-elevated to-surface-elevated/60 p-8 sm:p-10">
          <div className="flex flex-col items-center text-center">
            <Skeleton className="mb-4 h-6 w-80 max-w-full" rounded="md" />
            <div className="flex w-full max-w-2xl gap-3">
              <Skeleton className="h-12 flex-1" rounded="lg" />
              <Skeleton className="h-12 w-40 shrink-0" rounded="lg" />
            </div>
          </div>
        </div>

        {/* Audit history */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" rounded="md" />
          <ListRowsSkeleton rows={4} />
        </div>
      </div>
    </div>
  );
}
