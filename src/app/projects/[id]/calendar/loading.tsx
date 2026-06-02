export default function CalendarLoading() {
  return (
    <div className="space-y-8 pb-20 max-w-full px-4 mx-auto">
      <div className="pt-4 pb-6 border-b border-border-subtle flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className="h-8 w-48 rounded-lg bg-surface-elevated animate-pulse" />
          <div className="h-4 w-80 rounded-full bg-surface-elevated animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-32 rounded-full bg-surface-elevated animate-pulse" />
          <div className="h-10 w-28 rounded-full bg-surface-elevated animate-pulse" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex gap-4">
          <div className="h-5 w-24 rounded-full bg-surface-elevated animate-pulse" />
          <div className="h-5 w-24 rounded-full bg-surface-elevated animate-pulse" />
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-elevated">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className={`flex gap-4 p-4 ${i > 1 ? 'border-t border-border-subtle' : ''}`}>
              <div className="h-12 w-12 shrink-0 rounded-lg bg-surface-elevated animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded-full bg-surface-elevated animate-pulse" />
                <div className="h-3 w-1/2 rounded-full bg-surface-elevated animate-pulse" />
              </div>
              <div className="h-6 w-20 shrink-0 rounded-full bg-surface-elevated animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
