"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query";
import { calendarApi } from "@/frontend/api/calendar";
import { blogsApi } from "@/frontend/api/blogs";
import { BlogStatus, WORD_COUNT_OPTIONS, type CalendarEntryWithBlog } from "@/lib/types";
import { useAppDispatch } from "@/lib/redux/hooks";
import { calendarRefreshBump } from "@/lib/redux/keyword-workspace-slice";
import { TableSkeleton } from "@/components/Skeleton";

type CalendarWithBlogsResponse = Awaited<ReturnType<typeof calendarApi.withBlogs>>;

const STATUS_CONFIG: Record<string, { label: string; color: string; dot?: string }> = {
  scheduled: { label: "Scheduled", color: "text-text-tertiary" },
  generating: {
    label: "Generating…",
    color: "text-[#f59e0b]",
    dot: "bg-[#f59e0b] animate-pulse",
  },
  generated: { label: "Generated", color: "text-[#10b981]", dot: "bg-[#10b981]" },
  downloaded: { label: "Generated", color: "text-[#10b981]", dot: "bg-[#10b981]" },
  approved: { label: "Approved", color: "text-brand-action", dot: "bg-brand-action" },
  published: { label: "Published", color: "text-cyan-400", dot: "bg-cyan-400" },
};

const BLOG_STATUSES: Array<{ value: BlogStatus; label: string }> = [
  { value: "generated", label: "Generated" },
  { value: "approved", label: "Approved" },
  { value: "published", label: "Published" },
];

function asBlogStatus(status: string | undefined): BlogStatus {
  return status === "approved" || status === "published" ? status : "generated";
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function rowTitle(entry: CalendarEntryWithBlog): string {
  const bt = entry.blog?.title?.trim();
  if (bt) return bt;
  const et = entry.title?.trim();
  return et || "—";
}

export default function BlogsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const highlightEntry = searchParams.get("entry");
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();

  const ENTRIES_KEY = qk.calendarWithBlogs(projectId);
  const CALENDAR_KEY = qk.calendar(projectId);

  const [generating, setGenerating] = useState<string | null>(null);
  const [wordCounts, setWordCounts] = useState<Record<string, number>>({});
  const [writerNotes, setWriterNotes] = useState<Record<string, string>>({});
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});
  /** Opens generate modal with word count + custom instructions for this entry only */
  const [generateModalEntryId, setGenerateModalEntryId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLTableRowElement>(null);

  const { data: entriesData, isLoading: loading } = useQuery<CalendarWithBlogsResponse>({
    queryKey: ENTRIES_KEY,
    queryFn: () => calendarApi.withBlogs(projectId),
    enabled: !!projectId,
    staleTime: 0,
    gcTime: 30 * 60_000,
    refetchOnMount: "always",
  });
  const entries: CalendarEntryWithBlog[] = entriesData?.success ? (entriesData.data as CalendarEntryWithBlog[]) : [];

  const patchEntries = (mutator: (list: CalendarEntryWithBlog[]) => CalendarEntryWithBlog[]) => {
    queryClient.setQueryData(ENTRIES_KEY, (prev: CalendarWithBlogsResponse | undefined) => {
      if (!prev?.success) return prev;
      return { ...prev, data: mutator(prev.data as CalendarEntryWithBlog[]) } as CalendarWithBlogsResponse;
    });
  };

  useEffect(() => {
    if (highlightEntry && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  }, [highlightEntry, entries]);

  const handleGenerate = async (entryId: string) => {
    const wc = wordCounts[entryId] ?? 2500;
    setGenerating(entryId);
    setError((prev) => ({ ...prev, [entryId]: "" }));

    patchEntries((list) => list.map((e) => (e.id === entryId ? { ...e, status: "generating" } : e)));

    const notes = writerNotes[entryId]?.trim();
    const res = await blogsApi.generate({ entryId, wordCount: wc, writerNotes: notes || undefined });
    if (res.success && res.data) {
      patchEntries((list) =>
        list.map((e) =>
          e.id === entryId
            ? { ...e, status: "generated", title: res.data!.title, blog: res.data as CalendarEntryWithBlog["blog"] }
            : e
        )
      );
      dispatch(calendarRefreshBump({ projectId }));
      void queryClient.invalidateQueries({ queryKey: CALENDAR_KEY });
      void queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
      setGenerateModalEntryId(null);
    } else {
      patchEntries((list) => list.map((e) => (e.id === entryId ? { ...e, status: "scheduled" } : e)));
      setError((prev) => ({
        ...prev,
        [entryId]: !res.success ? res.error : "Generation failed",
      }));
    }
    setGenerating(null);
  };

  const handleStatusChange = async (entryId: string, blogId: string, status: BlogStatus) => {
    setSavingStatus(blogId);
    setError((prev) => ({ ...prev, [entryId]: "" }));
    const previous = queryClient.getQueryData<CalendarWithBlogsResponse>(ENTRIES_KEY);
    patchEntries((list) =>
      list.map((e) => (e.id === entryId && e.blog ? { ...e, blog: { ...e.blog, status } } : e))
    );

    const res = await blogsApi.updateStatus(blogId, status);
    if (!res.success) {
      if (previous) queryClient.setQueryData(ENTRIES_KEY, previous);
      setError((prev) => ({ ...prev, [entryId]: res.error ?? "Could not update blog status" }));
    } else {
      dispatch(calendarRefreshBump({ projectId }));
      void queryClient.invalidateQueries({ queryKey: CALENDAR_KEY });
      void queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
    }
    setSavingStatus(null);
  };

  const readyCount = entries.filter((e) => e.blog).length;
  const generateModalEntry = generateModalEntryId
    ? entries.find((e) => e.id === generateModalEntryId)
    : null;

  return (
    <div className="space-y-8 pb-16 max-w-full px-4 mx-auto">
      <div className="pt-4 pb-6 border-b border-border-subtle flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[48px] font-normal tracking-[-0.96px] leading-none text-text-primary font-display">
            Blog Generator
          </h1>
          <p className="mt-3 text-[15px] text-text-tertiary max-w-[480px]">
            Generate and export blogs from your content calendar. Titles update here and on the calendar when generation completes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {readyCount > 0 && (
            <span className="text-[13px] text-text-tertiary">
              <span className="font-semibold text-text-primary">{readyCount}</span> with drafts
            </span>
          )}
          <ProjectNavLink
            href={`/projects/${projectId}/calendar`}
            className="inline-flex h-10 items-center gap-2 rounded-[30px] border border-border-subtle bg-surface-elevated px-5 text-[14px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            Content calendar
          </ProjectNavLink>
        </div>
      </div>

      {loading ? (
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
          <TableSkeleton rows={8} columns={7} />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-border-strong bg-surface-secondary py-16 text-center">
          <p className="text-[15px] font-medium text-text-secondary">No scheduled entries yet</p>
          <p className="mt-1 text-[13px] text-text-tertiary">Schedule keywords on the content calendar first.</p>
          <ProjectNavLink
            href={`/projects/${projectId}/calendar`}
            className="mt-5 inline-flex items-center justify-center rounded-[32px] bg-brand-primary px-6 py-2.5 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90"
          >
            Open calendar
          </ProjectNavLink>
        </div>
      ) : (
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead className="bg-surface-secondary text-[10px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                <tr>
                  <th className="px-3 py-3 w-12 text-center">#</th>
                  <th className="px-4 py-3 w-28">Date</th>
                  <th className="px-4 py-3 min-w-[8rem]">Keyword</th>
                  <th className="px-4 py-3 min-w-[12rem]">Title</th>
                  <th className="px-4 py-3 w-24">Type</th>
                  <th className="px-4 py-3 w-36">Status</th>
                  <th className="px-4 py-3 text-right pr-4 w-[8.5rem]">Actions</th>
                </tr>
                </thead>
              <tbody className="divide-y divide-border-subtle/60">
                {entries.map((entry, entryIndex) => {
                  const hasBlog = Boolean(entry.blog);
                  const blogStatus = asBlogStatus(entry.blog?.status);
                  const effStatus = entry.status;
                  const statusCfg =
                    effStatus === "generating"
                      ? STATUS_CONFIG.generating
                      : hasBlog
                        ? STATUS_CONFIG[blogStatus] ?? STATUS_CONFIG.generated
                        : STATUS_CONFIG[effStatus] ?? STATUS_CONFIG.scheduled;
                  const isHighlighted = entry.id === highlightEntry;
                  const isGenerating = generating === entry.id;

                  return (
                    <tr
                      key={entry.id}
                      ref={isHighlighted ? highlightRef : null}
                      className={`hover:bg-surface-hover/50 transition-colors ${isHighlighted ? "bg-brand-action/6" : ""}`}
                    >
                      <td className="px-3 py-2.5 align-middle text-center text-[12px] font-mono text-text-tertiary tabular-nums">
                        {entryIndex + 1}
                      </td>
                      <td className="px-4 py-2.5 align-middle tabular-nums text-[12px] text-text-primary whitespace-nowrap">
                        {fmtDate(entry.scheduled_date)}
                      </td>
                      <td className="px-4 py-2.5 align-middle max-w-[11rem]">
                        <p className="truncate text-[13px] font-medium text-text-primary" title={entry.focus_keyword}>
                          {entry.focus_keyword}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 align-middle max-w-[18rem]">
                        <p className="truncate text-[13px] text-text-secondary" title={rowTitle(entry)}>
                          {rowTitle(entry)}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 align-middle text-[11px] text-text-tertiary whitespace-nowrap">
                        {entry.article_type}
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${statusCfg.color}`}>
                            {statusCfg.dot ? (
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusCfg.dot}`} />
                            ) : null}
                            {statusCfg.label}
                          </span>
                          {hasBlog && entry.blog && (
                            <select
                              value={blogStatus}
                              onChange={(e) =>
                                handleStatusChange(entry.id, entry.blog!.id, e.target.value as BlogStatus)
                              }
                              disabled={savingStatus === entry.blog.id}
                              className="max-w-[9.5rem] rounded-md border border-border-subtle bg-surface-secondary px-2 py-1 text-[11px] text-text-primary outline-none disabled:opacity-50"
                            >
                              {BLOG_STATUSES.map((s) => (
                                <option key={s.value} value={s.value}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 align-middle text-right">
                        {!hasBlog ? (
                          <button
                            type="button"
                            onClick={() => {
                              setError((prev) => ({ ...prev, [entry.id]: "" }));
                              setGenerateModalEntryId(entry.id);
                            }}
                            disabled={isGenerating || (generating !== null && !isGenerating)}
                            className="inline-flex h-8 items-center justify-center rounded-full bg-brand-primary min-w-[5.5rem] px-3 text-[11px] font-semibold text-brand-on-primary disabled:opacity-50"
                          >
                            {isGenerating ? "…" : "Generate"}
                          </button>
                        ) : (
                          <ProjectNavLink
                            href={`/projects/${projectId}/blogs/${entry.blog!.id}`}
                            className="inline-flex h-8 items-center justify-center rounded-full border border-border-subtle min-w-[5.5rem] px-3 text-[11px] font-semibold text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                          >
                            View Blog
                          </ProjectNavLink>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {generateModalEntry ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="blog-gen-modal-title"
          onClick={() => (generating !== null ? undefined : setGenerateModalEntryId(null))}
        >
          <div
            className="w-full max-w-lg rounded-[16px] border border-border-subtle bg-surface-elevated p-5 shadow-xl ring-1 ring-border-subtle/80"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 id="blog-gen-modal-title" className="text-[16px] font-medium text-text-primary">
              Generate blog
            </h4>
            <p className="mt-1 text-[13px] text-text-tertiary">
              <span className="font-medium text-text-secondary">{generateModalEntry.focus_keyword}</span>
              <span className="text-text-tertiary"> · {fmtDate(generateModalEntry.scheduled_date)}</span>
            </p>

            {error[generateModalEntry.id] ? (
              <p className="mt-3 text-[13px] text-brand-coral">{error[generateModalEntry.id]}</p>
            ) : null}

            <label className="mt-4 block text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
              Target length
            </label>
            <div className="relative mt-1.5">
              <select
                value={wordCounts[generateModalEntry.id] ?? 2500}
                onChange={(e) =>
                  setWordCounts((prev) => ({ ...prev, [generateModalEntry.id]: +e.target.value }))
                }
                disabled={generating === generateModalEntry.id}
                className="w-full rounded-[10px] border border-border-subtle bg-surface-secondary px-3 py-2.5 text-[13px] text-text-primary outline-none appearance-none pr-9 disabled:opacity-50"
              >
                {WORD_COUNT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt.toLocaleString()} words
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
              </svg>
            </div>

            <label className="mt-4 block text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
              Custom instructions &amp; angle (optional)
            </label>
            <p className="mt-1 text-[12px] text-text-tertiary leading-relaxed">
              Tone, audience, sections to emphasize, competitors to mention, or anything else for the model.
            </p>
            <textarea
              value={writerNotes[generateModalEntry.id] ?? ""}
              onChange={(e) =>
                setWriterNotes((prev) => ({ ...prev, [generateModalEntry.id]: e.target.value }))
              }
              placeholder="e.g. Compare our pricing to X; keep paragraphs short for mobile readers…"
              rows={4}
              disabled={generating === generateModalEntry.id}
              className="mt-2 w-full rounded-[10px] border border-border-subtle bg-surface-secondary px-3 py-2.5 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-brand-action/40 resize-y min-h-[96px] disabled:opacity-50"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGenerateModalEntryId(null)}
                disabled={generating === generateModalEntry.id}
                className="rounded-full border border-border-subtle px-4 py-2 text-[13px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleGenerate(generateModalEntry.id)}
                disabled={generating !== null}
                className="rounded-full bg-brand-primary px-5 py-2 text-[13px] font-semibold text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {generating === generateModalEntry.id ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
