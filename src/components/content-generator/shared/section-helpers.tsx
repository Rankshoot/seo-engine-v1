"use client";

import { cn } from "@/lib/cn";

/**
 * Eyebrow + index label used to group form sections inside the Content Studio.
 * Matches the existing Instant Article visual language (mono caps + hairline rule).
 */
export function SectionHeading({
  index,
  label,
  hint,
}: {
  index: string;
  label: string;
  hint?: string;
}) {
  return (
    <div className="mb-5 flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] font-medium tabular-nums text-text-tertiary">{index}</span>
        <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-text-secondary">
          {label}
        </span>
        <span className="h-px flex-1 bg-border-subtle" aria-hidden />
      </div>
      {hint ? <p className="text-[12px] text-text-tertiary leading-relaxed">{hint}</p> : null}
    </div>
  );
}

/**
 * Slim breadcrumb row used at the top of every Content Studio page so the
 * user always knows where they are inside `Content Generator → <type>`.
 */
export function StudioBreadcrumb({
  parentHref,
  parentLabel,
  current,
}: {
  parentHref?: string;
  parentLabel?: string;
  current: string;
}) {
  return (
    <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px] text-text-tertiary" aria-label="Breadcrumb">
      {parentHref && parentLabel ? (
        <>
          <a
            href={parentHref}
            className="text-text-tertiary transition-colors hover:text-text-primary"
          >
            {parentLabel}
          </a>
          <span className="opacity-30" aria-hidden>/</span>
        </>
      ) : (
        <>
          <span className="text-text-tertiary">Content Generator</span>
          <span className="opacity-30" aria-hidden>/</span>
        </>
      )}
      <span className="text-text-secondary font-medium">{current}</span>
    </nav>
  );
}

/** Step indicator (01 → 02 → 03) shared across every multi-step form. */
export function StepRow({
  steps,
  activeIndex,
}: {
  steps: { id: string; label: string }[];
  activeIndex: number;
}) {
  return (
    <div className="mb-10 flex flex-wrap items-center gap-x-6 gap-y-3">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-3">
          <StepPill
            index={(i + 1).toString().padStart(2, "0")}
            label={s.label}
            active={i === activeIndex}
            done={i < activeIndex}
          />
          {i < steps.length - 1 ? (
            <span
              className={cn(
                "h-px w-12 transition-colors duration-(--duration-base)",
                i < activeIndex ? "bg-brand-action/40" : "bg-border-subtle",
              )}
              aria-hidden
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function StepPill({
  index,
  label,
  active,
  done,
}: {
  index: string;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 transition-colors duration-(--duration-base)",
        active ? "text-text-primary" : done ? "text-text-secondary" : "text-text-tertiary",
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-semibold tabular-nums",
          active
            ? "border-brand-action bg-brand-action text-white"
            : done
              ? "border-brand-action/50 bg-brand-action/15 text-brand-action"
              : "border-border-subtle bg-surface-secondary text-text-tertiary",
        )}
      >
        {done && !active ? "✓" : index}
      </span>
      <span className="text-[13px] font-medium">{label}</span>
    </div>
  );
}

/** Compact metric chip used inside the previewer header (sources, links, words). */
export function MetricPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "action" | "coral" | "emerald";
}) {
  const toneClass =
    tone === "action"
      ? "border-brand-action/30 bg-brand-action/10 text-brand-action"
      : tone === "coral"
        ? "border-rose-500/25 bg-rose-500/8 text-rose-400"
        : tone === "emerald"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-border-subtle bg-surface-secondary text-text-secondary";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        toneClass,
      )}
    >
      <span className="font-semibold">{value}</span>
      <span className="text-text-tertiary">{label}</span>
    </span>
  );
}

/** Content-type badge ("Ebook", "Whitepaper", "LinkedIn", "Blog"). */
export function ContentTypeBadge({ type }: { type?: string }) {
  const safeType = type || "Blog";
  const lowerType = safeType.toLowerCase();
  const tone =
    lowerType === "ebook"
      ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
      : lowerType === "whitepaper"
        ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
        : lowerType === "linkedin" || lowerType === "linkedin post"
          ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
          : "border-border-subtle bg-surface-tertiary text-text-secondary";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest",
        tone,
      )}
    >
      {safeType}
    </span>
  );
}

/** Pulse loader fallback for the Recent History panel at the bottom of generator pages. */
export function RecentHistorySkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden="true">
      <div className="flex items-center gap-3">
        <div className="h-4 w-6 rounded bg-text-primary/10" />
        <div className="h-4 w-32 rounded bg-text-primary/10" />
        <div className="h-px flex-1 bg-border-subtle" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[1, 2, 3, 4].map(idx => (
          <div key={idx} className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-elevated p-4 h-[100px]">
            <div className="h-3 w-20 rounded bg-text-primary/10" />
            <div className="h-4 w-3/4 rounded bg-text-primary/10" />
            <div className="h-3 w-1/2 rounded bg-text-primary/5 mt-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
