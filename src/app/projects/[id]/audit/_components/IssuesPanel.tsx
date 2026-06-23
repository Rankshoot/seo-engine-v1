"use client";

import { useState } from "react";
import type { ContentAuditReport } from "@/lib/content-audit-studio";
import { SeverityChip, CategoryBadge, EmptyState } from "../_shared/ch-ui";

export const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function IssuesPanel({ issues }: { issues: ContentAuditReport["issues"] }) {
  const sorted = [...issues].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99));
  if (!sorted.length) {
    return (
      <EmptyState
        icon={<svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" /></svg>}
        title="No issues found"
        body="This content looks great! No significant SEO, GEO, or AEO issues were detected."
      />
    );
  }
  return (
    <div className="space-y-3">
      {sorted.map((issue, i) => <IssueCard key={issue.id || i} issue={issue} />)}
    </div>
  );
}

function IssueCard({ issue }: { issue: ContentAuditReport["issues"][0] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[14px] border border-border-subtle bg-surface-elevated overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)} className="w-full flex items-start gap-3 p-4 text-left hover:bg-surface-hover transition-colors">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          <SeverityChip severity={issue.severity} />
          <CategoryBadge category={issue.category} />
          <span className="text-[13px] font-semibold text-text-primary leading-snug">{issue.title}</span>
        </div>
        <svg className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform mt-0.5 ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border-subtle/50">
          <div className="pt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary mb-1">What&apos;s wrong</p>
              <p className="text-[13px] text-text-secondary leading-relaxed">{issue.detail}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary mb-1">Why it matters</p>
              <p className="text-[13px] text-text-secondary leading-relaxed">{issue.impact}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary mb-1">How to fix it</p>
              <p className="text-[13px] text-brand-violet leading-relaxed font-medium">{issue.fix}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
