import type { QuotaItem } from "@/services/quota";

interface UsageBarProps {
  label: string;
  item: QuotaItem;
  icon?: React.ReactNode;
  /** If true, a 0-limit means "unlimited" rather than "blocked" */
  zeroMeansUnlimited?: boolean;
  className?: string;
}

function getBarColor(item: QuotaItem, zeroMeansUnlimited?: boolean): {
  bar: string;
  text: string;
  badge: string;
} {
  if (item.effectiveLimit === 0) {
    if (zeroMeansUnlimited) return { bar: "bg-brand-action", text: "text-brand-action", badge: "bg-brand-action/10 text-brand-action border-brand-action/20" };
    return { bar: "bg-text-tertiary/30", text: "text-text-tertiary", badge: "bg-surface-tertiary text-text-tertiary border-border-subtle" };
  }
  const pct = item.used / item.effectiveLimit;
  if (pct >= 1) return { bar: "bg-red-500", text: "text-red-400", badge: "bg-red-500/10 text-red-400 border-red-500/20" };
  if (pct >= 0.85) return { bar: "bg-amber-400", text: "text-amber-400", badge: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
  return { bar: "bg-emerald-500", text: "text-emerald-400", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
}

export function UsageBar({ label, item, icon, zeroMeansUnlimited, className = "" }: UsageBarProps) {
  const colors = getBarColor(item, zeroMeansUnlimited);
  const isUnlimited = item.effectiveLimit === 0 && zeroMeansUnlimited;
  const isBlocked = item.effectiveLimit === 0 && !zeroMeansUnlimited;
  const pct = item.effectiveLimit > 0 ? Math.min(1, item.used / item.effectiveLimit) : (isUnlimited ? 0 : 1);

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {icon && <span className="text-text-tertiary">{icon}</span>}
          <span className="text-[12px] font-medium text-text-secondary">{label}</span>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${colors.badge}`}>
          {isUnlimited ? "Unlimited" : isBlocked ? "Not included" : `${item.used} / ${item.effectiveLimit}`}
        </span>
      </div>

      {!isUnlimited && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
          <div
            className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
            style={{ width: `${(pct * 100).toFixed(1)}%` }}
          />
        </div>
      )}

      {item.override !== null && (
        <p className="text-[10px] text-text-tertiary">
          Admin override: {item.override} (plan default: {item.limit})
        </p>
      )}
    </div>
  );
}

/** Compact inline version for table cells */
export function UsageBarInline({ item, zeroMeansUnlimited }: { item: QuotaItem; zeroMeansUnlimited?: boolean }) {
  const colors = getBarColor(item, zeroMeansUnlimited);
  const isUnlimited = item.effectiveLimit === 0 && zeroMeansUnlimited;
  const isBlocked = item.effectiveLimit === 0 && !zeroMeansUnlimited;
  const pct = item.effectiveLimit > 0 ? Math.min(1, item.used / item.effectiveLimit) : 0;

  if (isUnlimited) {
    return <span className="text-[11px] text-text-tertiary">∞</span>;
  }
  if (isBlocked) {
    return <span className="text-[11px] text-text-tertiary">—</span>;
  }

  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-surface-tertiary">
        <div
          className={`h-full rounded-full ${colors.bar}`}
          style={{ width: `${(pct * 100).toFixed(1)}%` }}
        />
      </div>
      <span className={`text-[10.5px] font-mono tabular-nums ${colors.text}`}>
        {item.used}/{item.effectiveLimit}
      </span>
    </div>
  );
}

/** Compact pill — shows remaining, coloured by level */
export function QuotaBadge({ item, label, zeroMeansUnlimited }: { item: QuotaItem; label: string; zeroMeansUnlimited?: boolean }) {
  const colors = getBarColor(item, zeroMeansUnlimited);
  const isUnlimited = item.effectiveLimit === 0 && zeroMeansUnlimited;
  const isBlocked = item.effectiveLimit === 0 && !zeroMeansUnlimited;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${colors.badge}`}>
      {label}
      {isUnlimited ? " · ∞" : isBlocked ? " · 0" : ` · ${item.remaining} left`}
    </span>
  );
}
