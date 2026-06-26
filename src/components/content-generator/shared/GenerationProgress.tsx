"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Card, Spinner } from "@/components/common";
import { cn } from "@/lib/cn";

/**
 * Progressive AI generation surface — shown during long-running content
 * generation (blog / ebook / whitepaper / LinkedIn). Pairs a thin progress bar
 * and mono status line with a multi-stage checklist so the user sees what the
 * engine is doing instead of staring at a blank screen.
 *
 * UX note: generation is tied to this page's live connection, so we set the
 * expectation that the draft appears *here* when ready — we intentionally do
 * NOT invite the user to navigate away (that would cancel the in-flight run).
 * True "go do something else and get notified" requires background generation.
 */
export interface GenerationStage {
  id: string;
  label: string;
  /** Optional friendlier sub-label shown below the main label while active. */
  detail?: string;
  /** Approximate share of the run, 0–1. Stages should sum to 1. */
  weight: number;
}

interface GenerationProgressProps {
  /** Stages in order. Defaults are tuned for long-form content. */
  stages?: GenerationStage[];
  /** Hook the component into your own progress bus — pass 0–1 to override autoplay. */
  externalProgress?: number;
  /** Show a different intro line at the top. Defaults to "AI is drafting…". */
  title?: string;
  /** Lead paragraph under the title (replaces the default copy). */
  lead?: string;
  /** Optional callout pill (e.g. content-type label). */
  badgeLabel?: string;
  /** Rough time-to-complete hint shown next to the title (e.g. "~1–2 min"). */
  etaLabel?: string;
  /** Optional extra node rendered above the reassurance footer (e.g. live thinking). */
  children?: ReactNode;
  className?: string;
}

const DEFAULT_STAGES: GenerationStage[] = [
  { id: "context", label: "Loading project brief", weight: 0.06 },
  { id: "research", label: "Gathering live research", weight: 0.18 },
  { id: "outline", label: "Designing topical outline", weight: 0.12 },
  { id: "draft", label: "Drafting content", weight: 0.5 },
  { id: "polish", label: "SEO + reference polish", weight: 0.14 },
];

const DEFAULT_LEAD =
  "Your draft is being researched and written from scratch, then quality-checked before it appears. " +
  "This usually takes a minute or two — it'll show up right here the moment it's ready.";

export function GenerationProgress({
  stages = DEFAULT_STAGES,
  externalProgress,
  title,
  lead,
  badgeLabel,
  etaLabel = "~1–2 min",
  children,
  className,
}: GenerationProgressProps) {
  const [autoProgress, setAutoProgress] = useState(0.04);
  const progress = externalProgress ?? autoProgress;

  useEffect(() => {
    if (externalProgress !== undefined) return;
    const tick = setInterval(() => {
      setAutoProgress(p => (p >= 0.94 ? 0.94 : p + 0.013 + Math.random() * 0.018));
    }, 700);
    return () => clearInterval(tick);
  }, [externalProgress]);

  const pct = Math.round(Math.min(progress, 1) * 100);
  const cumulative: number[] = [];
  let acc = 0;
  for (const s of stages) {
    acc += s.weight;
    cumulative.push(acc);
  }

  const activeIndex = (() => {
    if (progress >= 1) return stages.length - 1;
    for (let i = 0; i < cumulative.length; i++) {
      if (progress < cumulative[i]) return i;
    }
    return stages.length - 1;
  })();

  return (
    <Card padding="lg" elevation="raised" className={cn("space-y-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Spinner size={18} className="text-brand-action" />
          <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-text-secondary">
            {badgeLabel ? `${badgeLabel} · drafting` : "AI Studio · drafting"}
          </p>
        </div>
        {etaLabel ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-secondary px-2.5 py-1 text-[11px] font-medium text-text-tertiary">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85} aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
            </svg>
            {etaLabel}
          </span>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium text-text-secondary">{title ?? "Writing your draft"}</span>
          <span className="tabular-nums text-text-tertiary">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full border border-border-subtle bg-surface-secondary">
          <div
            className="h-full rounded-full bg-brand-action transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <p className="text-[14px] leading-relaxed text-text-tertiary">{lead ?? DEFAULT_LEAD}</p>

      <ul className="space-y-2.5">
        {stages.map((s, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <li key={s.id} className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-mono",
                  done
                    ? "border-brand-action bg-brand-action text-white"
                    : active
                      ? "border-brand-action bg-brand-action/15 text-brand-action"
                      : "border-border-subtle bg-surface-secondary text-text-tertiary",
                )}
                aria-hidden
              >
                {done ? "✓" : (i + 1).toString().padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-[13px] font-medium leading-tight",
                    done ? "text-text-secondary" : active ? "text-text-primary" : "text-text-tertiary",
                  )}
                >
                  {s.label}
                </p>
                {active && s.detail ? (
                  <p className="mt-0.5 text-[11px] text-text-tertiary">{s.detail}</p>
                ) : null}
                {active && !s.detail ? (
                  <p className="mt-0.5 text-[11px] text-text-tertiary">In progress…</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {children}

      {/* Reassurance footer — sets the right expectation without inviting the
          user to navigate away (which would cancel this in-flight run). */}
      <div className="flex items-start gap-2.5 rounded-xl border border-border-subtle bg-surface-secondary/60 px-3.5 py-3">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand-action" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        <p className="text-[12.5px] leading-relaxed text-text-tertiary">
          You can keep this tab open and watch it come together — your finished draft will appear here
          automatically, no need to refresh.
        </p>
      </div>
    </Card>
  );
}
