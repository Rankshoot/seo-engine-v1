import type { ReactNode } from "react";

/**
 * Static header for the keyword-discovery page. The title + description never
 * change, so both the live page and the route-level `loading.tsx` render this
 * exact markup — the heading is shown immediately (never skeletoned) and the
 * loading→loaded transition has zero position jump. Only the `tabs` slot and the
 * table body below differ between the two states.
 */
export function KeywordsPageHeader({ tabs }: { tabs?: ReactNode }) {
  return (
    <header className="shrink-0 z-40 bg-surface-primary/95 backdrop-blur-md px-2 pb-0">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] sm:text-[34px] font-semibold tracking-tight text-text-primary leading-none">
            Find &amp; Schedule Keywords
          </h1>
          <p className="mt-2 text-[13px] text-text-tertiary max-w-[520px] leading-relaxed">
            Discover real search demand, analyze keyword difficulty, and identify competitor gaps to approve for your content calendar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0 pb-1">{tabs}</div>
      </div>

      {/* Gradient separator */}
      <div className="mt-5 h-px bg-gradient-to-r from-transparent via-border-subtle to-transparent" />
      <div className="h-px bg-gradient-to-r from-transparent via-brand-action/30 to-transparent" />
    </header>
  );
}

/**
 * Non-interactive visual replica of the tab switcher for the loading state —
 * same dimensions as the real `KeywordTabSwitcher` so it doesn't shift when the
 * interactive one mounts. Static labels honor "show static buttons, don't
 * skeleton them".
 */
export function KeywordTabSwitcherPlaceholder() {
  return (
    <div className="relative grid grid-cols-2 w-[380px] rounded-[12px] border border-border-subtle bg-surface-secondary/60 p-1 gap-0.5 shadow-sm">
      <div
        className="absolute top-1 bottom-1 rounded-[9px] bg-surface-elevated shadow-sm ring-1 ring-border-subtle/80"
        style={{ width: "calc(50% - 5px)", left: "4px" }}
      />
      <span className="relative flex items-center justify-center gap-2 rounded-[9px] px-3 py-2 text-[13px] font-semibold text-text-primary">
        Organic Keywords
      </span>
      <span className="relative flex items-center justify-center gap-2 rounded-[9px] px-3 py-2 text-[13px] font-semibold text-text-tertiary">
        Competitor Keywords
      </span>
    </div>
  );
}
