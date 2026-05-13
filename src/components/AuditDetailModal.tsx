"use client";

import { useEffect, useMemo, useState } from "react";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import type { PersistedBlogAudit } from "@/app/actions/audit-actions";
import type { IssueCategory, QualityRubricRow } from "@/lib/content-audit";
import { criticalityFromScore } from "@/lib/audit-criticality";
import { extractCalendarFocusKeyword } from "@/lib/content-health-calendar";

const SEVERITY_COLORS: Record<"high" | "medium" | "low", string> = {
  high: "border-rose-500/30 bg-rose-500/10 text-rose-400",
  medium: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
  low: "border-accent-500/30 bg-accent-500/10 text-accent-400",
};

const CATEGORY_META: Record<IssueCategory, { label: string; icon: string; color: string }> = {
  technical: { label: "Technical", icon: "⚙️", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" },
  seo: { label: "SEO", icon: "🎯", color: "text-brand-400 bg-brand-500/10 border-brand-500/30" },
  content: { label: "Content", icon: "📝", color: "text-accent-400 bg-accent-500/10 border-accent-500/30" },
  keyword_demand: { label: "Keyword demand", icon: "📈", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" },
  ux: { label: "Reader experience", icon: "👁", color: "text-pink-400 bg-pink-500/10 border-pink-500/30" },
};

const CATEGORY_ORDER: IssueCategory[] = ["technical", "keyword_demand", "seo", "content", "ux"];

const RUBRIC_STATUS: Record<QualityRubricRow["status"], { label: string; className: string }> = {
  pass: { label: "Pass", className: "border-accent-500/40 bg-accent-500/10 text-accent-400" },
  warn: { label: "Warn", className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400" },
  fail: { label: "Fail", className: "border-rose-500/40 bg-rose-500/10 text-rose-400" },
};

function groupIssuesByCategory(
  issues: PersistedBlogAudit["analysis"]["issues"]
): Partial<Record<IssueCategory, PersistedBlogAudit["analysis"]["issues"]>> {
  const out: Partial<Record<IssueCategory, PersistedBlogAudit["analysis"]["issues"]>> = {};
  for (const i of issues) {
    const cat: IssueCategory = (i.category as IssueCategory) ?? "content";
    (out[cat] ||= []).push(i);
  }
  return out;
}

function healthColor(score: number): string {
  if (score >= 75) return "text-accent-400";
  if (score >= 50) return "text-yellow-400";
  return "text-rose-400";
}

type Tab = "issues" | "checklist" | "more";

export interface AuditDetailModalProps {
  open: boolean;
  row: PersistedBlogAudit | null;
  loading?: boolean;
  projectId: string;
  onClose: () => void;
  onScheduleToCalendar: () => Promise<void>;
  scheduleBusy: boolean;
  onCalendar: boolean;
}

export function AuditDetailModal({
  open,
  row,
  loading = false,
  projectId,
  onClose,
  onScheduleToCalendar,
  scheduleBusy,
  onCalendar,
}: AuditDetailModalProps) {
  const [tab, setTab] = useState<Tab>("issues");

  useEffect(() => {
    if (open) setTab("issues");
  }, [open, row?.url]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const grouped = useMemo(() => (row ? groupIssuesByCategory(row.analysis.issues) : {}), [row]);

  const flatNumberedIssues = useMemo(() => {
    if (!row) return [] as Array<{ n: number; issue: PersistedBlogAudit["analysis"]["issues"][number] }>;
    let n = 0;
    const out: Array<{ n: number; issue: PersistedBlogAudit["analysis"]["issues"][number] }> = [];
    for (const cat of CATEGORY_ORDER) {
      const list = grouped[cat];
      if (!list?.length) continue;
      for (const issue of list) {
        n += 1;
        out.push({ n, issue });
      }
    }
    return out;
  }, [row, grouped]);

  if (!open) return null;

  if (loading || !row) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Loading audit details"
        className="fixed inset-0 z-80 flex items-start justify-center overflow-y-auto bg-surface-primary/85 p-3 backdrop-blur-sm sm:p-6 animate-fade-in"
        onClick={onClose}
      >
        <div
          className="relative my-4 flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-secondary shadow-2xl shadow-black/60 animate-scale-in"
          style={{ maxHeight: "calc(100vh - 3rem)" }}
          onClick={e => e.stopPropagation()}
        >
          <header className="flex items-start justify-between gap-3 border-b border-border-subtle bg-surface-secondary/95 p-5">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-3 w-32 rounded-full bg-surface-elevated animate-pulse" />
              <div className="h-4 w-64 rounded-full bg-surface-elevated animate-pulse" />
              <div className="h-7 w-80 rounded-lg bg-surface-elevated animate-pulse" />
              <div className="flex gap-2">
                <div className="h-5 w-20 rounded-full bg-surface-elevated animate-pulse" />
                <div className="h-5 w-12 rounded-full bg-surface-elevated animate-pulse" />
              </div>
            </div>
            <button type="button" aria-label="Close" onClick={onClose}
              className="shrink-0 rounded-xl border border-border-subtle bg-surface-elevated p-2 text-text-tertiary shadow-sm transition-all hover:border-rose-400/35 hover:bg-rose-500/10 hover:text-rose-300">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </header>
          <div className="p-5 space-y-4">
            <div className="rounded-xl border border-border-subtle bg-surface-tertiary/40 p-4 space-y-2">
              <div className="h-3 w-16 rounded-full bg-surface-elevated animate-pulse" />
              <div className="h-4 w-full rounded-full bg-surface-elevated animate-pulse" />
              <div className="h-4 w-3/4 rounded-full bg-surface-elevated animate-pulse" />
            </div>
            <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-secondary/50">
              <div className="flex gap-1 border-b border-border-subtle bg-surface-tertiary/50 p-1.5">
                {[80, 96, 72].map((w, i) => (
                  <div key={i} className="h-7 rounded-lg bg-surface-elevated animate-pulse" style={{ width: w }} />
                ))}
              </div>
              <div className="p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl border border-border-subtle bg-surface-elevated/80 animate-pulse" />
                ))}
              </div>
            </div>
          </div>
          <footer className="flex items-center justify-end gap-3 border-t border-border-subtle bg-surface-secondary/95 p-4">
            <div className="h-9 w-16 rounded-xl bg-surface-elevated animate-pulse" />
            <div className="h-9 w-36 rounded-xl bg-surface-elevated animate-pulse" />
          </footer>
        </div>
      </div>
    );
  }

  const a = row.analysis;
  const crit = criticalityFromScore(row.health_score, a.page_status);
  const focus = extractCalendarFocusKeyword(row);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Content health: ${row.title || row.url}`}
      className="fixed inset-0 z-80 flex items-start justify-center overflow-y-auto bg-surface-primary/85 p-3 backdrop-blur-sm sm:p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative my-4 flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-secondary shadow-2xl shadow-black/60 animate-scale-in"
        style={{ maxHeight: "calc(100vh - 3rem)" }}
        onClick={e => e.stopPropagation()}
      >
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle bg-surface-secondary/95 p-5 backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">Content health · AI diagnosis</p>
            <a
              href={row.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block break-all text-[12px] font-medium leading-snug text-brand-action underline-offset-2 hover:underline"
              title={row.url}
            >
              {row.url}
            </a>
            <h2 className="mt-3 wrap-break-word text-xl font-bold text-text-primary md:text-2xl leading-snug">
              {row.title || "Untitled page"}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary">
              <span className={`rounded-full border px-2 py-0.5 font-bold uppercase ${SEVERITY_COLORS[crit]}`}>{crit}</span>
              <span className={`text-lg font-black tabular-nums ${healthColor(row.health_score)}`}>{row.health_score}</span>
              <span className="text-text-tertiary">/ 100</span>
              <span className="rounded-full border border-brand-action/25 bg-brand-action/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-brand-action">
                Calendar keyword: {focus}
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-border-subtle bg-surface-elevated p-2 text-text-tertiary shadow-sm transition-all hover:border-rose-400/35 hover:bg-rose-500/10 hover:text-rose-300 hover:shadow-md"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {(a.plain_language_verdict || a.summary) && (
            <div className="m-5 rounded-xl border border-border-subtle bg-surface-tertiary/40 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1">Summary</p>
              <p className="text-sm text-text-primary leading-relaxed">
                {a.plain_language_verdict?.trim() || a.summary}
              </p>
            </div>
          )}

          <div className="px-5 pb-2">
            <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-secondary/50">
              <div className="flex flex-wrap gap-1 border-b border-border-subtle bg-surface-tertiary/50 p-1.5">
                {(
                  [
                    ["issues", "Issues & fixes", flatNumberedIssues.length],
                    ["checklist", "Quality checklist", a.quality_rubric?.length ?? 0],
                    ["more", "Gaps & links", a.content_gaps.length + a.internal_link_opportunities.length],
                  ] as const
                ).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      tab === key
                        ? "bg-gradient-to-r from-brand-primary to-brand-action text-brand-on-primary shadow-md shadow-brand-primary/25 ring-1 ring-white/10"
                        : "text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary hover:ring-1 hover:ring-border-subtle"
                    }`}
                  >
                    {label}
                    <span
                      className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        tab === key ? "bg-white/20 text-white" : "bg-surface-elevated text-text-tertiary"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="p-4">
                {tab === "issues" && (
                  <ul className="max-h-[min(52vh,480px)] space-y-2 overflow-y-auto pr-1">
                    {flatNumberedIssues.length === 0 ? (
                      <li className="text-sm text-text-tertiary">No issues recorded for this URL.</li>
                    ) : (
                      flatNumberedIssues.map(({ n, issue }) => {
                        const meta = CATEGORY_META[(issue.category as IssueCategory) ?? "content"];
                        return (
                          <li
                            key={`${n}-${issue.label}`}
                            className="grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-border-subtle bg-surface-elevated/80 p-3 shadow-sm"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-action/15 text-xs font-black text-brand-action">
                              {n}
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${SEVERITY_COLORS[issue.severity]}`}
                                >
                                  {issue.severity}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${meta.color}`}
                                >
                                  {meta.icon} {meta.label}
                                </span>
                                <span className="text-xs font-bold text-text-primary">{issue.label}</span>
                              </div>
                              {issue.detail && (
                                <p className="mt-1.5 text-[12px] text-text-secondary leading-relaxed">{issue.detail}</p>
                              )}
                              {issue.fix && (
                                <p className="mt-1.5 text-[12px] text-accent-400 leading-relaxed">
                                  <span className="font-bold text-text-secondary">Fix · </span>
                                  {issue.fix}
                                </p>
                              )}
                            </div>
                          </li>
                        );
                      })
                    )}
                  </ul>
                )}

                {tab === "checklist" && (
                  <ul className="max-h-[min(52vh,480px)] space-y-2 overflow-y-auto">
                    {!(a.quality_rubric && a.quality_rubric.length) ? (
                      <li className="text-sm text-text-tertiary">No rubric rows for this audit.</li>
                    ) : (
                      a.quality_rubric!.map((rubricRow, idx) => {
                        const meta = RUBRIC_STATUS[rubricRow.status];
                        return (
                          <li
                            key={rubricRow.id}
                            className="flex gap-3 rounded-xl border border-border-subtle bg-surface-elevated/80 px-3 py-2.5"
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-tertiary text-[11px] font-bold text-text-tertiary">
                              {idx + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <span
                                className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${meta.className}`}
                              >
                                {meta.label}
                              </span>
                              <p className="mt-1 text-[13px] font-medium text-text-primary">{rubricRow.label}</p>
                              <p className="text-[12px] text-text-tertiary leading-relaxed">{rubricRow.detail}</p>
                            </div>
                          </li>
                        );
                      })
                    )}
                  </ul>
                )}

                {tab === "more" && (
                  <div className="max-h-[min(52vh,480px)] space-y-5 overflow-y-auto pr-1">
                    {a.content_gaps.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">Content gaps</p>
                        <ol className="list-decimal space-y-1 pl-5 text-[13px] text-text-secondary">
                          {a.content_gaps.map((g, i) => (
                            <li key={i} className="leading-relaxed">
                              {g}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {a.internal_link_opportunities.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                          Suggested internal links
                        </p>
                        <ul className="space-y-2">
                          {a.internal_link_opportunities.map((l, i) => (
                            <li key={l.target_url} className="rounded-lg border border-border-subtle bg-surface-elevated/50 p-2">
                              <div className="flex gap-2">
                                <span className="shrink-0 text-[11px] font-bold text-text-tertiary">{i + 1}.</span>
                                <div className="min-w-0 flex-1">
                                  <a
                                    href={l.target_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="line-clamp-2 break-all text-[12px] font-semibold text-brand-action hover:underline"
                                    title={l.target_url}
                                  >
                                    {l.target_url}
                                  </a>
                                  {l.reason && (
                                    <p className="mt-0.5 text-[11px] text-text-tertiary leading-snug">{l.reason}</p>
                                  )}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {a.secondary_keywords.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                          Secondary keywords
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {a.secondary_keywords.map(k => (
                            <span
                              key={k}
                              className="rounded-full border border-border-subtle bg-surface-elevated px-2 py-0.5 text-[11px] text-text-secondary"
                            >
                              {k}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {!a.content_gaps.length && !a.internal_link_opportunities.length && !a.secondary_keywords.length && (
                      <p className="text-sm text-text-tertiary">No extra signals for this URL.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-surface-secondary/95 p-4 backdrop-blur">
          <p className="text-[11px] text-text-tertiary max-w-md">
            Scheduling places this audit (keyword + fixes) on the next open calendar day. Generation applies those fixes surgically — not a full rewrite unless the issues require it.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border-strong bg-surface-elevated px-4 py-2.5 text-xs font-bold text-text-secondary shadow-sm transition-all hover:border-text-tertiary hover:bg-surface-hover hover:text-text-primary"
            >
              Close
            </button>
            {onCalendar ? (
              <ProjectNavLink
                href={`/projects/${projectId}/calendar`}
                className="inline-flex items-center justify-center rounded-xl border border-accent-400/50 bg-gradient-to-r from-accent-500/25 to-cyan-500/20 px-5 py-2.5 text-xs font-bold text-accent-300 shadow-md shadow-accent-500/10 transition-all hover:border-accent-300/60 hover:from-accent-500/35 hover:to-cyan-500/30"
              >
                Open calendar
              </ProjectNavLink>
            ) : (
              <button
                type="button"
                disabled={scheduleBusy}
                onClick={() => void onScheduleToCalendar()}
                className="inline-flex min-w-[148px] items-center justify-center rounded-xl bg-gradient-to-r from-brand-primary via-brand-action to-violet-600 px-5 py-2.5 text-xs font-bold text-brand-on-primary shadow-lg shadow-brand-primary/30 ring-1 ring-white/15 transition-all hover:opacity-95 hover:shadow-brand-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {scheduleBusy ? "Scheduling…" : "Schedule repair"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
