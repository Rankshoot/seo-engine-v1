"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
import {
  getCalendarEntries,
  generateCalendar,
  updateCalendarEntry,
  addKeywordToCalendarOnDate,
} from "@/app/actions/calendar-actions";
import { getKeywords } from "@/app/actions/keyword-actions";
import { CalendarEntry, ARTICLE_TYPES } from "@/lib/types";
import { TableSkeleton } from "@/components/Skeleton";
import { MiniCalendar } from "@/components/MiniCalendar";

type CalendarResponse = Awaited<ReturnType<typeof getCalendarEntries>>;
type KeywordsResponse = Awaited<ReturnType<typeof getKeywords>>;

/** Map keyword source_type → display label + badge colour. */
function sourceInfo(sourceType?: string | null): { label: string; color: string } {
  switch (sourceType) {
    case "competitor_gap":
      return { label: "Gap", color: "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20" };
    case "quick_win":
      return { label: "Competitor", color: "bg-[#8b5cf6]/10 text-[#8b5cf6] border-[#8b5cf6]/20" };
    default:
      return { label: "Keyword", color: "bg-brand-action/10 text-brand-action border-brand-action/20" };
  }
}

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

  const calendarRefreshVersion = useAppSelector(state =>
    selectCalendarRefreshVersion(state, projectId)
  );
  const calendarLastSyncedVersion = useAppSelector(state =>
    selectCalendarLastSyncedVersion(state, projectId)
  );

  const CALENDAR_KEY = qk.calendar(projectId);
  const KEYWORDS_KEY = qk.keywords(projectId, { limit: 200, offset: 0 });

  const [generating, setGenerating] = useState(false);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useState<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Scheduling flow for "Add to Calendar" per keyword row
  const [schedulingKeywordId, setSchedulingKeywordId] = useState<string | null>(null);
  const [addingToCalendar, setAddingToCalendar] = useState(false);

  const pushToast = (msg: string) => {
    setToast(msg);
    if (toastTimer[0]) clearTimeout(toastTimer[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    toastTimer[0] = setTimeout(() => setToast(null), 4000);
  };

  // The calendar page is the single source of truth for scheduling. Always
  // refetch on mount so cross-tab edits or navigations from keywords/blogs
  // pages can never show stale data. The heal-on-read pass in
  // getCalendarEntries also runs on every fetch, so keyword_id linkage is
  // repaired silently each load.
  const { data: entriesData, isLoading: loading, refetch: refetchCalendar } = useQuery<CalendarResponse>({
    queryKey: CALENDAR_KEY,
    queryFn: () => getCalendarEntries(projectId),
    enabled: !!projectId,
    staleTime: 0,
    gcTime: 30 * 60_000,
    refetchOnMount: 'always',
  });
  const entries: CalendarEntry[] = entriesData?.success ? entriesData.data : [];

  // Fetch all approved keywords to show in the keyword table
  const { data: keywordsData, isLoading: loadingKeywords } = useQuery<KeywordsResponse>({
    queryKey: KEYWORDS_KEY,
    queryFn: () => getKeywords(projectId, { limit: 200, offset: 0 }),
    enabled: !!projectId,
    staleTime: 0,
    gcTime: 30 * 60_000,
    refetchOnMount: 'always',
  });
  const allKeywords =
    keywordsData && "success" in keywordsData && keywordsData.success ? keywordsData.data : [];
  const approvedKeywords = allKeywords.filter(k => k.status === "approved");

  useEffect(() => {
    if (entriesData?.success) {
      dispatch(calendarEntriesLoaded({ projectId, count: entriesData.data.length }));
    }
  }, [dispatch, entriesData, projectId]);

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

  const handleScheduleOnDate = useCallback(async (date: string) => {
    if (!schedulingKeywordId) return;
    setAddingToCalendar(true);
    const kw = approvedKeywords.find(k => k.id === schedulingKeywordId);
    const res = await addKeywordToCalendarOnDate(schedulingKeywordId, projectId, date);
    if (res.success) {
      const wasRescheduled = 'rescheduled' in res && res.rescheduled;
      pushToast(`"${kw?.keyword ?? "Keyword"}" ${wasRescheduled ? "moved to" : "scheduled for"} ${date}`);
      setSchedulingKeywordId(null);
      await refetchCalendar();
      queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
      queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
    } else {
      pushToast(res.error ?? "Could not schedule keyword");
    }
    setAddingToCalendar(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedulingKeywordId, approvedKeywords, projectId, refetchCalendar, queryClient]);

  // Index entries by both keyword_id and normalised focus_keyword so we can
  // match even when generateCalendar stored keyword_id: null (LLM text mismatch).
  const entriesByKeywordId = useMemo(
    () => new Map(entries.filter(e => e.keyword_id).map(e => [e.keyword_id!, e])),
    [entries]
  );
  const entriesByFocusKeyword = useMemo(
    () => new Map(entries.map(e => [e.focus_keyword.toLowerCase().trim(), e])),
    [entries]
  );
  const findEntryForKeyword = (kw: { id: string; keyword: string }) =>
    entriesByKeywordId.get(kw.id) ??
    entriesByFocusKeyword.get(kw.keyword.toLowerCase().trim()) ??
    null;

  const scheduledKeywordIds = useMemo(
    () => new Set(approvedKeywords.filter(kw => !!findEntryForKeyword(kw)).map(kw => kw.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, approvedKeywords]
  );

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
            Schedule keywords to specific dates, then generate blogs one by one.
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
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
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

      {/* ── KEYWORDS SECTION ──────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[28px] font-normal tracking-[-0.28px] text-text-primary font-display">
              Keywords
            </h2>
            <p className="mt-1.5 text-[14px] text-text-tertiary">
              {approvedKeywords.length > 0
                ? `${approvedKeywords.length} approved keyword${approvedKeywords.length !== 1 ? "s" : ""} — click the calendar icon to schedule on a specific date.`
                : "Approve keywords first — they will appear here ready to schedule."}
            </p>
          </div>
          <Link
            href={`/projects/${projectId}/keywords`}
            className="inline-flex items-center gap-2 rounded-[30px] border border-border-subtle bg-surface-elevated px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary shrink-0"
          >
            Manage keywords
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>

        {loadingKeywords ? (
          <div className="rounded-[16px] border border-border-subtle bg-surface-elevated">
            <TableSkeleton rows={5} columns={6} />
          </div>
        ) : approvedKeywords.length > 0 ? (
          <div className="rounded-[16px] border border-border-subtle bg-surface-elevated">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-surface-secondary text-[11px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                  <tr>
                    <th className="px-4 py-3">Keyword</th>
                    <th className="px-4 py-3 w-28">Source</th>
                    <th className="px-4 py-3 w-24 text-right">Volume</th>
                    <th className="px-4 py-3 w-24 text-center">KD</th>
                    <th className="px-4 py-3 w-32 text-center">Date</th>
                    <th className="px-4 py-3 w-36 text-center">Schedule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/60">
                  {approvedKeywords.map(kw => {
                    const isScheduled = scheduledKeywordIds.has(kw.id);
                    const isSchedulingThis = schedulingKeywordId === kw.id;
                    const src = sourceInfo(kw.source_type);
                    const entry = findEntryForKeyword(kw);
                    const isBlogGenerated =
                      entry?.status === "generated" || entry?.status === "downloaded";

                    return (
                      <tr key={kw.id} className="hover:bg-surface-hover/70 transition-colors group">
                        <td className="px-4 py-3 align-middle max-w-xs">
                          <p className="truncate text-[14px] font-medium text-text-primary">{kw.keyword}</p>
                          {kw.secondary_keywords?.length ? (
                            <p className="mt-0.5 truncate text-[11px] text-text-tertiary">
                              {kw.secondary_keywords.slice(0, 3).join(" · ")}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <span className={`inline-block text-[11px] font-bold px-2.5 py-1 rounded-full border ${src.color}`}>
                            {src.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-middle text-right text-[13px] font-mono text-text-secondary tabular-nums">
                          {kw.volume ? kw.volume.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 align-middle text-center">
                          {kw.kd > 0 ? (
                            <span className={`text-[12px] font-bold ${kw.kd < 30 ? "text-[#10b981]" : kw.kd < 60 ? "text-[#f59e0b]" : "text-brand-coral"}`}>
                              {kw.kd < 30 ? "Easy" : kw.kd < 60 ? "Medium" : "Hard"}
                            </span>
                          ) : (
                            <span className="text-text-tertiary text-[13px]">—</span>
                          )}
                        </td>

                        {/* ── Scheduled date column ── */}
                        <td className="px-4 py-3 align-middle text-center">
                          {entry ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-[13px] font-medium text-text-primary tabular-nums">
                                {new Date(entry.scheduled_date + "T00:00:00").toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </span>
                              {isBlogGenerated && (
                                <span className="text-[10px] font-bold text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded-full border border-[#10b981]/20">
                                  Blog ready
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[13px] text-text-tertiary">—</span>
                          )}
                        </td>

                        {/* ── Schedule / Pick date column ── */}
                        <td className="px-4 py-3 align-middle text-center">
                          {isBlogGenerated ? (
                            /* Blog already generated — lock the date, no changes allowed */
                            <span
                              title="Blog already generated — delete the blog first to reschedule"
                              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full border border-border-subtle text-[11px] font-semibold text-text-tertiary opacity-50 cursor-not-allowed select-none"
                            >
                              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                              Locked
                            </span>
                          ) : isScheduled && entry && !isSchedulingThis ? (
                            /* Scheduled but no blog yet — allow rescheduling */
                            <button
                              type="button"
                              disabled={addingToCalendar}
                              onClick={() => {
                                setSchedulingKeywordId(kw.id);
                                setTimeout(() => {
                                  document.getElementById("mini-calendar")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                                }, 50);
                              }}
                              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full border border-border-subtle bg-surface-elevated text-[11px] font-semibold text-text-secondary hover:border-[#f59e0b]/40 hover:text-[#f59e0b] hover:bg-[#f59e0b]/5 transition-colors"
                            >
                              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                              </svg>
                              Change date
                            </button>
                          ) : (
                            /* Not yet scheduled (or currently picking) */
                            <button
                              type="button"
                              disabled={addingToCalendar}
                              onClick={() => {
                                setSchedulingKeywordId(isSchedulingThis ? null : kw.id);
                                if (!isSchedulingThis) {
                                  setTimeout(() => {
                                    document.getElementById("mini-calendar")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                                  }, 50);
                                }
                              }}
                              className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-[11px] font-semibold transition-colors
                                ${isSchedulingThis
                                  ? "border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b]"
                                  : "border-border-subtle bg-surface-elevated text-text-secondary hover:border-brand-action/40 hover:text-brand-action hover:bg-brand-action/5"
                                }
                              `}
                            >
                              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                                <line x1="16" x2="16" y1="2" y2="6" />
                                <line x1="8" x2="8" y1="2" y2="6" />
                                <line x1="3" x2="21" y1="10" y2="10" />
                                <line x1="12" x2="12" y1="15" y2="18" />
                                <line x1="10.5" x2="13.5" y1="16.5" y2="16.5" />
                              </svg>
                              {isSchedulingThis ? "Cancel" : "Pick date"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-border-strong bg-surface-secondary py-14 text-center">
            <p className="text-[15px] text-text-tertiary">No approved keywords yet.</p>
            <Link
              href={`/projects/${projectId}/keywords`}
              className="mt-4 inline-flex items-center justify-center rounded-[32px] bg-brand-primary px-6 py-2.5 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90"
            >
              Go to Keywords
            </Link>
          </div>
        )}
      </section>

      {/* ── MINI CALENDAR (date picker) ────────────────────────────────────── */}
      {(schedulingKeywordId || entries.length > 0) && (
        <div id="mini-calendar">
          <MiniCalendar
            entries={entries}
            projectId={projectId}
            schedulingKeywordId={schedulingKeywordId}
            schedulingKeywordPhrase={
              approvedKeywords.find(k => k.id === schedulingKeywordId)?.keyword ?? ""
            }
            onDatePick={handleScheduleOnDate}
            onCancelSchedule={() => setSchedulingKeywordId(null)}
          />
        </div>
      )}

      {/* ── CALENDAR ENTRIES TABLE ─────────────────────────────────────────── */}
      {loading ? (
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated">
          <TableSkeleton rows={8} columns={5} />
        </div>
      ) : entries.length > 0 ? (
        <>
          {/* Stats */}
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

          {/* Table */}
          <div className="rounded-[16px] border border-border-subtle bg-surface-elevated">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-surface-secondary text-[11px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                  <tr>
                    <th className="px-4 py-3 w-28">Source</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3 w-40">Type</th>
                    <th className="px-4 py-3 w-44">Keyword</th>
                    <th className="px-4 py-3 text-center w-32">Status</th>
                    <th className="px-4 py-3 text-center w-28">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/60">
                  {entries.map(entry => {
                    const cfg = STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.scheduled;
                    const src = sourceInfo(
                      (entry.keywords as { source_type?: string | null } | undefined)?.source_type
                    );
                    return (
                      <tr key={entry.id} className="hover:bg-surface-hover/70 transition-colors group">
                        <td className="px-4 py-3 align-middle">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-block w-fit text-[11px] font-bold px-2.5 py-1 rounded-full border ${src.color}`}>
                              {src.label}
                            </span>
                            <span className="text-[11px] text-text-tertiary">
                              {new Date(entry.scheduled_date + "T00:00:00").toLocaleDateString("en-US", {
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
                          <span className={`inline-block text-[11px] font-bold px-2.5 py-1 rounded-full border capitalize ${cfg.color}`}>
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
      ) : approvedKeywords.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-border-strong bg-surface-secondary py-24 text-center">
          <div className="mb-6 flex justify-center">
            <div className="w-16 h-16 rounded-[16px] bg-surface-tertiary flex items-center justify-center text-text-primary border border-border-subtle">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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
            Approve keywords first — each approved keyword appears above ready to schedule.
            Then use &ldquo;Generate 30-Day Calendar&rdquo; to auto-schedule all at once.
          </p>
          <Link
            href={`/projects/${projectId}/keywords`}
            className="inline-flex items-center justify-center rounded-[32px] bg-brand-primary px-6 py-3 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90"
          >
            Go to Keywords
          </Link>
        </div>
      ) : null}

      {toast && (
        <div
          role="status"
          className="fixed bottom-8 right-6 z-90 max-w-sm rounded-[12px] border border-brand-action/30 bg-surface-elevated px-4 py-3 text-[14px] text-text-primary shadow-lg ring-1 ring-brand-action/20"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
