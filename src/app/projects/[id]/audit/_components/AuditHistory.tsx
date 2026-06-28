"use client";

import { useState, useMemo } from "react";
import type { ContentAuditHistoryItem } from "@/frontend/api/content-audit";
import type { ContentAuditReport } from "@/lib/content-audit-studio";
import { SeverityChip, EmptyState, scoreColor } from "../_shared/ch-ui";
import { SEVERITY_ORDER } from "./IssuesPanel";

const SEVERITY_OPTS = ["all", "critical", "high", "medium", "low"] as const;

export function AuditHistory({
  items, loading, onOpen, onGenerateFromHistory, onScheduleFromHistory,
}: {
  items: ContentAuditHistoryItem[];
  loading: boolean;
  onOpen: (item: ContentAuditHistoryItem) => void;
  onGenerateFromHistory: (item: ContentAuditHistoryItem) => void;
  onScheduleFromHistory: (item: ContentAuditHistoryItem) => void;
}) {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.url.toLowerCase().includes(q) || i.title?.toLowerCase().includes(q) || i.primary_keyword?.toLowerCase().includes(q)
      );
    }
    if (severityFilter !== "all") list = list.filter(i => i.severity === severityFilter);
    return list;
  }, [items, search, severityFilter]);

  if (loading) {
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
        Audit History ({items.length})
      </h2>

      <div className="flex gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by URL or keyword…"
            className="w-full h-8 pl-8 pr-3 rounded-[8px] border border-border-subtle bg-surface-elevated text-[12px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-violet/40 transition-all"
          />
        </div>
        <div className="flex gap-1">
          {SEVERITY_OPTS.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverityFilter(s)}
              className={`h-8 px-3 rounded-[8px] text-[11px] font-medium transition-all ${
                severityFilter === s ? "bg-brand-violet text-white" : "border border-border-subtle bg-surface-elevated text-text-tertiary hover:text-text-primary"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && <p className="text-[13px] text-text-tertiary py-4 text-center">No results match your filters.</p>}

      <div className="space-y-2">
        {filtered.slice(0, 20).map(item => {
          const score = item.overall_score || item.health_score;
          const color = scoreColor(score);
          const isExpanded = expandedUrl === item.url;
          // Only real, completed audits ('ok') can be enhanced/scheduled — never a
          // page we flagged as non-article / unreachable.
          const isReal = (((item.report as ContentAuditReport | null)?.page_status as string | undefined) ?? "ok") === "ok";
          const issueList = (item.report?.issues ?? []) as ContentAuditReport["issues"];
          const sortedIssues = [...issueList].sort(
            (a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
          );

          return (
            <div key={item.url} className="rounded-[12px] border border-border-subtle bg-surface-elevated overflow-hidden transition-all">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-hover transition-colors"
                onClick={() => setExpandedUrl(isExpanded ? null : item.url)}
              >
                <div className="shrink-0">
                  <span className="text-[16px] font-bold tabular-nums" style={{ color }}>{score}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-text-primary leading-snug truncate">{item.title || item.url}</p>
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
                    {isReal && (
                      <>
                        <button
                          type="button"
                          onClick={() => onGenerateFromHistory(item)}
                          className="h-8 px-3 rounded-[8px] bg-brand-violet text-white text-[12px] font-semibold hover:bg-brand-violet/90 transition-all flex items-center gap-1.5"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09z" />
                          </svg>
                          Generate Enhanced Blog
                        </button>
                        <button
                          type="button"
                          onClick={() => onScheduleFromHistory(item)}
                          className="h-8 px-3 rounded-[8px] border border-border-subtle bg-surface-secondary text-[12px] font-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition-all flex items-center gap-1.5"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                          </svg>
                          Schedule to Calendar
                        </button>
                      </>
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
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
