"use client";

import type { ContentAuditReport } from "@/lib/content-audit-studio";
import { EmptyState } from "../_shared/ch-ui";

export function CompetitorsPanel({ insights }: { insights: ContentAuditReport["competitor_insights"] }) {
  if (!insights.length) {
    return (
      <EmptyState
        icon={<svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
        title="No competitor data"
        body="Competitor analysis requires DataForSEO SERP access. Configure your DataForSEO credentials in admin settings to enable this."
      />
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-text-tertiary">These are the pages currently outranking you for your primary keyword. Here&apos;s what they&apos;re doing differently.</p>
      {insights.map((c, i) => (
        <div key={c.url} className="rounded-[14px] border border-border-subtle bg-surface-elevated p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-surface-tertiary text-text-tertiary text-[11px] font-bold flex items-center justify-center shrink-0">#{i + 1}</span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-text-primary leading-snug line-clamp-1">{c.title}</p>
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-text-tertiary hover:text-brand-violet transition-colors truncate block">{c.url}</a>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-text-tertiary mb-3">
            <span>{c.word_count.toLocaleString()} words</span>
            <span>{c.h2_count} H2 sections</span>
            {c.has_faq && <span className="text-status-success">✓ FAQ section</span>}
            {c.has_schema && <span className="text-status-success">✓ Schema markup</span>}
          </div>
          {c.advantages.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary">What they do better:</p>
              {c.advantages.map((adv, j) => (
                <div key={j} className="flex items-start gap-2 text-[12px] text-text-secondary">
                  <span className="text-status-danger shrink-0 mt-0.5">→</span>{adv}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
