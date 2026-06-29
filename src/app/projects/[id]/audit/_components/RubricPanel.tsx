"use client";

import type { ContentAuditReport } from "@/lib/content-audit-studio";
import { RubricStatus, scoreColor } from "../_shared/ch-ui";

export function RubricPanel({ rows }: { rows: ContentAuditReport["quality_rubric"] }) {
  const pass = rows.filter(r => r.status === "pass").length;
  const pct = rows.length > 0 ? Math.round((pass / rows.length) * 100) : 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[13px] text-text-secondary font-medium">{pass}/{rows.length} checks passing</span>
        <div className="flex-1 h-2 rounded-full bg-surface-tertiary overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: scoreColor(pct) }} />
        </div>
        <span className="text-[13px] font-bold tabular-nums" style={{ color: scoreColor(pct) }}>{pct}%</span>
      </div>
      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.id} className="flex items-start gap-3 rounded-[12px] border border-border-subtle bg-surface-elevated px-4 py-3">
            <RubricStatus status={row.status} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-text-primary leading-snug">{row.label}</p>
              <p className="text-[12px] text-text-tertiary mt-0.5 leading-relaxed">{row.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
