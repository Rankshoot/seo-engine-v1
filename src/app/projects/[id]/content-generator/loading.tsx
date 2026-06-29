import { Skeleton } from "@/components/Skeleton";

export default function ContentGeneratorLoading() {
  return (
    <div className="space-y-4 pb-16 relative">
      <div className="sticky -top-6 lg:-top-8 z-40 bg-surface-primary/95 backdrop-blur-md -mx-6 lg:-mx-8 -mt-6 lg:-mt-8 px-10 lg:px-12 pt-6 lg:pt-8 pb-4 border-b border-border-subtle">
        <div className="min-w-0 space-y-3">
          <Skeleton className="h-8 w-52" rounded="lg" />
          <Skeleton className="h-4 w-96" rounded="full" />
        </div>
      </div>
      <div className="pt-2 px-4">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-card border border-border-subtle bg-surface-elevated p-6 space-y-4"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <Skeleton className="h-12 w-12" rounded="lg" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" rounded="md" />
                <Skeleton className="h-3.5 w-full" rounded="sm" />
                <Skeleton className="h-3.5 w-4/5" rounded="sm" />
              </div>
              <Skeleton className="h-9 w-full" rounded="full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
