"use client";

import { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import type { ContentAuditHistoryItem } from "@/frontend/api/content-audit";
import type { ContentAuditReport } from "@/lib/content-audit-studio";
import { CalendarDatePicker } from "@/components/CalendarDatePicker";
import { SeverityChip, EmptyState, scoreColor } from "../_shared/ch-ui";
import { SEVERITY_ORDER } from "./IssuesPanel";
import { useAppSelector, selectAuditGenerationsForProject, selectAuditGeneratingForProject, selectAuditSchedulesForProject } from "@/lib/redux/hooks";
import { normalizeAuditGenerationUrl } from "@/lib/redux/audit-generations-slice";

const SEVERITY_OPTS = ["all", "critical", "high", "medium", "low"] as const;
const TIER_OPTS = ["all", "deep", "quick"] as const;
const TIER_LABEL: Record<(typeof TIER_OPTS)[number], string> = { all: "All", deep: "Deep audit", quick: "Quick scan" };

/** First URL path segment as a category key (e.g. ".../hr-glossary/x" → "hr-glossary"). */
function categoryOf(url: string): string {
  try { return new URL(url).pathname.split("/").filter(Boolean)[0] ?? "other"; }
  catch { return "other"; }
}
function categoryLabel(key: string): string {
  return key.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function AuditHistory({
  projectId, items, loading, total, hasMore, loadingMore, onLoadMore, newUrls,
  onOpen, onDeepAudit, onGenerateFromHistory, onScheduleConfirm, scheduleSaving, scheduledDates,
}: {
  projectId: string;
  items: ContentAuditHistoryItem[];
  loading: boolean;
  total?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  newUrls?: Set<string>;
  onOpen: (item: ContentAuditHistoryItem) => void;
  /** Runs a fresh DEEP audit for a quick-scanned row (replaces its quick data). */
  onDeepAudit: (item: ContentAuditHistoryItem) => void;
  onGenerateFromHistory: (item: ContentAuditHistoryItem) => void;
  onScheduleConfirm: (item: ContentAuditHistoryItem, date: string) => void;
  scheduleSaving: boolean;
  scheduledDates: Set<string>;
}) {
  const router = useRouter();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Anchor for scroll preservation: the first partly-visible row and its offset
  // from the top of the scroll box. Restored after the list changes so new rows
  // arriving during a scan never yank the user's position or their open row.
  const anchorRef = useRef<{ url: string; top: number } | null>(null);
  // Audit-URL → generated-blogId map (kept current by the page via Redux). Lets
  // each row decide between "Generate Enhanced Blog" and "View Blog".
  const generatedMap = useAppSelector(s => selectAuditGenerationsForProject(s, projectId));
  // Audit-URL → in-flight generation jobId map (shared with the full-audit view
  // via Redux). Lets a row show a disabled "Generating…" button in lock-step with
  // the open report, and survives refresh because the page re-hydrates it.
  const generatingMap = useAppSelector(s => selectAuditGeneratingForProject(s, projectId));
  // Audit-URL → { entryId, scheduledDate } map (kept current via Redux). Lets
  // each row show "Scheduled for <date>" instead of re-offering "Schedule to
  // Calendar" for an audit that's already on the calendar.
  const scheduleMap = useAppSelector(s => selectAuditSchedulesForProject(s, projectId));
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<(typeof TIER_OPTS)[number]>("all");
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [scheduleOpenUrl, setScheduleOpenUrl] = useState<string | null>(null);

  // First non-scheduled date, used to seed the mini-calendar so it doesn't
  // default to a date that's already taken.
  const nextVacantDate = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    for (let i = 0; i < 500; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!scheduledDates.has(key)) return key;
    }
    return null;
  }, [scheduledDates]);

  const filtersActive = search.trim().length > 0 || severityFilter !== "all" || categoryFilter !== "all" || tierFilter !== "all";

  // Counts per audit depth for the Depth filter labels (deep = anything not quick).
  const tierCounts = useMemo(() => {
    let quick = 0;
    for (const i of items) if ((i.tier ?? "deep") === "quick") quick++;
    return { all: items.length, quick, deep: items.length - quick };
  }, [items]);

  // Categories present in the loaded rows (first URL path segment), for the filter.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) counts.set(categoryOf(i.url), (counts.get(categoryOf(i.url)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (categoryFilter !== "all") list = list.filter(i => categoryOf(i.url) === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.url.toLowerCase().includes(q) || i.title?.toLowerCase().includes(q) || i.primary_keyword?.toLowerCase().includes(q)
      );
    }
    if (severityFilter !== "all") list = list.filter(i => i.severity === severityFilter);
    if (tierFilter !== "all") list = list.filter(i => (i.tier ?? "deep") === tierFilter);
    return list;
  }, [items, search, severityFilter, categoryFilter, tierFilter]);

  // Infinite scroll — auto-load the next page when the sentinel nears the
  // viewport. Disabled while filtering (client-side search only spans loaded
  // rows), where a "Load more" button widens the pool instead.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || filtersActive || !onLoadMore) return;
    const obs = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) onLoadMore(); },
      { root: scrollRef.current, rootMargin: "300px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, filtersActive, onLoadMore, items.length]);

  // Remember the first visible row as the scroll anchor. Called on scroll and
  // before the list updates. Null when the user is at the very top, so brand-new
  // rows are free to animate in there.
  const captureAnchor = () => {
    const el = scrollRef.current;
    if (!el) { anchorRef.current = null; return; }
    if (el.scrollTop <= 8) { anchorRef.current = null; return; }
    const rows = el.querySelectorAll<HTMLElement>("[data-row-url]");
    for (const row of rows) {
      if (row.offsetTop + row.offsetHeight > el.scrollTop) {
        anchorRef.current = { url: row.dataset.rowUrl ?? "", top: row.offsetTop - el.scrollTop };
        break;
      }
    }
  };

  // After the list changes (new rows prepended during a scan, or a row
  // expanded), restore the anchored row to the same position so the view never
  // jumps out from under the user.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const anchor = anchorRef.current;
    if (!el || !anchor || !anchor.url) return;
    const row = el.querySelector<HTMLElement>(`[data-row-url="${CSS.escape(anchor.url)}"]`);
    if (row) el.scrollTop = row.offsetTop - anchor.top;
  }, [items, expandedUrl]);

  // Skeleton only on the very first load (never while scanning/refreshing, so
  // already-audited rows stay visible and new ones animate in on top).
  if (loading && !items.length) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-[12px] bg-surface-elevated border border-border-subtle animate-pulse" />)}
      </div>
    );
  }

  if (!items.length) {
    return (
      <EmptyState
        icon={<svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>}
        title="No audits yet"
        body="Enter a blog URL or upload content above to run your first audit. Results are saved here for quick reference."
      />
    );
  }

  return (
    <div>
      <h2 className="text-[14px] font-semibold text-text-secondary flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
        </svg>
        Audit History ({total ?? items.length})
      </h2>

      <div className="mb-4 space-y-2.5">
        {/* Search + category + clear */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by URL or keyword…"
              className="w-full h-9 pl-8 pr-3 rounded-[10px] border border-border-subtle bg-surface-elevated text-[12px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-violet/40 transition-all"
            />
          </div>
          {categories.length > 1 && (
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="h-9 px-2.5 rounded-[10px] border border-border-subtle bg-surface-elevated text-[12px] text-text-secondary focus:outline-none focus:border-brand-violet/40 max-w-[180px]"
              title="Filter by category"
            >
              <option value="all">All categories</option>
              {categories.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
            </select>
          )}
          {filtersActive && (
            <button
              type="button"
              onClick={() => { setSearch(""); setSeverityFilter("all"); setCategoryFilter("all"); setTierFilter("all"); }}
              className="h-9 px-3 rounded-[10px] border border-border-subtle bg-surface-elevated text-[12px] font-medium text-text-tertiary hover:text-text-primary transition-all inline-flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              Clear
            </button>
          )}
        </div>

        {/* Labelled segmented filters — each group has its own label so the two
            "All" options can't be confused for one another. */}
        <div className="flex gap-x-5 gap-y-2 flex-wrap items-center">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary">Depth</span>
            <div className="inline-flex gap-0.5 rounded-[10px] border border-border-subtle bg-surface-secondary/60 p-0.5">
              {TIER_OPTS.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTierFilter(t)}
                  className={`h-7 px-2.5 rounded-[8px] text-[11px] font-semibold transition-all inline-flex items-center gap-1 ${
                    tierFilter === t ? "bg-surface-elevated text-text-primary shadow-sm ring-1 ring-border-subtle" : "text-text-tertiary hover:text-text-secondary"
                  }`}
                >
                  {TIER_LABEL[t]}
                  <span className={`tabular-nums ${tierFilter === t ? "text-text-tertiary" : "text-text-tertiary/70"}`}>{tierCounts[t]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary">Severity</span>
            <div className="inline-flex gap-0.5 rounded-[10px] border border-border-subtle bg-surface-secondary/60 p-0.5">
              {SEVERITY_OPTS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverityFilter(s)}
                  className={`h-7 px-2.5 rounded-[8px] text-[11px] font-semibold transition-all ${
                    severityFilter === s ? "bg-surface-elevated text-text-primary shadow-sm ring-1 ring-border-subtle" : "text-text-tertiary hover:text-text-secondary"
                  }`}
                >
                  {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {filtered.length === 0 && <p className="text-[13px] text-text-tertiary py-4 text-center">No results match your filters.</p>}

      <div ref={scrollRef} onScroll={captureAnchor} className="space-y-2 max-h-[70vh] overflow-y-auto pr-1" style={{ overflowAnchor: "none" }}>
        <AnimatePresence initial={false}>
        {filtered.map(item => {
          const score = item.overall_score || item.health_score;
          const color = scoreColor(score);
          const isExpanded = expandedUrl === item.url;
          const isNew = newUrls?.has(item.url) ?? false;
          const tier = item.tier ?? "deep";
          const isQuick = tier === "quick";
          // Only real, completed audits ('ok') can be enhanced/scheduled — never a
          // page we flagged as non-article / unreachable.
          const isReal = (((item.report as ContentAuditReport | null)?.page_status as string | undefined) ?? "ok") === "ok";
          // If an enhanced blog already exists for this audited URL, show "View
          // Blog" instead of "Generate Enhanced Blog".
          const generatedBlogId = isReal ? (generatedMap[normalizeAuditGenerationUrl(item.url)] ?? null) : null;
          const isGenerating = isReal && !generatedBlogId && Boolean(generatingMap[normalizeAuditGenerationUrl(item.url)]);
          const schedule = isReal ? (scheduleMap[normalizeAuditGenerationUrl(item.url)] ?? null) : null;
          const issueList = (item.report?.issues ?? []) as ContentAuditReport["issues"];
          const sortedIssues = [...issueList].sort(
            (a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
          );

          return (
            <motion.div
              key={item.url}
              data-row-url={item.url}
              layout
              initial={{ opacity: 0, y: -14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className={`rounded-[12px] border overflow-hidden transition-colors ${
                isNew ? "border-brand-violet/60 ring-1 ring-brand-violet/30 bg-brand-violet/[0.04]" : "border-border-subtle bg-surface-elevated"
              }`}
            >
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-hover transition-colors"
                onClick={() => { captureAnchor(); setExpandedUrl(isExpanded ? null : item.url); }}
              >
                <div className="shrink-0">
                  <span className="text-[16px] font-bold tabular-nums" style={{ color }}>{score}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-text-primary leading-snug truncate flex items-center gap-2">
                    {isNew && (
                      <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-brand-violet/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-violet">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-violet opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-violet" />
                        </span>
                        New
                      </span>
                    )}
                    <span className="truncate">{item.title || item.url}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${item.source === "upload" ? "text-brand-violet" : "text-text-tertiary"}`}>
                      {item.source === "upload" ? (
                        <><svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 7.5 12 3m0 0L7.5 7.5M12 3v13.5" /></svg> Uploaded</>
                      ) : (
                        <><svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757" /></svg> Link</>
                      )}
                    </span>
                    <p className="text-[11px] text-text-tertiary truncate">{item.source === "upload" ? "Uploaded content" : item.url}</p>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {isQuick && (
                    <span className="inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      Quick scan
                    </span>
                  )}
                  {item.severity && item.severity !== "none" && <SeverityChip severity={item.severity} />}
                  <span className="text-[10px] text-text-tertiary">{new Date(item.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  <svg className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-border-subtle/50">
                  <div className="max-h-[420px] overflow-y-auto p-4 space-y-4">
                    {item.plain_language_verdict && (
                      <p className="text-[13px] text-text-secondary leading-relaxed">{item.plain_language_verdict}</p>
                    )}

                    {item.report && (
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {(["seo", "geo", "aeo", "content_quality", "keyword_relevance", "freshness"] as const).map(k => {
                          const sc = (item.report!.scores as unknown as Record<string, number>)[k] ?? 0;
                          const lbl: Record<string, string> = { seo: "SEO", geo: "GEO", aeo: "AEO", content_quality: "Quality", keyword_relevance: "Keyword", freshness: "Fresh" };
                          return (
                            <div key={k} className="rounded-[8px] border border-border-subtle bg-surface-secondary/40 px-2 py-1.5 text-center">
                              <div className="text-[14px] font-bold tabular-nums" style={{ color: scoreColor(sc) }}>{sc}</div>
                              <div className="text-[9px] text-text-tertiary uppercase tracking-wide">{lbl[k]}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {sortedIssues.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary">
                          Top issues ({sortedIssues.length})
                        </p>
                        <div className="grid gap-1">
                          {sortedIssues.slice(0, 3).map((issue, i) => (
                            <div key={i} className="flex items-center gap-2 rounded-[8px] border border-border-subtle/50 bg-surface-secondary/30 px-3 py-1.5 min-w-0">
                              <SeverityChip severity={issue.severity} />
                              <span className="text-[12px] font-medium text-text-primary truncate">{issue.title}</span>
                            </div>
                          ))}
                        </div>
                        {sortedIssues.length > 3 && (
                          <p className="text-[11px] text-text-tertiary text-center py-0.5">
                            +{sortedIssues.length - 3} more — click &quot;View full audit&quot; to see details
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="px-4 py-3 border-t border-border-subtle/30 flex items-center gap-2 flex-wrap bg-surface-secondary/20">
                    {isQuick ? (
                      // Quick-scan rows only ran fixed, LLM-free parameters — no
                      // competitor data or rewrite brief exists yet. A deep audit
                      // is required before this URL can be scheduled or enhanced.
                      <button
                        type="button"
                        onClick={() => onDeepAudit(item)}
                        className="h-8 px-3 rounded-[8px] bg-brand-violet text-white text-[12px] font-semibold hover:bg-brand-violet/90 transition-all flex items-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z" />
                        </svg>
                        Deep Audit
                      </button>
                    ) : (
                      <>
                        {generatedBlogId ? (
                          <button
                            type="button"
                            onClick={() => router.push(`/projects/${projectId}/content-history/${generatedBlogId}`)}
                            className="h-8 px-3 rounded-[8px] bg-status-success text-white text-[12px] font-semibold hover:opacity-90 transition-all flex items-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                            </svg>
                            View Blog
                          </button>
                        ) : isGenerating ? (
                          <button
                            type="button"
                            disabled
                            className="h-8 px-3 rounded-[8px] bg-brand-violet/70 text-white text-[12px] font-semibold flex items-center gap-1.5 cursor-default"
                          >
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                            Generating…
                          </button>
                        ) : isReal ? (
                          <button
                            type="button"
                            onClick={() => onGenerateFromHistory(item)}
                            className="h-8 px-3 rounded-[8px] bg-brand-violet text-white text-[12px] font-semibold hover:bg-brand-violet/90 transition-all flex items-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09z" />
                            </svg>
                            Generate Blog
                          </button>
                        ) : null}
                        {isReal && (
                          schedule ? (
                            <span className="h-8 px-3 rounded-[8px] bg-status-success/10 border border-status-success/20 text-[12px] font-medium text-status-success flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                              </svg>
                              {new Date(schedule.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          ) : (
                            <CalendarDatePicker
                              open={scheduleOpenUrl === item.url}
                              onOpenChange={v => setScheduleOpenUrl(v ? item.url : null)}
                              currentDate={nextVacantDate}
                              onConfirm={date => onScheduleConfirm(item, date)}
                              saving={scheduleSaving}
                              scheduledDates={scheduledDates}
                              variant="pick"
                              label="Schedule"
                              className="h-8 px-3 rounded-[8px] border border-border-subtle bg-surface-secondary text-[12px] font-medium text-text-secondary hover:text-text-primary hover:border-border-strong disabled:opacity-50 transition-all flex items-center gap-1.5"
                            />
                          )
                        )}
                        <button
                          type="button"
                          onClick={() => onOpen(item)}
                          className="h-8 px-3 rounded-[8px] border border-border-subtle bg-surface-secondary text-[12px] font-medium text-text-tertiary hover:text-text-primary transition-all flex items-center gap-1.5"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                          </svg>
                          View full audit
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
        </AnimatePresence>

        {/* Pagination — infinite-scroll sentinel + explicit "Load more" fallback. */}
        {hasMore && !filtersActive && (
          <div ref={sentinelRef} className="pt-3 flex justify-center">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full border border-border-subtle bg-surface-elevated text-[12px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-secondary disabled:opacity-60 transition-all"
            >
              {loadingMore ? (
                <><span className="inline-block h-3 w-3 animate-spin rounded-full border-[2px] border-border-subtle border-t-text-secondary" /> Loading…</>
              ) : (
                <>Load more ({(total ?? items.length) - items.length} left)</>
              )}
            </button>
          </div>
        )}
        {!hasMore && !filtersActive && items.length > HISTORY_VISIBLE_HINT && (
          <p className="pt-3 pb-1 text-center text-[11px] text-text-tertiary">That&apos;s all {total ?? items.length} audits.</p>
        )}
      </div>
    </div>
  );
}

const HISTORY_VISIBLE_HINT = 10;
