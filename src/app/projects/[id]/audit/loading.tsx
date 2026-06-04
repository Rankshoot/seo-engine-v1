export default function AuditLoading() {
  return (
    <div className="space-y-6 pb-20">
      <div className="space-y-3">
        <div className="h-8 w-48 rounded-lg bg-surface-elevated animate-pulse" />
        <div className="h-4 w-96 rounded-full bg-surface-elevated animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="space-y-2 rounded-card border border-border-subtle bg-surface-elevated p-4">
            <div className="h-3 w-20 rounded-full bg-surface-elevated animate-pulse" />
            <div className="h-7 w-16 rounded-md bg-surface-elevated animate-pulse" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-24 w-full rounded-card border border-border-subtle bg-surface-elevated animate-pulse" />
        ))}
      </div>
    </div>
  );
}
