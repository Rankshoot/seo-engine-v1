"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useMemo, useRef, useState, useEffect } from "react";
import type { BenchmarkState } from "@/app/actions/competitor-actions";
import type { KeywordGap, KeywordStatus } from "@/lib/types";
import { KeywordActionDropdown } from "@/components/keywords/KeywordActionDropdown";
import { PillTabFilterBar } from "@/components/filters/PillTabFilterBar";
import { EmptyState } from "@/components/common";
import { Tooltip } from "@/components/Tooltip";
import { InsightsViewDropdown, type InsightsView } from "./InsightsViewDropdown";
import { AI_GAP_SCORE_CATEGORY, GapAiScoreCell } from "./GapAiScore";

type OpportunityWorkspaceTab = "all" | KeywordStatus;
type GapSortColumn = "keyword" | "gap_type" | "volume" | "competitor_weakness" | "ai_eval_score" | "action";
type SortDir = "asc" | "desc";

function gapKeywordWorkspaceStatus(keyword: string, approved: Set<string>, rejected: Set<string>): KeywordStatus {
  const k = keyword.toLowerCase();
  if (rejected.has(k)) return "rejected";
  if (approved.has(k)) return "approved";
  return "pending";
}

function defaultGapSortDir(col: GapSortColumn): SortDir {
  return col === "keyword" || col === "gap_type" ? "asc" : "desc";
}

function compareGaps(a: KeywordGap, b: KeywordGap, col: GapSortColumn, dir: SortDir): number {
  const m = dir === "asc" ? 1 : -1;
  switch (col) {
    case "keyword": return m * a.keyword.localeCompare(b.keyword);
    case "gap_type": return m * a.gap_type.localeCompare(b.gap_type);
    case "volume": return m * ((a.volume || 0) - (b.volume || 0));
    case "competitor_weakness": return m * ((a.competitor_weakness || 0) - (b.competitor_weakness || 0));
    case "ai_eval_score": return m * ((a.ai_eval_score ?? 0) - (b.ai_eval_score ?? 0));
    default: return 0;
  }
}

function compactUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`.replace(/\/$/, "");
    return path && path !== "/" ? path : parsed.hostname.replace(/^www\./, "");
  } catch { return url; }
}

const PAGE_SIZE = 20;

export function OpportunityDashboard({
  gaps, hasGapsInProject, generatingKeyword, approvedGapKeywords, rejectedGapKeywords,
  onGapKeywordStatus, aiGapKeywordSet, massSelectMode, selectedGapIds, onToggleGapSelected,
  bulkApprovingGaps, viewMenuRef, viewMenuOpen, setViewMenuOpen, setInsightsView, projectGapsCount,
  competitorsCount, exitGapMassSelect, onStartMassSelect, onBulkApproveGaps, aiScoring,
  onRunAiScoring, aiScoringDone, onLoadMoreAhrefs, loadingMoreAhrefs,
}: {
  gaps: KeywordGap[];
  hasGapsInProject: boolean;
  averages?: BenchmarkState["averages"];
  generatingKeyword: string | null;
  approvedGapKeywords: Set<string>;
  rejectedGapKeywords: Set<string>;
  onGapKeywordStatus: (keyword: string, next: KeywordStatus) => void;
  aiGapKeywordSet: Set<string>;
  massSelectMode: boolean;
  selectedGapIds: Set<string>;
  onToggleGapSelected: (gapId: string) => void;
  bulkApprovingGaps: boolean;
  viewMenuRef: RefObject<HTMLDivElement | null>;
  viewMenuOpen: boolean;
  setViewMenuOpen: Dispatch<SetStateAction<boolean>>;
  setInsightsView: Dispatch<SetStateAction<InsightsView>>;
  projectGapsCount: number;
  competitorsCount: number;
  exitGapMassSelect: () => void;
  onStartMassSelect: () => void;
  onBulkApproveGaps: () => void;
  aiScoring: boolean;
  onRunAiScoring: () => void;
  aiScoringDone: boolean;
  onLoadMoreAhrefs: () => void;
  loadingMoreAhrefs: boolean;
}) {
  const [workspaceTab, setWorkspaceTab] = useState<OpportunityWorkspaceTab>("all");
  const [sortCol, setSortCol] = useState<GapSortColumn>("volume");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  const toggleSort = (col: GapSortColumn) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir(defaultGapSortDir(col)); }
  };

  const sortMark = (col: GapSortColumn) =>
    sortCol !== col
      ? <span className="ml-0.5 text-[11px] font-normal normal-case tracking-normal text-text-tertiary/40" aria-hidden>↕</span>
      : <span className="ml-0.5 text-brand-action" aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>;

  const thBtn = "group inline-flex items-center gap-0.5 rounded-[6px] px-1 py-0.5 -mx-1 text-left uppercase tracking-widest hover:bg-surface-hover/80 hover:text-text-secondary transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-action/40 cursor-pointer";

  useEffect(() => {
    const timer = window.setTimeout(() => setVisibleCount(PAGE_SIZE), 0);
    return () => window.clearTimeout(timer);
  }, [workspaceTab, sortCol, sortDir]);

  const workspaceCounts = useMemo(() => {
    let all = 0, pending = 0, approved = 0, rejected = 0;
    for (const g of gaps) {
      all++;
      const st = gapKeywordWorkspaceStatus(g.keyword, approvedGapKeywords, rejectedGapKeywords);
      if (st === "pending") pending++;
      if (st === "approved") approved++;
      if (st === "rejected") rejected++;
    }
    return { all, pending, approved, rejected };
  }, [gaps, approvedGapKeywords, rejectedGapKeywords]);

  const allFilteredGaps = useMemo(() => {
    const filtered = gaps.filter(g => {
      if (workspaceTab === "all") return true;
      return gapKeywordWorkspaceStatus(g.keyword, approvedGapKeywords, rejectedGapKeywords) === workspaceTab;
    });
    return [...filtered].sort((a, b) => compareGaps(a, b, sortCol, sortDir));
  }, [gaps, workspaceTab, approvedGapKeywords, rejectedGapKeywords, sortCol, sortDir]);

  const displayedGaps = useMemo(() => allFilteredGaps.slice(0, visibleCount), [allFilteredGaps, visibleCount]);
  const hasMore = visibleCount < allFilteredGaps.length;
  const remaining = allFilteredGaps.length - visibleCount;

  const loadMore = () => {
    const el = tableScrollRef.current;
    const scrollBefore = el?.scrollTop ?? 0;
    setVisibleCount(c => c + PAGE_SIZE);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!el) return;
        el.scrollTo({ top: scrollBefore + 52 * PAGE_SIZE * 0.35, behavior: "smooth" });
      });
    });
  };

  const TABS: Array<{ id: OpportunityWorkspaceTab; label: string; count: number }> = [
    { id: "all", label: "All", count: workspaceCounts.all },
    { id: "pending", label: "Pending", count: workspaceCounts.pending },
    { id: "approved", label: "Approved", count: workspaceCounts.approved },
    { id: "rejected", label: "Rejected", count: workspaceCounts.rejected },
  ];

  return (
    <div className="space-y-6">
      {!hasGapsInProject ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <InsightsViewDropdown
            menuRef={viewMenuRef} menuOpen={viewMenuOpen} setMenuOpen={setViewMenuOpen}
            insightsView="opportunities" setInsightsView={setInsightsView}
            gapsCount={projectGapsCount} competitorsCount={competitorsCount}
          />
        </div>
      ) : null}

      {hasGapsInProject && aiScoringDone && (
        <div className="flex items-center gap-3 rounded-[12px] border border-brand-violet/25 bg-brand-violet/10 px-4 py-3 text-[13px] text-brand-violet">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <span>AI scoring complete — scores are now visible in the AI Score column.</span>
        </div>
      )}

      {hasGapsInProject ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-[28px] font-normal tracking-[-0.28px] text-text-primary font-display">Keyword list</h2>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PillTabFilterBar<OpportunityWorkspaceTab>
              className="min-w-0 flex-1"
              items={TABS}
              activeId={workspaceTab}
              onChange={setWorkspaceTab}
            />
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {gaps.length > 0 ? (
                <>
                  {!massSelectMode ? (
                    <button
                      type="button"
                      onClick={onStartMassSelect}
                      className="inline-flex h-8 shrink-0 cursor-pointer flex-row items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,opacity,colors] duration-200 ease-out hover:border-border-strong hover:text-text-primary hover:-translate-y-px active:scale-95 motion-safe:hover:scale-105"
                    >
                      <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 opacity-75" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" rx="1.25" opacity="0.65" />
                        <rect x="14" y="3" width="7" height="7" rx="1.25" opacity="0.65" />
                        <rect x="3" y="14" width="7" height="7" rx="1.25" opacity="0.65" />
                        <path d="M14 17.5 16 19.5 21 13.5" />
                      </svg>
                      <span>Mass select</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={onBulkApproveGaps}
                        disabled={bulkApprovingGaps || selectedGapIds.size === 0}
                        className={`inline-flex h-8 w-38 shrink-0 cursor-pointer flex-col justify-center whitespace-nowrap rounded-full border border-brand-action/70 bg-brand-action px-2 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide text-brand-on-primary shadow-sm transition-[transform,box-shadow,opacity] duration-200 ease-out hover:-translate-y-px hover:shadow-md active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-35 motion-safe:hover:scale-105 ${bulkApprovingGaps ? "animate-pulse cursor-wait" : ""}`}
                      >
                        <span className="block max-w-full overflow-hidden truncate text-center tabular-nums">
                          {bulkApprovingGaps ? "…" : selectedGapIds.size > 0 ? `Approve (${selectedGapIds.size})` : "Approve"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={exitGapMassSelect}
                        disabled={bulkApprovingGaps}
                        className="inline-flex h-8 min-w-19 shrink-0 cursor-pointer flex-col justify-center whitespace-nowrap rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,opacity,colors] duration-200 ease-out hover:border-border-strong hover:text-text-primary hover:-translate-y-px active:scale-95 disabled:opacity-35 motion-safe:hover:scale-105"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </>
              ) : null}
              {gaps.length > 0 && !massSelectMode && (
                <button
                  type="button"
                  onClick={onRunAiScoring}
                  disabled={aiScoring}
                  className={`inline-flex h-8 shrink-0 cursor-pointer flex-row items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold leading-none uppercase tracking-wide shadow-sm transition-[transform,opacity,colors] duration-200 ease-out hover:-translate-y-px active:scale-95 disabled:pointer-events-none disabled:opacity-50 motion-safe:hover:scale-105 ${
                    aiScoring
                      ? "border-brand-violet/40 bg-brand-violet/20 text-brand-violet animate-pulse"
                      : "border-brand-violet/30 bg-brand-violet/10 text-brand-violet hover:bg-brand-violet/20"
                  }`}
                >
                  {aiScoring ? (
                    <>
                      <div className="h-3 w-3 rounded-full border-2 border-brand-violet/30 border-t-brand-violet animate-spin" />
                      <span>Scoring…</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
                      </svg>
                      <span>AI Score</span>
                    </>
                  )}
                </button>
              )}
              <InsightsViewDropdown
                menuRef={viewMenuRef} menuOpen={viewMenuOpen} setMenuOpen={setViewMenuOpen}
                insightsView="opportunities" setInsightsView={setInsightsView}
                gapsCount={projectGapsCount} competitorsCount={competitorsCount}
              />
            </div>
          </div>
        </section>
      ) : null}

      {displayedGaps.length === 0 ? (
        <EmptyState
          variant="card"
          title={!hasGapsInProject ? "No opportunities yet" : workspaceTab !== "all" ? "No opportunities match this tab" : "No opportunities match this view"}
          body={!hasGapsInProject ? "Run or re-run a benchmark from the button above." : undefined}
        />
      ) : (
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden flex flex-col" style={{ height: "560px" }}>
          <div ref={tableScrollRef} className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
            <table className="w-full min-w-[1060px] text-left">
              <thead className="sticky top-0 z-10 bg-surface-secondary text-[12px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                <tr>
                  <th className={`border-border-subtle align-middle transition-[width,padding] duration-300 ease-out ${massSelectMode ? "w-12 px-4 py-3 opacity-100" : "w-0 max-w-0 border-0 p-0 opacity-0"} overflow-hidden`}>
                    <span className={`block min-h-5 transition-all duration-300 ease-out ${massSelectMode ? "opacity-100" : "opacity-0"}`} aria-hidden />
                  </th>
                  <th className="px-4 py-3 min-w-[200px]">
                    <button type="button" className={thBtn} onClick={() => toggleSort("keyword")}>Keyword{sortMark("keyword")}</button>
                  </th>
                  <th className="px-4 py-3 text-center">
                    <Tooltip placement="above" content="Search intent: Informational · Navigational · Commercial · Transactional">
                      <span className="uppercase tracking-widest text-[12px] font-bold cursor-default">Intent</span>
                    </Tooltip>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button type="button" className={thBtn} onClick={() => toggleSort("volume")}>Volume{sortMark("volume")}</button>
                  </th>
                  <th className="px-4 py-3 text-center">
                    <Tooltip placement="above" content="Keyword Difficulty (0–100). Higher = harder to rank.">
                      <span className="uppercase tracking-widest text-[12px] font-bold cursor-default">KD</span>
                    </Tooltip>
                  </th>
                  <th className="px-4 py-3 text-center">
                    <Tooltip placement="above" content="Competitor's current ranking position for this keyword.">
                      <span className="uppercase tracking-widest text-[12px] font-bold cursor-default">Rank</span>
                    </Tooltip>
                  </th>
                  <th className="px-4 py-3 text-center">
                    <button type="button" className={thBtn} onClick={() => toggleSort("ai_eval_score")}>AI Score{sortMark("ai_eval_score")}</button>
                  </th>
                  <th className="px-4 py-3">
                    <Tooltip placement="above" content="The competitor's URL currently ranking for this keyword.">
                      <span className="uppercase tracking-widest text-[12px] font-bold cursor-default">Ranking page</span>
                    </Tooltip>
                  </th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/60">
                {displayedGaps.map(g => {
                  const intentTags = [
                    { label: "Informational", abbr: "I", active: Boolean(g.is_informational), color: "text-status-info border-status-info/25 bg-status-info/10" },
                    { label: "Navigational", abbr: "N", active: Boolean(g.is_navigational), color: "text-brand-violet-soft border-brand-violet-soft/25 bg-brand-violet-soft/10" },
                    { label: "Commercial", abbr: "C", active: Boolean(g.is_commercial), color: "text-status-warning border-status-warning/25 bg-status-warning/10" },
                    { label: "Transactional", abbr: "T", active: Boolean(g.is_transactional), color: "text-status-success border-status-success/25 bg-status-success/10" },
                  ].filter(t => t.active);
                  const kd = g.kd;
                  const position = g.position;
                  return (
                    <tr
                      key={g.id}
                      onClick={e => {
                        const t = e.target as HTMLElement;
                        if (t.closest("button, input, select, textarea, label, [data-keyword-action], [role='menu'], [role='menuitem'], [role='listbox'], [role='option'], a")) return;
                        if (massSelectMode && !bulkApprovingGaps) onToggleGapSelected(g.id);
                      }}
                      className={`transition-colors hover:bg-surface-hover ${rejectedGapKeywords.has(g.keyword.toLowerCase()) ? "opacity-75" : ""} ${massSelectMode && !bulkApprovingGaps ? "cursor-pointer" : ""} ${selectedGapIds.has(g.id) ? "bg-surface-secondary/95 ring-1 ring-inset ring-brand-action/25" : ""}`}
                    >
                      <td className={`border-border-subtle align-middle transition-[width,padding] duration-300 ease-out ${massSelectMode ? "w-12 px-4 py-3 opacity-100" : "w-0 max-w-0 border-0 p-0 opacity-0"} overflow-hidden`}>
                        <span className={`flex justify-center transition-all duration-300 ease-out ${massSelectMode ? "opacity-100 scale-100 translate-x-0" : "pointer-events-none -translate-x-2 scale-90 opacity-0"}`}>
                          <input
                            type="checkbox"
                            checked={selectedGapIds.has(g.id)}
                            onChange={() => onToggleGapSelected(g.id)}
                            onClick={e => e.stopPropagation()}
                            disabled={bulkApprovingGaps || !massSelectMode}
                            aria-label={`Select opportunity ${g.keyword}`}
                            className="rounded border-border-subtle text-brand-action focus:ring-brand-action"
                          />
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[240px]">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[14px] font-medium text-text-primary">{g.keyword}</p>
                          {aiGapKeywordSet.has(g.keyword.toLowerCase()) ? (
                            <span className="shrink-0 rounded-full border border-brand-violet/30 bg-brand-violet/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-violet">AI pick</span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[11px] text-text-tertiary">{g.top_competitor_domain}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {intentTags.length > 0 ? intentTags.map(t => (
                            <Tooltip key={t.abbr} placement="above" content={t.label}>
                              <span className={`inline-flex h-5 w-5 cursor-default items-center justify-center rounded-[4px] border text-[10px] font-bold ${t.color}`}>{t.abbr}</span>
                            </Tooltip>
                          )) : <span className="text-[12px] text-text-tertiary">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-[14px] font-mono text-text-secondary tabular-nums">
                        {g.volume > 0 ? g.volume.toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {typeof kd === "number" && kd > 0 ? (
                          <span className={`inline-flex items-center justify-center min-w-[34px] rounded-[4px] border px-1.5 py-0.5 text-[12px] font-bold tabular-nums ${kd >= 70 ? "text-brand-coral border-brand-coral/25 bg-brand-coral/10" : kd >= 40 ? "text-status-warning border-status-warning/25 bg-status-warning/10" : "text-status-success border-status-success/25 bg-status-success/10"}`}>{kd}</span>
                        ) : <span className="text-[12px] text-text-tertiary">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {typeof position === "number" && position > 0 ? (
                          <span className={`inline-flex items-center justify-center min-w-[34px] rounded-[4px] border px-1.5 py-0.5 text-[12px] font-bold tabular-nums ${position <= 3 ? "text-status-success border-status-success/25 bg-status-success/10" : position <= 10 ? "text-status-warning border-status-warning/25 bg-status-warning/10" : "text-text-secondary border-border-subtle bg-surface-elevated"}`}>#{position}</span>
                        ) : <span className="text-[12px] text-text-tertiary">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <GapAiScoreCell gap={g} />
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        {g.top_competitor_url ? (
                          <a href={g.top_competitor_url} target="_blank" rel="noopener noreferrer" title={g.top_competitor_url} className="block truncate text-[12px] text-brand-action/80 hover:text-brand-action hover:underline">
                            {compactUrl(g.top_competitor_url)} ↗
                          </a>
                        ) : <span className="text-[12px] text-text-tertiary">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                        <KeywordActionDropdown
                          status={gapKeywordWorkspaceStatus(g.keyword, approvedGapKeywords, rejectedGapKeywords)}
                          busy={generatingKeyword === g.keyword || bulkApprovingGaps}
                          onChange={next => onGapKeywordStatus(g.keyword, next)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="shrink-0 border-t border-border-subtle bg-surface-secondary px-4 py-2.5 flex items-center justify-between gap-4">
              <span className="text-[12px] text-text-tertiary">
                Showing <span className="font-semibold text-text-secondary">{displayedGaps.length}</span> of{" "}
                <span className="font-semibold text-text-secondary">{allFilteredGaps.length}</span> keywords
              </span>
              <button type="button" onClick={loadMore} className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-elevated px-4 py-1.5 text-[12px] font-medium text-text-secondary shadow-sm transition-colors hover:border-border-strong hover:text-text-primary">
                Load {Math.min(remaining, PAGE_SIZE)} more
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          )}
          {!hasMore && allFilteredGaps.length > 0 && (
            <div className="shrink-0 border-t border-border-subtle bg-surface-secondary px-4 py-2.5 flex items-center justify-between gap-4">
              <span className="text-[12px] text-text-tertiary">
                {allFilteredGaps.length > PAGE_SIZE ? `All ${allFilteredGaps.length} keywords shown` : `${allFilteredGaps.length} keyword${allFilteredGaps.length === 1 ? "" : "s"}`}
              </span>
              <button
                type="button"
                onClick={onLoadMoreAhrefs}
                disabled={loadingMoreAhrefs}
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[12px] font-medium shadow-sm transition-colors disabled:opacity-50 disabled:pointer-events-none ${loadingMoreAhrefs ? "border-brand-action/40 bg-brand-action/10 text-brand-action animate-pulse" : "border-brand-action/30 bg-brand-action/5 text-brand-action hover:bg-brand-action/10 hover:border-brand-action/50"}`}
              >
                {loadingMoreAhrefs ? (
                  <><div className="h-3 w-3 rounded-full border-2 border-brand-action/30 border-t-brand-action animate-spin" />Loading from Ahrefs…</>
                ) : (
                  <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>Load more from Ahrefs</>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
