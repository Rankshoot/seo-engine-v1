import { Skeleton } from "@/components/Skeleton";

function FormSectionSkeleton() {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-elevated p-6 space-y-5">
      <div className="space-y-1.5">
        <Skeleton className="h-5 w-40" rounded="md" />
        <Skeleton className="h-3.5 w-72" rounded="sm" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3.5 w-24" rounded="sm" />
            <Skeleton className="h-10 w-full" rounded="md" />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-9 w-28" rounded="full" />
      </div>
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <div className="space-y-4 pb-16 relative">
      <div className="sticky -top-6 lg:-top-8 z-40 bg-surface-primary/95 backdrop-blur-md -mx-6 lg:-mx-8 -mt-6 lg:-mt-8 px-10 lg:px-12 pt-6 lg:pt-8 pb-4 border-b border-border-subtle">
        <div className="min-w-0 space-y-3">
          <Skeleton className="h-8 w-36" rounded="lg" />
          <Skeleton className="h-4 w-64" rounded="full" />
        </div>
      </div>
      <div className="space-y-4 pt-2 px-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <FormSectionSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
