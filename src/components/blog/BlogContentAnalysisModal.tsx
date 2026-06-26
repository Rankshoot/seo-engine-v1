"use client";

import { useState, useEffect } from "react";
import type { BlogContentAnalysis } from "@/app/actions/blog-actions";

// ─── Constants ─────────────────────────────────────────────────────────────

const ISSUE_SEVERITY_COLORS: Record<"high" | "medium" | "low", string> = {
  high:   "border-status-danger/30 bg-status-danger/10 text-status-danger",
  medium: "border-status-warning/30 bg-status-warning/10 text-status-warning",
  low:    "border-status-success/30 bg-status-success/10 text-status-success",
};

const ISSUE_CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  technical: { label: "Technical", icon: "⚙️", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30"    },
  seo:       { label: "SEO",       icon: "🎯", color: "text-blue-400 bg-blue-500/10 border-blue-500/30"    },
  content:   { label: "Content",   icon: "📝", color: "text-violet-400 bg-violet-500/10 border-violet-500/30" },
  ux:        { label: "Reader UX", icon: "👁",  color: "text-pink-400 bg-pink-500/10 border-pink-500/30"   },
};

const RUBRIC_STATUS_META: Record<string, { label: string; cls: string }> = {
  pass: { label: "Pass", cls: "border-status-success/40 bg-status-success/10 text-status-success" },
  warn: { label: "Warn", cls: "border-status-warning/40 bg-status-warning/10 text-status-warning"  },
  fail: { label: "Fail", cls: "border-status-danger/40 bg-status-danger/10 text-status-danger"     },
};

export const CONCLUSION_META = {
  ready_to_publish: {
    label: "Ready to publish",
    icon: "✓",
    cls: "border-status-success/30 bg-status-success/8 text-status-success",
    dot: "bg-status-success",
  },
  needs_minor_fixes: {
    label: "Needs minor fixes",
    icon: "⚠",
    cls: "border-status-warning/30 bg-status-warning/8 text-status-warning",
    dot: "bg-status-warning",
  },
  needs_major_work: {
    label: "Needs major work",
    icon: "✕",
    cls: "border-status-danger/30 bg-status-danger/8 text-status-danger",
    dot: "bg-status-danger",
  },
} as const;

// ─── Component ─────────────────────────────────────────────────────────────

interface BlogContentAnalysisModalProps {
  open: boolean;
  analysis: BlogContentAnalysis | null;
  loading: boolean;
  error: string;
  isStale: boolean;
  onClose: () => void;
  onReanalyse: () => void;
  onGenerateEnhanced: () => void;
  onSchedule: () => void;
  reanalysing: boolean;
  enhancing: boolean;
  scheduling: boolean;
}

export function BlogContentAnalysisModal({
  open,
  analysis,
  loading,
  error,
  isStale,
  onClose,
  onReanalyse,
  onGenerateEnhanced,
  onSchedule,
  reanalysing,
  enhancing,
  scheduling,
}: BlogContentAnalysisModalProps) {
  const [tab, setTab] = useState<"issues" | "rubric" | "gaps">("issues");

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const busy = loading || reanalysing;
  const conclusion = analysis?.conclusion;
  const conclusionMeta = conclusion ? CONCLUSION_META[conclusion.verdict] : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-80 flex items-start justify-center overflow-y-auto bg-surface-primary/85 p-3 backdrop-blur-sm sm:p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative my-4 flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-secondary shadow-2xl shadow-black/60 animate-scale-in"
        style={{ maxHeight: "calc(100vh - 3rem)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-border-subtle bg-surface-secondary/95 p-5 backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">Content analysis · AI diagnosis</p>
            <h2 className="mt-1 text-xl font-bold text-text-primary">Content Health Report</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(analysis || error) && (
              <button
                type="button"
                onClick={onReanalyse}
                disabled={busy}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-semibold transition-all disabled:opacity-40 ${
                  isStale
                    ? "border-status-warning/40 bg-status-warning/8 text-status-warning hover:bg-status-warning/15"
                    : "border-border-subtle bg-surface-elevated text-text-secondary hover:text-text-primary hover:border-border-strong"
                }`}
              >
                <svg className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                {busy ? "Analysing…" : isStale ? "Content changed — re-analyse" : "Re-analyse"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border-subtle bg-surface-elevated p-2 text-text-tertiary shadow-sm transition-all hover:border-status-danger/35 hover:bg-status-danger/10 hover:text-status-danger"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {busy && (
            <div className="flex flex-col items-center justify-center gap-4 py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-subtle border-t-brand-action" />
              <p className="text-[13px] text-text-tertiary">Analysing content with Gemini…</p>
            </div>
          )}
          {error && !busy && (
            <div className="m-5 rounded-xl border border-status-danger/30 bg-status-danger/10 p-4 text-[13px] text-status-danger">
              {error}
            </div>
          )}
          {analysis && !busy && (
            <>
              {/* Conclusion banner */}
              {conclusionMeta && conclusion && (
                <div className={`mx-5 mt-5 rounded-xl border p-4 ${conclusionMeta.cls}`}>
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black ${conclusionMeta.cls}`}>
                      {conclusionMeta.icon}
                    </span>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider opacity-70 mb-0.5">Conclusion</p>
                      <p className="text-[14px] font-bold leading-snug">{conclusionMeta.label}</p>
                    </div>
                  </div>
                  <p className="mt-2.5 text-[13px] leading-relaxed opacity-90">{conclusion.summary}</p>
                </div>
              )}

              {/* Verdict */}
              <div className="mx-5 mt-3 rounded-xl border border-border-subtle bg-surface-tertiary/40 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1">Diagnosis</p>
                <p className="text-sm text-text-primary leading-relaxed">{analysis.plain_language_verdict}</p>
              </div>

              {/* Quick wins */}
              {analysis.quick_wins?.length > 0 && (
                <div className="mx-5 mt-3 mb-1 rounded-xl border border-status-success/20 bg-status-success/5 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-status-success mb-2">Quick wins</p>
                  <ul className="space-y-1">
                    {analysis.quick_wins.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] text-text-secondary">
                        <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tabs */}
              <div className="px-5 py-3">
                <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-secondary/50">
                  <div className="flex flex-wrap gap-1 border-b border-border-subtle bg-surface-tertiary/50 p-1.5">
                    {([
                      ["issues", "Issues & fixes",      analysis.issues.length],
                      ["rubric", "Quality checklist",   analysis.quality_rubric?.length ?? 0],
                      ["gaps",   "Content gaps",        analysis.content_gaps?.length ?? 0],
                    ] as const).map(([key, label, count]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                          tab === key
                            ? "bg-brand-action text-brand-on-primary shadow-md"
                            : "text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary"
                        }`}
                      >
                        {label}
                        <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === key ? "bg-white/20 text-white" : "bg-surface-elevated text-text-tertiary"}`}>
                          {count}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="p-4">
                    {tab === "issues" && (
                      <ul className="max-h-[min(48vh,460px)] space-y-2 overflow-y-auto pr-1">
                        {analysis.issues.length === 0 ? (
                          <li className="flex items-center gap-2 py-4 text-sm text-status-success">
                            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                            No genuine issues found — this content is in great shape.
                          </li>
                        ) : analysis.issues.map((issue, n) => {
                          const cat = ISSUE_CATEGORY_META[issue.category] ?? ISSUE_CATEGORY_META.content;
                          return (
                            <li key={n} className="grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-border-subtle bg-surface-elevated/80 p-3 shadow-sm">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-action/15 text-xs font-black text-brand-action">{n + 1}</span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${ISSUE_SEVERITY_COLORS[issue.severity]}`}>{issue.severity}</span>
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${cat.color}`}>{cat.icon} {cat.label}</span>
                                  <span className="text-xs font-bold text-text-primary">{issue.label}</span>
                                </div>
                                {issue.detail && <p className="mt-1.5 text-[12px] text-text-secondary leading-relaxed">{issue.detail}</p>}
                                {issue.fix && (
                                  <p className="mt-1.5 text-[12px] text-status-success leading-relaxed">
                                    <span className="font-bold text-text-secondary">Fix · </span>{issue.fix}
                                  </p>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {tab === "rubric" && (
                      <ul className="max-h-[min(48vh,460px)] space-y-2 overflow-y-auto">
                        {!analysis.quality_rubric?.length ? (
                          <li className="text-sm text-text-tertiary">No rubric data.</li>
                        ) : analysis.quality_rubric.map((row, i) => {
                          const meta = RUBRIC_STATUS_META[row.status] ?? RUBRIC_STATUS_META.warn;
                          return (
                            <li key={row.id} className="flex gap-3 rounded-xl border border-border-subtle bg-surface-elevated/80 px-3 py-2.5">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-tertiary text-[11px] font-bold text-text-tertiary">{i + 1}</span>
                              <div className="min-w-0 flex-1">
                                <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${meta.cls}`}>{meta.label}</span>
                                <p className="mt-1 text-[13px] font-medium text-text-primary">{row.label}</p>
                                <p className="text-[12px] text-text-tertiary leading-relaxed">{row.detail}</p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {tab === "gaps" && (
                      <div className="max-h-[min(48vh,460px)] overflow-y-auto space-y-4">
                        {analysis.content_gaps?.length ? (
                          <>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">Missing topics / angles</p>
                            <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-text-secondary">
                              {analysis.content_gaps.map((g, i) => (
                                <li key={i} className="leading-relaxed">{g}</li>
                              ))}
                            </ol>
                          </>
                        ) : (
                          <p className="text-sm text-text-tertiary">No content gaps identified.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-surface-secondary/95 p-4 backdrop-blur">
          <p className="text-[11px] text-text-tertiary max-w-xs leading-relaxed">
            &quot;Generate enhanced&quot; rewrites applying <strong className="text-text-secondary">all</strong> issues above at once. &quot;Schedule&quot; queues the keyword for later.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border-strong bg-surface-elevated px-4 py-2.5 text-xs font-bold text-text-secondary shadow-sm transition-all hover:border-text-tertiary hover:text-text-primary"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onSchedule}
              disabled={scheduling || busy || !analysis}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border-strong bg-surface-elevated px-4 py-2.5 text-xs font-bold text-text-secondary shadow-sm transition-all hover:border-text-tertiary hover:text-text-primary disabled:opacity-50"
            >
              {scheduling ? "Scheduling…" : (
                <>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  Schedule
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onGenerateEnhanced}
              disabled={enhancing || busy || !analysis}
              className="inline-flex min-w-[168px] items-center justify-center gap-1.5 rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-bold text-brand-on-primary shadow-lg shadow-brand-primary/30 transition-all hover:opacity-90 disabled:opacity-50"
            >
              {enhancing ? "Generating…" : (
                <>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.847-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                  </svg>
                  Generate enhanced
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
