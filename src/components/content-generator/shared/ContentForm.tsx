"use client";

import type { ReactNode } from "react";

/**
 * Multi-section form scaffold used by Ebook / Whitepaper / LinkedIn forms.
 * Each section is rendered as a 12-spacing block with the eyebrow heading
 * + a stack of children (each child is typically a `Field` from
 * `@/components/common`). Keeps every generator visually identical without
 * forcing each form to re-implement chrome.
 */
export function ContentForm({ children }: { children: ReactNode }) {
  return <div className="space-y-12">{children}</div>;
}

export function ContentFormSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={className}>{children}</section>;
}

export function ContentFormGrid({
  children,
  cols = 2,
}: {
  children: ReactNode;
  cols?: 1 | 2 | 3;
}) {
  const colClass = cols === 1 ? "" : cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3";
  return <div className={`grid gap-4 ${colClass}`}>{children}</div>;
}

/** Pill toggle group used for tone / depth / style inputs. */
export function ChipChoice<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { id: T; label: string; hint?: string }[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={ariaLabel}>
      {options.map(opt => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.id)}
            className={
              "inline-flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left text-[13px] font-medium transition-all duration-(--duration-fast) ease-out " +
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-action/40 " +
              (selected
                ? "border-text-primary bg-text-primary text-surface-primary"
                : "border-border-subtle bg-surface-elevated text-text-secondary hover:border-border-strong hover:text-text-primary")
            }
          >
            <span>{opt.label}</span>
            {opt.hint ? (
              <span className={selected ? "text-[11px] opacity-80" : "text-[11px] text-text-tertiary"}>
                {opt.hint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export { KeywordChips } from "./KeywordChips";
