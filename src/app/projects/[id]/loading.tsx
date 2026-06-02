export default function ProjectLoading() {
  return (
    <div className="space-y-10 pb-20 pl-4 pr-4">
      <div className="pt-4 pb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="h-4 w-16 rounded-full bg-surface-elevated animate-pulse" />
          <div className="h-3 w-3 rounded-full bg-surface-elevated animate-pulse" />
          <div className="h-4 w-32 rounded-full bg-surface-elevated animate-pulse" />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-3">
            <div className="h-[44px] w-72 rounded-lg bg-surface-elevated animate-pulse" />
            <div className="h-4 w-60 rounded-full bg-surface-elevated animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-28 rounded-full bg-surface-elevated animate-pulse" />
            <div className="h-9 w-32 rounded-full bg-surface-elevated animate-pulse" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px rounded-card border border-border-subtle bg-border-subtle md:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="space-y-2 bg-surface-elevated p-5">
            <div className="h-3 w-28 rounded-full bg-surface-elevated animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
            <div className="h-7 w-16 rounded-md bg-surface-elevated animate-pulse" style={{ animationDelay: `${i * 60 + 40}ms` }} />
          </div>
        ))}
      </div>
      <div className="h-32 w-full rounded-lg bg-surface-elevated animate-pulse" />
      <div className="h-40 w-full rounded-lg bg-surface-elevated animate-pulse" />
    </div>
  );
}
