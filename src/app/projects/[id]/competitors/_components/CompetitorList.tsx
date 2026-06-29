"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Competitor, KeywordStatus } from "@/lib/types";
import { KeywordActionDropdown } from "@/components/keywords/KeywordActionDropdown";
import { DomainLogo } from "./DomainLogo";
import { InsightsViewDropdown, type InsightsView } from "./InsightsViewDropdown";

export function CompetitorList({
  competitors, statusById, onStatusChange, viewMenuRef, viewMenuOpen,
  setViewMenuOpen, setInsightsView, projectGapsCount, competitorsCount,
}: {
  competitors: Competitor[];
  statusById: Record<string, KeywordStatus>;
  onStatusChange: (competitorId: string, next: KeywordStatus) => void;
  viewMenuRef: RefObject<HTMLDivElement | null>;
  viewMenuOpen: boolean;
  setViewMenuOpen: Dispatch<SetStateAction<boolean>>;
  setInsightsView: Dispatch<SetStateAction<InsightsView>>;
  projectGapsCount: number;
  competitorsCount: number;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end">
        <InsightsViewDropdown
          menuRef={viewMenuRef}
          menuOpen={viewMenuOpen}
          setMenuOpen={setViewMenuOpen}
          insightsView="competitors"
          setInsightsView={setInsightsView}
          gapsCount={projectGapsCount}
          competitorsCount={competitorsCount}
        />
      </div>
      {competitors.map(c => {
        const rowStatus = statusById[c.id] ?? "pending";
        return (
          <div
            key={c.id}
            className={`rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden ${rowStatus === "rejected" ? "opacity-75" : ""}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-4 p-5 hover:bg-surface-hover transition-colors">
              <div className="flex flex-1 items-center gap-4 min-w-0 text-left">
                <DomainLogo domain={c.domain} />
                <div className="min-w-0">
                  <p className="text-[16px] font-medium text-text-primary truncate">{c.domain}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <KeywordActionDropdown status={rowStatus} onChange={next => onStatusChange(c.id, next)} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
