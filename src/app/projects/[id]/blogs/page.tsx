"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { getCalendarWithBlogs, generateBlog, updateBlogStatus } from "@/app/actions/blog-actions";
import { BlogStatus, WORD_COUNT_OPTIONS } from "@/lib/types";
import { exportToMarkdown, exportToHTML, exportToText, exportToDocx, triggerDownload } from "@/lib/export";

type CalendarWithBlogsResponse = Awaited<ReturnType<typeof getCalendarWithBlogs>>;

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Scheduled", color: "bg-surface-secondary text-text-tertiary border-border-subtle" },
  generating: { label: "Generating...", color: "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20 animate-pulse" },
  generated: { label: "Generated", color: "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20" },
  approved: { label: "Approved", color: "bg-brand-action/10 text-brand-action border-brand-action/20" },
  published: { label: "Published", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
};

const BLOG_STATUSES: Array<{ value: BlogStatus; label: string }> = [
  { value: "generated", label: "Generated" },
  { value: "approved", label: "Approved" },
  { value: "published", label: "Published" },
];

function asBlogStatus(status: string | undefined): BlogStatus {
  return status === "approved" || status === "published" ? status : "generated";
}

export default function BlogsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const highlightEntry = searchParams.get("entry");
  const queryClient = useQueryClient();

  const ENTRIES_KEY = qk.calendarWithBlogs(projectId);

  const [generating, setGenerating] = useState<string | null>(null);
  const [wordCounts, setWordCounts] = useState<Record<string, number>>({});
  const [downloading, setDownloading] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});
  const highlightRef = useRef<HTMLDivElement>(null);

  const { data: entriesData, isLoading: loading } = useQuery<CalendarWithBlogsResponse>({
    queryKey: ENTRIES_KEY,
    queryFn: () => getCalendarWithBlogs(projectId),
    enabled: !!projectId,
    // Always refetch on mount — the Calendar page may have rescheduled an
    // entry while this page was unmounted. Stale dates here would mislead
    // the user about when their blogs are due.
    staleTime: 0,
    gcTime: 30 * 60_000,
    refetchOnMount: 'always',
  });
  const entries: any[] = entriesData?.success ? entriesData.data : [];

  /** Patch the cached entries list. Used for optimistic blog generation/status. */
  const patchEntries = (mutator: (list: any[]) => any[]) => {
    queryClient.setQueryData(ENTRIES_KEY, (prev: CalendarWithBlogsResponse | undefined) => {
      if (!prev?.success) return prev;
      return { ...prev, data: mutator(prev.data as any[]) } as CalendarWithBlogsResponse;
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
    setError(prev => ({ ...prev, [entryId]: "" }));

    // Optimistic UI: flip to "generating" immediately.
    patchEntries(list => list.map(e => e.id === entryId ? { ...e, status: "generating" } : e));

    const res = await generateBlog(entryId, wc);
    if (res.success && res.data) {
      // res.data already contains all server-side fields (slug, word_count, etc.)
      // so the optimistic patch is the final state — no extra network call needed.
      patchEntries(list => list.map(e => e.id === entryId ? { ...e, status: "generated", blog: res.data } : e));
      queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
    } else {
      patchEntries(list => list.map(e => e.id === entryId ? { ...e, status: "scheduled" } : e));
      setError(prev => ({ ...prev, [entryId]: res.error ?? "Generation failed" }));
    }
    setGenerating(null);
  };

  const handleStatusChange = async (entryId: string, blogId: string, status: BlogStatus) => {
    setSavingStatus(blogId);
    setError(prev => ({ ...prev, [entryId]: "" }));
    const previous = queryClient.getQueryData<CalendarWithBlogsResponse>(ENTRIES_KEY);
    patchEntries(list =>
      list.map(e => e.id === entryId && e.blog ? { ...e, blog: { ...e.blog, status } } : e)
    );

    const res = await updateBlogStatus(blogId, status);
    if (!res.success) {
      if (previous) queryClient.setQueryData(ENTRIES_KEY, previous);
      setError(prev => ({ ...prev, [entryId]: res.error ?? "Could not update blog status" }));
    } else {
      queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
    }
    setSavingStatus(null);
  };

  const handleDownload = async (entry: any, format: "markdown" | "html" | "txt" | "docx") => {
    if (!entry.blog) return;
    setDownloading(entry.id + format);

    // Fetch full blog
    const { getBlogById } = await import("@/app/actions/blog-actions");
    const res = await getBlogById(entry.blog.id);
    if (!res.success || !res.data) { setDownloading(null); return; }

    const blog = res.data;
    const slug = blog.slug || blog.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    let blob: Blob;
    let ext: string;
    if (format === "markdown") { blob = exportToMarkdown(blog); ext = "md"; }
    else if (format === "html") { blob = exportToHTML(blog); ext = "html"; }
    else if (format === "txt") { blob = exportToText(blog); ext = "txt"; }
    else { blob = await exportToDocx(blog); ext = "docx"; }

    triggerDownload(blob, `${slug}.${ext}`);
    setDownloading(null);
  };

  const readyCount = entries.filter(e => e.blog).length;

  return (
    <div className="space-y-10 pb-16 pl-4 pr-4 mx-auto">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="pt-4 pb-8 border-b border-border-subtle flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[48px] font-normal tracking-[-0.96px] leading-none text-text-primary font-display">
            Blog Generator
          </h1>
          <p className="mt-3 text-[16px] text-text-tertiary max-w-[600px]">
            Generate blogs one at a time. Review each before downloading.
          </p>
        </div>
        {readyCount > 0 && (
          <div className="text-right">
            <p className="text-[28px] font-normal tracking-tight text-text-primary font-display">{readyCount}</p>
            <p className="text-[12px] font-bold uppercase tracking-widest text-text-tertiary">blogs generated</p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse bg-surface-elevated rounded-[16px] border border-border-subtle" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-border-strong bg-surface-secondary py-24 text-center">
          <div className="mb-6 flex justify-center">
            <div className="w-16 h-16 rounded-[16px] bg-surface-tertiary flex items-center justify-center text-text-primary border border-border-subtle">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </div>
          </div>
          <h3 className="mb-3 text-[24px] font-normal tracking-[-0.24px] text-text-primary font-display">No calendar yet</h3>
          <p className="mb-8 text-[16px] text-text-tertiary max-w-md mx-auto">
            Generate your content calendar first.
          </p>
          <Link href={`/projects/${projectId}/calendar`} className="inline-flex items-center justify-center rounded-[32px] bg-brand-primary px-6 py-3 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90">
            Go to Calendar
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {entries.map((entry: any, i: number) => {
            const hasBlog = Boolean(entry.blog);
            const blogStatus = asBlogStatus(entry.blog?.status);
            const cfg = hasBlog ? STATUS_CONFIG[blogStatus] : (STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.scheduled);
            const isHighlighted = entry.id === highlightEntry;
            const isGenerating = generating === entry.id;
            const wc = wordCounts[entry.id] ?? 2500;

            return (
              <div
                key={entry.id}
                ref={isHighlighted ? highlightRef : null}
                className={`rounded-[16px] border border-border-subtle bg-surface-elevated p-6 transition-all ${
                  isHighlighted ? "ring-2 ring-brand-action/40 border-brand-action/30" : ""
                }`}
              >
                <div className="flex flex-col md:flex-row items-start gap-6">
                  {/* Day number */}
                  <div className="w-16 h-16 rounded-[12px] bg-surface-secondary border border-border-subtle flex flex-col items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest">
                      {new Date(entry.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { month: "short" })}
                    </span>
                    <span className="text-[20px] font-bold text-text-primary leading-none mt-1 font-mono">
                      {new Date(entry.scheduled_date + "T00:00:00").getDate()}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 w-full">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-[18px] font-medium text-text-primary leading-snug">
                          {entry.title && entry.title.trim()
                            ? entry.title
                            : <span className="text-text-tertiary italic">{entry.focus_keyword}</span>}
                        </h3>
                        <div className="flex flex-wrap items-center gap-3 mt-2">
                          <span className="text-[12px] font-mono text-brand-action/70">{entry.focus_keyword}</span>
                          <span className="text-[13px] text-text-tertiary/40">·</span>
                          <span className="text-[13px] text-text-tertiary">{entry.article_type}</span>
                          {hasBlog && (
                            <>
                              <span className="text-[13px] text-text-tertiary/40">·</span>
                              <span className="text-[13px] text-text-tertiary">{entry.blog.word_count.toLocaleString()} words</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className={`inline-flex items-center justify-center text-[11px] font-bold px-2.5 py-1 rounded-full border shrink-0 uppercase tracking-widest ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>

                    {error[entry.id] && (
                      <p className="text-[13px] text-brand-coral mb-4">{error[entry.id]}</p>
                    )}

                    {hasBlog && (
                      <div className="mb-4 inline-flex items-center gap-3 rounded-[8px] border border-border-subtle bg-surface-secondary px-3 py-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
                          Status
                        </span>
                        <select
                          value={blogStatus}
                          onChange={e => handleStatusChange(entry.id, entry.blog.id, e.target.value as BlogStatus)}
                          disabled={savingStatus === entry.blog.id}
                          className="bg-transparent text-[13px] font-medium text-text-primary outline-none disabled:opacity-60 cursor-pointer"
                        >
                          {BLOG_STATUSES.map(status => (
                            <option key={status.value} value={status.value}>
                              {status.label}
                            </option>
                          ))}
                        </select>
                        {savingStatus === entry.blog.id && (
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-text-tertiary border-t-text-primary" />
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-3">
                      {!hasBlog ? (
                        <>
                          {/* Word count selector */}
                          <select
                            value={wc}
                            onChange={e => setWordCounts(prev => ({ ...prev, [entry.id]: +e.target.value }))}
                            className="text-[13px] font-medium bg-surface-secondary border border-border-subtle rounded-[4px] px-3 py-2 text-text-secondary outline-none hover:border-brand-action transition-colors cursor-pointer"
                          >
                            {WORD_COUNT_OPTIONS.map(opt => (
                              <option key={opt} value={opt}>{opt.toLocaleString()} words</option>
                            ))}
                          </select>

                          <button
                            onClick={() => handleGenerate(entry.id)}
                            disabled={isGenerating || generating !== null}
                            className="rounded-[32px] bg-brand-primary px-5 py-2 text-[13px] font-medium text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
                          >
                            {isGenerating ? (
                              <><div className="w-3.5 h-3.5 border-2 border-brand-on-primary/30 border-t-brand-on-primary rounded-full animate-spin" /> Writing blog...</>
                            ) : "Generate Blog"}
                          </button>
                        </>
                      ) : (
                        <>
                          <Link
                            href={`/projects/${projectId}/blogs/${entry.blog.id}`}
                            className="rounded-[30px] border border-border-subtle bg-surface-secondary px-5 py-2 text-[13px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
                          >
                            View Blog
                          </Link>

                          {/* Download buttons */}
                          <div className="flex flex-wrap items-center gap-2 border-l border-border-subtle pl-3 ml-1">
                            {(["markdown", "html", "txt", "docx"] as const).map(fmt => (
                              <button
                                key={fmt}
                                onClick={() => handleDownload(entry, fmt)}
                                disabled={downloading === entry.id + fmt}
                                className="rounded-[4px] bg-surface-secondary text-text-secondary border border-border-subtle px-3 py-2 text-[11px] font-bold uppercase tracking-widest hover:bg-surface-hover hover:text-text-primary transition-all disabled:opacity-60"
                              >
                                {downloading === entry.id + fmt ? "..." : `.${fmt === "markdown" ? "md" : fmt}`}
                              </button>
                            ))}
                          </div>

                          {/* Regenerate with word count */}
                          <div className="flex flex-wrap items-center gap-2 border-l border-border-subtle pl-3 ml-1">
                            <select
                              value={wc}
                              onChange={e => setWordCounts(prev => ({ ...prev, [entry.id]: +e.target.value }))}
                              className="text-[13px] font-medium bg-surface-secondary border border-border-subtle rounded-[4px] px-3 py-2 text-text-secondary outline-none hover:border-brand-action transition-colors cursor-pointer"
                            >
                              {WORD_COUNT_OPTIONS.map(opt => (
                                <option key={opt} value={opt}>{opt.toLocaleString()}w</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleGenerate(entry.id)}
                              disabled={isGenerating || generating !== null}
                              className="rounded-[4px] border border-border-subtle bg-surface-secondary px-4 py-2 text-[13px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-60"
                            >
                              Regenerate
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
