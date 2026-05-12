"use client";

/**
 * Shared UI primitives for all Content Health pages.
 * Import from here to keep the three pages visually identical.
 */

import type { ReactNode } from "react";
import { ProjectNavLink } from "@/components/ProjectNavLink";

// ─── Colour / token helpers ────────────────────────────────────────────────

export function healthScoreColor(score: number) {
  if (score >= 75) return { text: "text-emerald-400", bg: "bg-emerald-500", ring: "#34d399" };
  if (score >= 50) return { text: "text-amber-400",  bg: "bg-amber-500",   ring: "#fbbf24" };
  return               { text: "text-rose-400",   bg: "bg-rose-500",    ring: "#f87171" };
}

export const SEVERITY_TOKEN = {
  high:   { badge: "border-rose-500/30 bg-rose-500/10 text-rose-400",   dot: "bg-rose-400",   label: "High"   },
  medium: { badge: "border-amber-500/30 bg-amber-500/10 text-amber-400", dot: "bg-amber-400",  label: "Medium" },
  low:    { badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400", label: "Low" },
} as const;

export const DEMAND_TOKEN = {
  trending: { badge: "border-emerald-500/35 bg-emerald-500/10 text-emerald-400", icon: "↑", label: "Trending" },
  stable:   { badge: "border-sky-500/35 bg-sky-500/10 text-sky-400",             icon: "→", label: "Stable"   },
  declining:{ badge: "border-rose-500/35 bg-rose-500/10 text-rose-400",           icon: "↓", label: "Declining"},
  niche:    { badge: "border-amber-500/35 bg-amber-500/10 text-amber-400",        icon: "◆", label: "Niche"    },
  unknown:  { badge: "border-border-subtle bg-surface-elevated text-text-tertiary",icon: "?", label: "No data" },
} as const;

export function formatVolume(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

// ─── Score ring (SVG circular progress) ───────────────────────────────────

export function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const { text, ring } = healthScoreColor(score);
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(1, Math.max(0, score / 100));
  return (
    <div className="relative shrink-0 flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={3} className="text-border-subtle" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={ring}
          strokeWidth={3}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <span className={`text-[13px] font-black tabular-nums leading-none relative z-10 ${text}`}>{score}</span>
    </div>
  );
}

// ─── Severity chip ─────────────────────────────────────────────────────────

export function SeverityChip({ severity }: { severity: "high" | "medium" | "low" }) {
  const t = SEVERITY_TOKEN[severity];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${t.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.dot}`} />
      {t.label}
    </span>
  );
}

// ─── Funnel chip ───────────────────────────────────────────────────────────

export function FunnelChip({ stage }: { stage: string }) {
  const colors: Record<string, string> = {
    TOFU: "border-sky-500/30 bg-sky-500/10 text-sky-400",
    MOFU: "border-violet-500/30 bg-violet-500/10 text-violet-400",
    BOFU: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  };
  const c = colors[stage] ?? "border-border-subtle bg-surface-elevated text-text-tertiary";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${c}`}>
      {stage}
    </span>
  );
}

// ─── Demand chip ───────────────────────────────────────────────────────────

export function DemandChip({
  verdict,
  volume,
}: {
  verdict: keyof typeof DEMAND_TOKEN;
  volume?: number;
}) {
  const t = DEMAND_TOKEN[verdict];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${t.badge}`}>
      <span aria-hidden>{t.icon}</span>
      {t.label}
      {volume && volume > 0 ? <span className="opacity-70">· {formatVolume(volume)}</span> : null}
    </span>
  );
}

// ─── Alert banners ─────────────────────────────────────────────────────────

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[14px] border border-rose-500/20 bg-rose-500/8 px-4 py-3.5 text-[14px] text-rose-400">
      <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 text-[14px] text-emerald-400">
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

// ─── Stat tile ─────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  sub,
  valueClass = "text-text-primary",
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  valueClass?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[16px] border border-border-subtle bg-surface-elevated p-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">{label}</p>
        {icon ? <span className="text-text-tertiary/50">{icon}</span> : null}
      </div>
      <p className={`font-mono text-[30px] font-bold tabular-nums leading-none ${valueClass}`}>{value}</p>
      {sub ? <p className="text-[12px] text-text-tertiary">{sub}</p> : null}
    </div>
  );
}

// ─── Page shell (consistent header across the 3 CH pages) ─────────────────

export function CHPageShell({
  backHref,
  backLabel = "← Site audit",
  title,
  subtitle,
  actions,
  children,
}: {
  backHref?: string;
  backLabel?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-8 pb-20">
      <div className="pt-6 pb-6 border-b border-border-subtle">
        {backHref && (
          <ProjectNavLink
            href={backHref}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-text-tertiary hover:text-text-primary transition-colors mb-4"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
            </svg>
            {backLabel}
          </ProjectNavLink>
        )}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[36px] sm:text-[42px] font-normal tracking-[-0.84px] leading-none text-text-primary font-display">
              {title}
            </h1>
            {subtitle && <p className="mt-3 text-[14px] text-text-tertiary leading-relaxed max-w-[600px]">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────

export function CHEmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-border-strong bg-surface-secondary/60 py-24 text-center px-6">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[16px] border border-border-subtle bg-surface-elevated text-text-tertiary">
        {icon}
      </div>
      <h3 className="mb-2 text-[20px] font-medium tracking-tight text-text-primary font-display">{title}</h3>
      <p className="mb-7 text-[14px] text-text-tertiary max-w-sm leading-relaxed">{body}</p>
      {action}
    </div>
  );
}

// ─── Skeleton rows ─────────────────────────────────────────────────────────

export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-[84px] w-full animate-pulse rounded-[16px] border border-border-subtle bg-surface-elevated"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}

// ─── Section label ─────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">{children}</p>
  );
}

// ─── Pill tab filter bar (replaces PillTabFilterBar in CH context) ─────────

export function CHFilterTabs<T extends string>({
  items,
  active,
  onChange,
  disabled,
}: {
  items: { id: T; label: string; count?: number }[];
  active: T;
  onChange: (id: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="tablist">
      {items.map(item => (
        <button
          key={item.id}
          role="tab"
          aria-selected={active === item.id}
          disabled={disabled}
          onClick={() => onChange(item.id)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-all ${
            active === item.id
              ? "border-brand-action/40 bg-brand-action/10 text-brand-action"
              : "border-border-subtle bg-surface-elevated text-text-secondary hover:border-border-strong hover:text-text-primary"
          } disabled:opacity-40`}
        >
          {item.label}
          {item.count != null && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                active === item.id ? "bg-brand-action/20 text-brand-action" : "bg-surface-tertiary text-text-tertiary"
              }`}
            >
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Spinner ───────────────────────────────────────────────────────────────

export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <div
      className={`animate-spin rounded-full border-2 border-current/25 border-t-current ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
