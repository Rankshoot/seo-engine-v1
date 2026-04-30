"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getCalendarEntries, generateCalendar, updateCalendarEntry } from "@/app/actions/calendar-actions";
import { getBlogAudits, type AuditCoverage } from "@/app/actions/audit-actions";
import { CalendarEntry, ARTICLE_TYPES } from "@/lib/types";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Scheduled", color: "bg-surface-secondary text-text-tertiary border-border-subtle" },
  generating: { label: "Generating...", color: "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20 animate-pulse" },
  generated: { label: "Blog Ready", color: "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20" },
  downloaded: { label: "Downloaded", color: "bg-brand-action/10 text-brand-action border-brand-action/20" },
};

function EditableField({
  value,
  onSave,
  type = "text",
}: {
  value: string;
  onSave: (v: string) => void;
  type?: "text" | "select";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => { setEditing(false); if (draft !== value) onSave(draft); };

  if (type === "select") {
    return editing ? (
      <select
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        className="text-[13px] bg-surface-elevated border border-brand-action rounded-[4px] px-2.5 py-1.5 outline-none text-text-primary w-full shadow-sm"
      >
        {ARTICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    ) : (
      <button onClick={() => setEditing(true)} className="text-[13px] text-text-secondary hover:text-brand-action transition-colors text-left w-full">
        {value}
      </button>
    );
  }

  return editing ? (
    <input
      autoFocus
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => e.key === "Enter" && commit()}
      className="text-[14px] font-medium bg-surface-elevated border border-brand-action rounded-[4px] px-2.5 py-1.5 outline-none text-text-primary w-full shadow-sm"
    />
  ) : (
    <button onClick={() => setEditing(true)} className="text-[14px] font-medium text-text-primary hover:text-brand-action transition-colors text-left w-full truncate">
      {value}
    </button>
  );
}

export default function CalendarPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();

  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [error, setError] = useState("");
  const [auditCoverage, setAuditCoverage] = useState<AuditCoverage | null>(null);

  const load = useCallback(async () => {
    const [entriesRes, auditRes] = await Promise.all([
      getCalendarEntries(projectId),
      getBlogAudits(projectId),
    ]);
    if (entriesRes.success) setEntries(entriesRes.data);
    if (auditRes.success) setAuditCoverage(auditRes.coverage);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const auditPending = auditCoverage
    ? Math.max(0, auditCoverage.blogs_found - auditCoverage.blogs_audited)
    : 0;

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    const res = await generateCalendar(projectId, startDate);
    if (res.success) {
      await load();
    } else {
      setError(res.error ?? "Failed to generate calendar");
    }
    setGenerating(false);
  };

  const handleUpdate = async (entryId: string, updates: { title?: string; article_type?: string }) => {
    await updateCalendarEntry(entryId, updates);
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, ...updates } : e));
  };

  const generatedCount = entries.filter(e => e.status === "generated" || e.status === "downloaded").length;

  return (
    <div className="space-y-10 pb-16 max-w-full pl-4 pr-4 mx-auto">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="pt-4 pb-8 border-b border-border-subtle flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[48px] font-normal tracking-[-0.96px] leading-none text-text-primary font-display">
            Content Calendar
          </h1>
          <p className="mt-3 text-[16px] text-text-tertiary max-w-[600px]">
            30-day plan with one SEO blog per day. Click any field to edit inline.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {entries.length > 0 && (
            <Link
              href={`/projects/${projectId}/blogs`}
              className="rounded-[30px] border border-border-subtle bg-surface-secondary px-5 py-2.5 text-[14px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              View Blogs ({generatedCount} ready)
            </Link>
          )}

          <div className="flex items-center gap-2 rounded-[8px] border border-border-subtle bg-surface-secondary px-3 py-1.5">
            <label className="text-[12px] font-bold uppercase tracking-widest text-text-tertiary">Start date:</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-transparent text-[13px] font-medium text-text-primary outline-none"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-[32px] bg-brand-primary px-6 py-2.5 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
          >
            {generating ? (
              <><div className="w-4 h-4 border-2 border-brand-on-primary/30 border-t-brand-on-primary rounded-full animate-spin" /> Generating...</>
            ) : entries.length > 0 ? (
              "Regenerate Calendar"
            ) : (
              "Generate 30-Day Calendar"
            )}
          </button>
        </div>
      </div>

      {auditCoverage && auditCoverage.blogs_found > 0 && auditPending > 0 && (
        <Link
          href={`/projects/${projectId}/audit`}
          className="group flex items-start gap-4 p-5 rounded-[16px] bg-[#f59e0b]/5 border border-[#f59e0b]/20 text-[#f59e0b] hover:bg-[#f59e0b]/10 transition-colors"
        >
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div className="flex-1">
            <p className="text-[14px] font-medium">
              Audit {auditPending} existing blog{auditPending === 1 ? "" : "s"} before generating new ones
            </p>
            <p className="text-[13px] text-[#f59e0b]/80 mt-1">
              New posts will internally link to your existing blogs and avoid topics you've already covered. Takes ~1
              minute per blog.
            </p>
          </div>
          <span className="text-[13px] font-medium group-hover:underline self-center">Run audit →</span>
        </Link>
      )}

      {error && (
        <div className="flex items-start gap-3 p-5 rounded-[16px] bg-brand-coral/10 border border-brand-coral/20 text-brand-coral text-[14px]">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <div>
            {error}
            {error.includes("approved keywords") && (
              <Link href={`/projects/${projectId}/keywords`} className="block mt-2 font-medium hover:underline">
                → Go approve keywords
              </Link>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 w-full animate-pulse bg-surface-elevated rounded-[16px] border border-border-subtle" />
          ))}
        </div>
      ) : entries.length > 0 ? (
        <>
          {/* Progress bar */}
          <div className="rounded-[16px] border border-border-subtle bg-surface-elevated p-6 flex flex-wrap items-center gap-6">
            <div>
              <p className="mb-1 text-[12px] font-bold uppercase tracking-widest text-text-tertiary">Blogs Ready</p>
              <p className="text-[28px] font-normal tracking-tight text-text-primary font-display">
                {generatedCount} <span className="text-[16px] text-text-tertiary">/ {entries.length}</span>
              </p>
            </div>
            <div className="h-2 min-w-[120px] flex-1 overflow-hidden rounded-full bg-surface-tertiary">
              <div
                className="h-full rounded-full bg-[#10b981] transition-all"
                style={{ width: `${(generatedCount / entries.length) * 100}%` }}
              />
            </div>
            <div className="text-right">
              <Link href={`/projects/${projectId}/blogs`} className="text-[13px] font-medium text-brand-action hover:underline">
                Go to Blogs →
              </Link>
            </div>
          </div>

          {/* Entries */}
          <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-secondary text-[12px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                  <tr>
                    <th className="px-4 py-3 w-24">Date</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3 w-44">Article Type</th>
                    <th className="px-4 py-3">Keyword</th>
                    <th className="px-4 py-3 text-center w-32">Status</th>
                    <th className="px-4 py-3 text-center w-28">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/60">
                  {entries.map((entry, i) => {
                    const cfg = STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.scheduled;
                    return (
                      <tr key={entry.id} className="hover:bg-surface-hover transition-colors group">
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-[13px] font-bold text-text-primary">Day {i + 1}</span>
                            <span className="text-[11px] text-text-tertiary mt-0.5">
                              {new Date(entry.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <EditableField
                            value={entry.title}
                            onSave={v => handleUpdate(entry.id, { title: v })}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <EditableField
                            value={entry.article_type}
                            type="select"
                            onSave={v => handleUpdate(entry.id, { article_type: v })}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[13px] text-text-tertiary truncate block max-w-[160px]">{entry.focus_keyword}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block text-[11px] font-bold px-2.5 py-1 rounded-[4px] border capitalize ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link
                            href={`/projects/${projectId}/blogs?entry=${entry.id}`}
                            className={`inline-block text-[12px] font-medium px-3 py-1.5 rounded-[4px] border transition-colors ${
                              entry.status === "generated" || entry.status === "downloaded"
                                ? "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20 hover:bg-[#10b981]/20"
                                : "bg-surface-secondary text-text-secondary border-border-subtle hover:text-text-primary hover:bg-surface-hover"
                            }`}
                          >
                            {entry.status === "generated" || entry.status === "downloaded" ? "View Blog" : "Generate"}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-[22px] border border-dashed border-border-strong bg-surface-secondary py-24 text-center">
          <div className="mb-6 flex justify-center">
            <div className="w-16 h-16 rounded-[16px] bg-surface-tertiary flex items-center justify-center text-text-primary border border-border-subtle">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" />
              </svg>
            </div>
          </div>
          <h3 className="mb-3 text-[24px] font-normal tracking-[-0.24px] text-text-primary font-display">No calendar yet</h3>
          <p className="mb-8 text-[16px] text-text-tertiary max-w-md mx-auto">
            Approve at least 5 keywords first, then generate your 30-day content plan.
          </p>
          <Link href={`/projects/${projectId}/keywords`} className="inline-flex items-center justify-center rounded-[32px] bg-brand-primary px-6 py-3 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90">
            Go to Keywords
          </Link>
        </div>
      )}
    </div>
  );
}
