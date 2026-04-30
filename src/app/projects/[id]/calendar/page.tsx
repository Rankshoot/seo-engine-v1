"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getCalendarEntries, generateCalendar, updateCalendarEntry } from "@/app/actions/calendar-actions";
import { getBlogAudits, type AuditCoverage } from "@/app/actions/audit-actions";
import { CalendarEntry, ARTICLE_TYPES } from "@/lib/types";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Scheduled", color: "bg-surface-elevated text-text-tertiary border-border-subtle" },
  generating: { label: "Generating...", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  generated: { label: "Blog Ready", color: "bg-accent-500/10 text-accent-400 border-accent-500/20" },
  downloaded: { label: "Downloaded", color: "bg-brand-500/10 text-brand-400 border-brand-500/20" },
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
        className="text-xs bg-surface-elevated border border-brand-500/40 rounded-lg px-2 py-1 outline-none text-text-primary w-full"
      >
        {ARTICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    ) : (
      <button onClick={() => setEditing(true)} className="text-xs text-text-tertiary hover:text-brand-400 transition-colors text-left">
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
      className="text-sm font-semibold bg-surface-elevated border border-brand-500/40 rounded-lg px-2 py-1 outline-none text-text-primary w-full"
    />
  ) : (
    <button onClick={() => setEditing(true)} className="text-sm font-semibold text-text-primary hover:text-brand-400 transition-colors text-left w-full truncate">
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-primary mb-1">
            Content <span className="gradient-text">Calendar</span>
          </h1>
          <p className="text-text-tertiary text-sm">30-day plan with one SEO blog per day. Click any field to edit inline.</p>
        </div>

        <div className="flex items-center gap-3">
          {entries.length > 0 && (
            <Link
              href={`/projects/${projectId}/blogs`}
              className="px-5 py-2.5 rounded-xl border border-border-subtle text-xs font-bold text-text-secondary hover:border-brand-500/30 hover:text-brand-400 transition-all"
            >
              View Blogs ({generatedCount} ready)
            </Link>
          )}

          <div className="flex items-center gap-2">
            <label className="text-xs text-text-tertiary font-semibold">Start date:</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="input-field text-xs py-2"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-md shadow-brand-500/20 hover:from-brand-400 hover:to-brand-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {generating ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating...</>
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
          className="group flex items-start gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm hover:bg-yellow-500/15 transition-colors"
        >
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div className="flex-1">
            <p className="font-bold">
              Audit {auditPending} existing blog{auditPending === 1 ? "" : "s"} before generating new ones
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              New posts will internally link to your existing blogs and avoid topics you've already covered. Takes ~1
              minute per blog.
            </p>
          </div>
          <span className="text-xs font-bold group-hover:underline self-center">Run audit →</span>
        </Link>
      )}

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <div>
            {error}
            {error.includes("approved keywords") && (
              <Link href={`/projects/${projectId}/keywords`} className="block mt-1 text-brand-400 hover:underline">
                → Go approve keywords
              </Link>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 w-full animate-pulse bg-surface-secondary/50 rounded-2xl border border-border-subtle" />
          ))}
        </div>
      ) : entries.length > 0 ? (
        <>
          {/* Progress bar */}
          <div className="glass-card p-4 flex items-center gap-4">
            <div className="shrink-0">
              <p className="text-xs text-text-tertiary">Blogs Ready</p>
              <p className="text-xl font-black text-accent-400">{generatedCount} <span className="text-sm font-normal text-text-tertiary">/ {entries.length}</span></p>
            </div>
            <div className="flex-1 h-2 bg-surface-elevated rounded-full overflow-hidden">
              <div className="h-full bg-accent-500 rounded-full transition-all" style={{ width: `${(generatedCount / entries.length) * 100}%` }} />
            </div>
            <Link href={`/projects/${projectId}/blogs`} className="shrink-0 text-xs font-bold text-brand-400 hover:underline">
              Go to Blogs →
            </Link>
          </div>

          {/* Entries */}
          <div className="bg-surface-secondary/30 backdrop-blur-md rounded-2xl border border-border-subtle overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-tertiary/50 text-[10px] font-bold text-text-tertiary uppercase tracking-widest">
                  <tr>
                    <th className="px-4 py-3 w-24">Date</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3 w-44">Article Type</th>
                    <th className="px-4 py-3">Keyword</th>
                    <th className="px-4 py-3 text-center w-28">Status</th>
                    <th className="px-4 py-3 text-center w-28">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {entries.map((entry, i) => {
                    const cfg = STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.scheduled;
                    return (
                      <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-text-primary">Day {i + 1}</span>
                            <span className="text-[10px] text-text-tertiary">
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
                          <span className="text-xs text-text-tertiary truncate block max-w-[160px]">{entry.focus_keyword}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link
                            href={`/projects/${projectId}/blogs?entry=${entry.id}`}
                            className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${
                              entry.status === "generated" || entry.status === "downloaded"
                                ? "bg-accent-500/10 text-accent-400 border-accent-500/20 hover:bg-accent-500/20"
                                : "bg-surface-elevated text-text-tertiary border-border-subtle hover:border-brand-500/30 hover:text-brand-400"
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
        <div className="text-center py-24 border-2 border-dashed border-border-subtle rounded-3xl">
          <div className="text-5xl mb-4">📅</div>
          <h3 className="text-lg font-bold text-text-secondary mb-2">No calendar yet</h3>
          <p className="text-sm text-text-tertiary mb-2">Approve at least 5 keywords first, then generate your 30-day content plan.</p>
          <Link href={`/projects/${projectId}/keywords`} className="text-brand-400 text-sm font-bold hover:underline">
            → Go to Keywords
          </Link>
        </div>
      )}
    </div>
  );
}
