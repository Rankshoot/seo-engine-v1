"use client";

import { type ReactNode } from "react";

// ─── Score Ring ───────────────────────────────────────────────────────────────

export function ScoreRing({
  score,
  size = 56,
  strokeWidth = 5,
  label,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = scoreColor(score);

  return (
    <div className="relative inline-flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={strokeWidth}
          className="stroke-surface-tertiary"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={strokeWidth}
          stroke={color}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <span
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-bold tabular-nums"
        style={{ fontSize: size * 0.22, color }}
      >
        {score}
      </span>
      {label && (
        <span className="text-[10px] font-medium text-text-tertiary text-center leading-tight max-w-[60px]">{label}</span>
      )}
    </div>
  );
}

export function scoreColor(score: number): string {
  if (score >= 75) return "#22c55e";
  if (score >= 55) return "#f59e0b";
  return "#ef4444";
}

export function scoreGrade(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
}

// ─── Severity chip ────────────────────────────────────────────────────────────

export function SeverityChip({ severity }: { severity: string }) {
  const cls: Record<string, string> = {
    critical: "bg-rose-500/15 text-rose-400 border-rose-500/20",
    high: "bg-orange-500/15 text-orange-400 border-orange-500/20",
    medium: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  };
  const c = cls[severity] ?? "bg-surface-secondary text-text-tertiary border-border-subtle";
  return (
    <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold border ${c}`}>
      {severity}
    </span>
  );
}

// ─── Category badge ───────────────────────────────────────────────────────────

export function CategoryBadge({ category }: { category: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    seo: { label: "SEO", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    geo: { label: "GEO", cls: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
    aeo: { label: "AEO", cls: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
    content: { label: "Content", cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
    keyword: { label: "Keyword", cls: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
    technical: { label: "Technical", cls: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
    freshness: { label: "Freshness", cls: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  };
  const { label, cls } = map[category] ?? { label: category, cls: "bg-surface-secondary text-text-tertiary border-border-subtle" };
  return (
    <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

// ─── Rubric status icon ───────────────────────────────────────────────────────

export function RubricStatus({ status }: { status: "pass" | "warn" | "fail" }) {
  if (status === "pass") return (
    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
      <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
  if (status === "warn") return (
    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/15 flex items-center justify-center">
      <svg className="w-3 h-3 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M3.56 21h16.88a2 2 0 0 0 1.71-3.03L13.71 3.86a2 2 0 0 0-3.42 0L1.85 17.97A2 2 0 0 0 3.56 21z" />
      </svg>
    </span>
  );
  return (
    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-rose-500/15 flex items-center justify-center">
      <svg className="w-3 h-3 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
      </svg>
    </span>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function SkeletonRow() {
  return (
    <div className="rounded-[14px] border border-border-subtle bg-surface-elevated p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-surface-tertiary shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-surface-tertiary rounded w-3/4" />
          <div className="h-3 bg-surface-tertiary rounded w-1/2" />
          <div className="h-3 bg-surface-tertiary rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

export function EmptyState({
  icon, title, body, action,
}: {
  icon?: ReactNode;
  title: string;
  body: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-dashed border-border-strong bg-surface-secondary/30 py-16 text-center px-6">
      {icon && <div className="inline-flex items-center justify-center w-12 h-12 rounded-[14px] bg-surface-tertiary text-text-tertiary mb-4">{icon}</div>}
      <h3 className="text-[15px] font-semibold text-text-primary mb-2">{title}</h3>
      <p className="text-[13px] text-text-tertiary max-w-sm mx-auto leading-relaxed">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      style={{ width: size, height: size }}
      xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── Score card ───────────────────────────────────────────────────────────────

export function ScoreCard({
  label, score, description, icon, tooltip, metricValue,
}: {
  label: string;
  score: number;
  description: string;
  icon: ReactNode;
  /** Optional rich data shown on hover (e.g. keyword volume / trend). */
  tooltip?: ReactNode;
  metricValue?: string;
}) {
  const color = scoreColor(score);
  const grade = scoreGrade(score);
  return (
    <div className="group relative rounded-[12px] border border-border-subtle bg-surface-elevated p-3.5 flex flex-col gap-2 transition-colors hover:border-border-strong">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-text-tertiary">{icon}</span>
          <span className="text-[12px] font-semibold text-text-secondary">{label}</span>
        </div>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
          style={{ color, borderColor: `${color}40`, background: `${color}15` }}
        >
          {grade}
        </span>
      </div>
      <div className="flex items-end justify-between">
        <div className="flex items-baseline gap-1">
          <span className="text-[28px] font-bold tabular-nums leading-none" style={{ color }}>
            {score}
          </span>
          <span className="text-[10px] text-text-tertiary">/100</span>
        </div>
        {metricValue && (
          <span className="text-[10px] font-semibold text-text-secondary bg-surface-secondary px-2 py-0.5 rounded-[6px] border border-border-subtle select-none">
            {metricValue}
          </span>
        )}
      </div>
      <div className="h-1 rounded-full bg-surface-tertiary overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, background: color }} />
      </div>
      <p className="text-[11px] text-text-tertiary leading-relaxed line-clamp-2 min-h-[32px]">{description}</p>

      {tooltip && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-30 w-[min(280px,90vw)] -translate-x-1/2 -translate-y-full rounded-[12px] border border-border-strong bg-surface-primary p-3 text-left opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
          {tooltip}
        </div>
      )}
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

export function StepIndicator({
  steps, currentStep,
}: {
  steps: { label: string }[];
  currentStep: number;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {steps.map((step, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        return (
          <div key={step.label} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
              done ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                : active ? "bg-brand-violet/15 text-brand-violet border border-brand-violet/20"
                : "bg-surface-secondary text-text-tertiary border border-border-subtle"
            }`}>
              {done ? (
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" />
                </svg>
              ) : active ? (
                <Spinner size={10} />
              ) : (
                <span className="w-2 h-2 rounded-full bg-current opacity-30 inline-block" />
              )}
              {step.label}
            </div>
            {i < steps.length - 1 && (
              <div className={`w-4 h-px ${done ? "bg-emerald-500/40" : "bg-border-subtle"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Keyword demand chip ──────────────────────────────────────────────────────

export function KeywordVerdictChip({ verdict, volume }: { verdict: string; volume?: number }) {
  const map: Record<string, { cls: string; label: string }> = {
    trending: { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", label: "📈 Trending" },
    stable: { cls: "bg-blue-500/15 text-blue-400 border-blue-500/20", label: "→ Stable" },
    declining: { cls: "bg-rose-500/15 text-rose-400 border-rose-500/20", label: "📉 Declining" },
    niche: { cls: "bg-amber-500/15 text-amber-400 border-amber-500/20", label: "🎯 Niche" },
    unknown: { cls: "bg-surface-secondary text-text-tertiary border-border-subtle", label: "Unknown" },
  };
  const { cls, label } = map[verdict] ?? map.unknown;
  return (
    <span className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-semibold border ${cls}`}>
      {label}
      {volume != null && volume > 0 && <span className="opacity-70">· {volume >= 1000 ? `${(volume / 1000).toFixed(1)}k` : volume}/mo</span>}
    </span>
  );
}

// Backward compat export
export { scoreColor as healthScoreColor };
