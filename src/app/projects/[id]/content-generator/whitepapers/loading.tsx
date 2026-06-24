import { Skeleton, CardGridSkeleton } from "@/components/Skeleton";

export default function WhitepapersLoading() {
  return (
    <div className="space-y-4 pb-16 relative">
      <div className="sticky -top-6 lg:-top-8 z-40 bg-surface-primary/95 backdrop-blur-md -mx-6 lg:-mx-8 -mt-6 lg:-mt-8 px-10 lg:px-12 pt-6 lg:pt-8 pb-4 border-b border-border-subtle">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-8 w-40" rounded="lg" />
            <Skeleton className="h-4 w-72" rounded="full" />
          </div>
          <Skeleton className="h-10 w-36" rounded="full" />
        </div>
      </div>
      <div className="pt-2 px-4">
        <CardGridSkeleton count={6} />
      </div>
    </div>
  );
}
