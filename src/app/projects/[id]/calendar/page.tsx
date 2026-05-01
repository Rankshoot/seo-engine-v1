"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import {
  useAppDispatch,
  useAppSelector,
  selectCalendarRefreshVersion,
  selectCalendarLastSyncedVersion,
} from "@/lib/redux/hooks";
import {
  calendarEntriesLoaded,
  calendarSyncVersionUpdated,
} from "@/lib/redux/keyword-workspace-slice";
import { getCalendarEntries, generateCalendar, updateCalendarEntry } from "@/app/actions/calendar-actions";
import { CalendarEntry, ARTICLE_TYPES } from "@/lib/types";
import { TableSkeleton } from "@/components/Skeleton";

type CalendarResponse = Awaited<ReturnType<typeof getCalendarEntries>>;

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Scheduled", color: "bg-surface-secondary text-text-tertiary border-border-subtle" },
  generating: { label: "Generating...", color: "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20 animate-pulse" },
  generated: { label: "Blog Ready", color: "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20" },
  downloaded: { label: "Downloaded", color: "bg-brand-action/10 text-brand-action border-brand-action/20" },
};

function EditableField({
  value,
  placeholder,
  onSave,
  type = "text",
}: {
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
  type?: "text" | "select";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

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
      <button
        onClick={() => setEditing(true)}
        className="text-[13px] text-text-secondary hover:text-brand-action transition-colors text-left w-full"
      >
        {value || <span className="text-text-tertiary italic">Blog Post</span>}
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
      placeholder={placeholder}
      className="text-[14px] font-medium bg-surface-elevated border border-brand-action rounded-[4px] px-2.5 py-1.5 outline-none text-text-primary w-full shadow-sm"
    />
  ) : (
    <button onClick={() => setEditing(true)} className="text-left w-full group/edit">
      {value ? (
        <span className="text-[14px] font-medium text-text-primary group-hover/edit:text-brand-action transition-colors truncate block">
          {value}
        </span>
      ) : (
        <span className="text-[13px] text-text-tertiary italic group-hover/edit:text-brand-action transition-colors truncate block">
          {placeholder ?? "Click to add title…"}
        </span>
      )}
    </button>
  );
}

export default function CalendarPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();

  // calendarRefreshVersion increments each time a keyword is approved.
  // calendarLastSyncedVersion persists in Redux so navigating away and back
  // doesn't trigger a redundant re-fetch if no new keywords were approved.
  const calendarRefreshVersion = useAppSelector(state =>
    selectCalendarRefreshVersion(state, projectId)
  );
  const calendarLastSyncedVersion = useAppSelector(state =>
    selectCalendarLastSyncedVersion(state, projectId)
  );

  const CALENDAR_KEY = qk.calendar(projectId);

  const [generating, setGenerating] = useState(false);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [error, setError] = useState("");

  const { data: entriesData, isLoading: loading } = useQuery<CalendarResponse>({
    queryKey: CALENDAR_KEY,
    queryFn: () => getCalendarEntries(projectId),
    enabled: !!projectId,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
  const entries: CalendarEntry[] = entriesData?.success ? entriesData.data : [];

  // Keep sidebar calendar count in sync.
  useEffect(() => {
    if (entriesData?.success) {
      dispatch(calendarEntriesLoaded({ projectId, count: entriesData.data.length }));
    }
  }, [dispatch, entriesData, projectId]);

  // When keywords are approved on the keywords page, calendarRefreshVersion
  // increments. We only invalidate when the version is HIGHER than what we
  // last processed — preventing a redundant re-fetch on every navigation back
  // to this page if the calendar was already up to date.
  useEffect(() => {
    if (calendarRefreshVersion <= calendarLastSyncedVersion) return;
    dispatch(calendarSyncVersionUpdated({ projectId, version: calendarRefreshVersion }));
    void queryClient.invalidateQueries({ queryKey: CALENDAR_KEY });
  }, [
    calendarRefreshVersion,
    calendarLastSyncedVersion,
    dispatch,
    projectId,
    queryClient,
    CALENDAR_KEY,
  ]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    const res = await generateCalendar(projectId, startDate);
    if (res.success) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CALENDAR_KEY }),
        queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) }),
      ]);
    } else {
      setError(res.error ?? "Failed to generate calendar");
    }
    setGenerating(false);
  };

  const handleUpdate = async (
    entryId: string,
    updates: { title?: string; article_type?: string }
  ) => {
    queryClient.setQueryData<CalendarResponse>(CALENDAR_KEY, prev => {
      if (!prev?.success) return prev;
      return { ...prev, data: prev.data.map(e => e.id === entryId ? { ...e, ...updates } : e) };
    });
    await updateCalendarEntry(entryId, updates);
  };

  const generatedCount = entries.filter(
    e => e.status === "generated" || e.status === "downloaded"
  ).length;
  const scheduledCount = entries.filter(e => e.status === "scheduled").length;
  const titledCount = entries.filter(e => e.title && e.title.trim().length > 0).length;

  return (
    <div className="space-y-10 pb-16 max-w-full pl-4 pr-4 mx-auto">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="pt-4 pb-8 border-b border-border-subtle flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[48px] font-normal tracking-[-0.96px] leading-none text-text-primary font-display">
            Content Calendar
          </h1>
          <p className="mt-3 text-[16px] text-text-tertiary max-w-[520px]">
            Your approved keywords, scheduled day by day. Click any title to edit it, then generate
            blogs one by one.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {entries.length > 0 && (
            <Link
              href={`/projects/${projectId}/blogs`}
              className="inline-flex h-10 items-center gap-2 rounded-[30px] border border-border-subtle bg-surface-secondary px-5 text-[14px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              View Blogs
              {generatedCount > 0 && (
                <span className="rounded-full bg-[#10b981]/15 px-2 py-0.5 text-[11px] font-bold text-[#10b981]">
                  {generatedCount} ready
                </span>
              )}
            </Link>
          )}

          <div className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-border-subtle bg-surface-secondary px-3">
            <label className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
              Start
            </label>
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
            className="inline-flex h-10 items-center gap-2 rounded-[32px] bg-brand-primary px-6 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-brand-on-primary/30 border-t-brand-on-primary rounded-full animate-spin" />
                Generating…
              </>
            ) : entries.length > 0 ? (
              "Regenerate Calendar"
            ) : (
              "Generate 30-Day Calendar"
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-5 rounded-[16px] bg-brand-coral/10 border border-brand-coral/20 text-brand-coral text-[14px]">
          <svg
            className="w-5 h-5 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            {error}
            {error.includes("approved keywords") && (
              <Link
                href={`/projects/${projectId}/keywords`}
                className="block mt-2 font-medium hover:underline"
              >
                → Go approve keywords
              </Link>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated">
          <TableSkeleton rows={8} columns={5} />
        </div>
      ) : entries.length > 0 ? (
        <>
          {/* ── STATS ────────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-[16px] border border-border-subtle bg-surface-elevated p-5 flex flex-col">
              <p className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Total planned</p>
              <p className="font-mono text-[32px] font-bold tracking-tight text-text-primary leading-none">{entries.length}</p>
              <p className="mt-2 text-[12px] text-text-tertiary">keywords on schedule</p>
            </div>
            <div className="rounded-[16px] border border-border-subtle bg-surface-elevated p-5 flex flex-col">
              <p className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Blogs generated</p>
              <p className="font-mono text-[32px] font-bold tracking-tight text-[#10b981] leading-none">{generatedCount}</p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
                <div
                  className="h-full rounded-full bg-[#10b981] transition-all"
                  style={{ width: entries.length ? `${(generatedCount / entries.length) * 100}%` : "0%" }}
                />
              </div>
            </div>
            <div className="rounded-[16px] border border-border-subtle bg-surface-elevated p-5 flex flex-col">
              <p className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Awaiting generation</p>
              <p className="font-mono text-[32px] font-bold tracking-tight text-text-primary leading-none">{scheduledCount}</p>
              <p className="mt-2 text-[12px] text-text-tertiary">scheduled entries</p>
            </div>
            <div className="rounded-[16px] border border-border-subtle bg-surface-elevated p-5 flex flex-col">
              <p className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Titles set</p>
              <p className="font-mono text-[32px] font-bold tracking-tight text-text-primary leading-none">{titledCount}</p>
              <p className="mt-2 text-[12px] text-text-tertiary">click any row to edit</p>
            </div>
          </div>

          {/* ── TABLE ────────────────────────────────────────────────────────── */}
          <div className="rounded-[16px] border border-border-subtle bg-surface-elevated">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-surface-secondary text-[11px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                  <tr>
                    <th className="px-4 py-3 w-24">Day</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3 w-40">Type</th>
                    <th className="px-4 py-3 w-44">Keyword</th>
                    <th className="px-4 py-3 text-center w-32">Status</th>
                    <th className="px-4 py-3 text-center w-28">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/60">
                  {entries.map((entry, i) => {
                    const cfg = STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.scheduled;
                    return (
                      <tr
                        key={entry.id}
                        className="hover:bg-surface-hover/70 transition-colors group"
                      >
                        <td className="px-4 py-3 align-middle">
                          <div className="flex flex-col">
                            <span className="text-[13px] font-bold text-text-primary">
                              Day {i + 1}
                            </span>
                            <span className="text-[11px] text-text-tertiary mt-0.5">
                              {new Date(entry.scheduled_date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-xs align-middle">
                          <EditableField
                            value={entry.title}
                            placeholder={entry.focus_keyword}
                            onSave={v => handleUpdate(entry.id, { title: v })}
                          />
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <EditableField
                            value={entry.article_type}
                            type="select"
                            onSave={v => handleUpdate(entry.id, { article_type: v })}
                          />
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <span className="text-[12px] font-mono text-brand-action/80 truncate block max-w-[160px]">
                            {entry.focus_keyword}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center align-middle">
                          <span
                            className={`inline-block text-[11px] font-bold px-2.5 py-1 rounded-full border capitalize ${cfg.color}`}
                          >
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center align-middle">
                          <Link
                            href={`/projects/${projectId}/blogs?entry=${entry.id}`}
                            className={`inline-flex h-8 items-center justify-center rounded-full border px-3 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                              entry.status === "generated" || entry.status === "downloaded"
                                ? "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20 hover:bg-[#10b981]/20"
                                : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary hover:border-border-strong"
                            }`}
                          >
                            {entry.status === "generated" || entry.status === "downloaded"
                              ? "View Blog"
                              : "Generate"}
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
              <svg
                className="w-8 h-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
              </svg>
            </div>
          </div>
          <h3 className="mb-3 text-[24px] font-normal tracking-[-0.24px] text-text-primary font-display">
            No calendar yet
          </h3>
          <p className="mb-8 text-[16px] text-text-tertiary max-w-md mx-auto">
            Approve keywords first — each approved keyword is instantly added to your calendar.
            Then use this page to set titles and generate blogs.
          </p>
          <Link
            href={`/projects/${projectId}/keywords`}
            className="inline-flex items-center justify-center rounded-[32px] bg-brand-primary px-6 py-3 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90"
          >
            Go to Keywords
          </Link>
        </div>
      )}
    </div>
  );
}
