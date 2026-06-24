"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";

export type InsightsView = "opportunities" | "competitors";

export function InsightsViewDropdown({
  menuRef, menuOpen, setMenuOpen, insightsView, setInsightsView, gapsCount, competitorsCount,
}: {
  menuRef: RefObject<HTMLDivElement | null>;
  menuOpen: boolean;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  insightsView: InsightsView;
  setInsightsView: Dispatch<SetStateAction<InsightsView>>;
  gapsCount: number;
  competitorsCount: number;
}) {
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen(o => !o)}
        className="inline-flex h-8 items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,colors] duration-200 hover:border-border-strong hover:text-text-primary"
        aria-expanded={menuOpen}
        aria-haspopup="listbox"
      >
        {insightsView === "opportunities" ? "Opportunity dashboard" : "Competitor list"}
        <svg className="h-3.5 w-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {menuOpen ? (
        <div role="listbox" className="absolute left-0 top-full z-50 mt-1 min-w-[14rem] rounded-[8px] border border-border-subtle bg-surface-elevated py-1 shadow-lg">
          <button
            type="button"
            role="option"
            aria-selected={insightsView === "opportunities"}
            className="block w-full px-3 py-2 text-left text-[13px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            onClick={() => { setInsightsView("opportunities"); setMenuOpen(false); }}
          >
            Opportunity dashboard ({gapsCount})
          </button>
          <button
            type="button"
            role="option"
            aria-selected={insightsView === "competitors"}
            className="block w-full px-3 py-2 text-left text-[13px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            onClick={() => { setInsightsView("competitors"); setMenuOpen(false); }}
          >
            Competitor list ({competitorsCount})
          </button>
        </div>
      ) : null}
    </div>
  );
}
