import { Skeleton } from "@/components/common";

/**
 * Route-level fallback for the projects list. Mirrors `ProjectsClient`'s real
 * layout 1:1 — the centered max-w-[1320px] column, floating nav, greeting,
 * resume banner, search bar, and the xl:grid-cols-3 card grid — so the skeleton
 * lands exactly where the content renders (no full-width→centered jump).
 */
function ProjectCardSkeleton({ index = 0 }: { index?: number }) {
  const delay = `${index * 60}ms`;
  return (
    <div className="flex min-h-[200px] flex-col rounded-card border border-border-subtle bg-surface-elevated p-6">
      <div className="flex flex-1 gap-5">
        <Skeleton className="h-[48px] w-[48px] shrink-0" rounded="lg" style={{ animationDelay: delay }} />
        <div className="min-w-0 flex-1 space-y-2 pr-8">
          <Skeleton className="h-4 w-3/4" rounded="md" style={{ animationDelay: delay }} />
          <Skeleton className="h-3 w-2/5" rounded="sm" style={{ animationDelay: delay }} />
          <Skeleton className="mt-3 h-3 w-full" rounded="sm" style={{ animationDelay: delay }} />
          <Skeleton className="h-3 w-4/5" rounded="sm" style={{ animationDelay: delay }} />
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-border-subtle pt-4">
        <Skeleton className="h-3 w-24" rounded="sm" style={{ animationDelay: delay }} />
        <Skeleton className="h-3 w-28" rounded="sm" style={{ animationDelay: delay }} />
      </div>
    </div>
  );
}

export default function ProjectsLoading() {
  return (
    <div className="min-h-screen bg-surface-primary">
      {/* Floating nav */}
      <nav className="sticky top-0 z-40 flex justify-center px-4 pt-3 pb-1">
        <div className="flex w-full max-w-[1320px] items-center justify-between px-1 py-2">
          <Skeleton className="h-7 w-28" rounded="md" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9" rounded="full" />
            <Skeleton className="h-9 w-32" rounded="full" />
            <Skeleton className="h-9 w-9" rounded="full" />
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-[1320px] px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pt-10">
        {/* Greeting header */}
        <header className="mb-10">
          <Skeleton className="h-5 w-80 max-w-full" rounded="md" />
          <Skeleton className="mt-3 h-10 w-64" rounded="lg" />
        </header>

        {/* Resume banner */}
        <div className="mb-8 rounded-[20px] border border-border-subtle bg-surface-elevated px-7 py-6">
          <div className="flex items-center gap-5">
            <Skeleton className="h-12 w-12 shrink-0" rounded="xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-40" rounded="sm" />
              <Skeleton className="h-5 w-56 max-w-full" rounded="md" />
              <Skeleton className="h-3 w-64 max-w-full" rounded="sm" />
            </div>
            <Skeleton className="h-10 w-40 shrink-0" rounded="full" />
          </div>
        </div>

        {/* Filter bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-10 w-full max-w-[400px]" rounded="full" />
          <Skeleton className="h-4 w-16" rounded="full" />
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProjectCardSkeleton key={i} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
