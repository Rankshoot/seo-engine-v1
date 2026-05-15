"use client";

import type { ReactNode } from "react";
import type { ScorecardResult } from "./score-helpers";

const MONO_LABEL = { fontFamily: "CohereMono, monospace", letterSpacing: "0.28px" } as const;

const GRADE_CONFIG = {
  A: { color: "#16a34a", ring: "#16a34a33", bg: "#16a34a12", bar: "#16a34a", label: "Excellent" },
  B: {
    color: "var(--brand-action)",
    ring: "var(--brand-action)",
    bg: "color-mix(in srgb, var(--brand-action) 10%, transparent)",
    bar: "var(--brand-action)",
    label: "Good",
  },
  C: { color: "#d97706", ring: "#d9770633", bg: "#d9770612", bar: "#d97706", label: "Needs Work" },
  D: {
    color: "var(--brand-coral)",
    ring: "var(--brand-coral)",
    bg: "color-mix(in srgb, var(--brand-coral) 10%, transparent)",
    bar: "var(--brand-coral)",
    label: "Poor",
  },
  F: { color: "#b91c1c", ring: "#b91c1c33", bg: "#b91c1c12", bar: "#b91c1c", label: "Critical" },
} as const;

export interface ScorecardViewProps {
  /** Eyebrow heading shown above the grade ring (e.g. "Ebook score"). */
  title: string;
  /** Subtitle under the grade (e.g. "Optimised for premium lead magnets"). */
  subtitle?: string;
  scorecard: ScorecardResult;
  /** Optional CTA rendered under the grade summary (e.g. "AI fix"). */
  cta?: ReactNode;
  /** Optional checklist footer (e.g. "Recalculating…"). */
  footer?: ReactNode;
  className?: string;
}

/**
 * Generic grade ring + checklist surface used by every Content Studio scorecard
 * (ebook, whitepaper, LinkedIn). Mirrors the visual contract of the existing
 * blog `SEOScorePanel` so the studio feels native.
 */
export function ScorecardView({
  title,
  subtitle,
  scorecard,
  cta,
  footer,
  className = "rounded-[8px] p-5 bg-surface-primary border border-border-default",
}: ScorecardViewProps) {
  const cfg = GRADE_CONFIG[scorecard.grade];
  const pct = Math.round(scorecard.pct);
  const failures = scorecard.checks.filter(c => !c.pass && !c.warn);

  // Group checks by category so the panel reads like a checklist with sections.
  const groups = new Map<string, typeof scorecard.checks>();
  for (const c of scorecard.checks) {
    const key = c.category ?? "Checklist";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase text-text-tertiary" style={MONO_LABEL}>
          {title}
        </p>
        {subtitle ? (
          <span className="text-[10px] text-text-tertiary">{subtitle}</span>
        ) : null}
      </div>

      <div className="flex items-center gap-4">
        <div
          className="w-[60px] h-[60px] rounded-full flex flex-col items-center justify-center shrink-0"
          style={{ background: cfg.bg, outline: `3px solid ${cfg.ring}`, outlineOffset: 0 }}
        >
          <span className="text-[26px] font-bold leading-none" style={{ color: cfg.color }}>
            {scorecard.grade}
          </span>
          <span className="text-[9px] font-medium text-text-tertiary" style={MONO_LABEL}>
            {pct}%
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold" style={{ color: cfg.color }}>
            {cfg.label}
          </p>
          <p className="text-[11px] mt-0.5 text-text-tertiary">
            {scorecard.total} / {scorecard.maxTotal} points
          </p>
          {failures.length > 0 ? (
            <p className="text-[11px] mt-0.5 text-text-tertiary">
              {failures.length} issue{failures.length > 1 ? "s" : ""} to fix
            </p>
          ) : null}
        </div>
      </div>

      <div className="h-1 w-full rounded-full bg-surface-secondary">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: cfg.bar }}
        />
      </div>

      {cta ? <div className="pt-1">{cta}</div> : null}

      <div className="border-t border-border-default" />

      <div className="space-y-4">
        {[...groups.entries()].map(([category, checks]) => (
          <div key={category} className="space-y-2">
            {groups.size > 1 ? (
              <p
                className="text-[9px] font-bold uppercase tracking-widest text-text-tertiary"
                style={MONO_LABEL}
              >
                {category}
              </p>
            ) : null}
            {checks.map(check => (
              <div key={check.key} className="flex items-start gap-2.5">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    background: check.pass
                      ? "#16a34a18"
                      : check.warn
                        ? "#d9770618"
                        : "#b91c1c12",
                  }}
                >
                  {check.pass ? (
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="#16a34a" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                    </svg>
                  ) : check.warn ? (
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="#d97706" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" />
                    </svg>
                  ) : (
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="#b91c1c" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[11px] font-medium leading-tight"
                    style={{ color: check.pass ? "var(--text-tertiary)" : "var(--text-primary)" }}
                  >
                    {check.label}
                    <span className="ml-1 font-normal text-text-tertiary">({check.points}pt)</span>
                  </p>
                  {!check.pass ? (
                    <p className="text-[10px] mt-0.5 leading-snug text-text-tertiary">{check.hint}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {footer}
    </div>
  );
}
