"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getCalendarWithBlogs, generateBlog, updateBlogStatus } from "@/app/actions/blog-actions";
import { BlogStatus, WORD_COUNT_OPTIONS } from "@/lib/types";
import { exportToMarkdown, exportToHTML, exportToText, exportToDocx, triggerDownload } from "@/lib/export";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Scheduled", color: "bg-surface-elevated text-text-tertiary border-border-subtle" },
  generating: { label: "Generating...", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 animate-pulse" },
  generated: { label: "Generated", color: "bg-accent-500/10 text-accent-400 border-accent-500/20" },
  approved: { label: "Approved", color: "bg-brand-500/10 text-brand-400 border-brand-500/20" },
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

  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [wordCounts, setWordCounts] = useState<Record<string, number>>({});
  const [downloading, setDownloading] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});
  const highlightRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await getCalendarWithBlogs(projectId);
    if (res.success) setEntries(res.data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (highlightEntry && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  }, [highlightEntry, entries]);

  const handleGenerate = async (entryId: string) => {
    const wc = wordCounts[entryId] ?? 2500;
    setGenerating(entryId);
    setError(prev => ({ ...prev, [entryId]: "" }));

    // Optimistic UI
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, status: "generating" } : e));

    const res = await generateBlog(entryId, wc);
    if (res.success && res.data) {
      setEntries(prev => prev.map(e => e.id === entryId ? { ...e, status: "generated", blog: res.data } : e));
    } else {
      setEntries(prev => prev.map(e => e.id === entryId ? { ...e, status: "scheduled" } : e));
      setError(prev => ({ ...prev, [entryId]: res.error ?? "Generation failed" }));
    }
    setGenerating(null);
    await load();
  };

  const handleStatusChange = async (entryId: string, blogId: string, status: BlogStatus) => {
    setSavingStatus(blogId);
    setError(prev => ({ ...prev, [entryId]: "" }));
    const previous = entries;
    setEntries(prev =>
      prev.map(e =>
        e.id === entryId && e.blog
          ? { ...e, blog: { ...e.blog, status } }
          : e
      )
    );

    const res = await updateBlogStatus(blogId, status);
    if (!res.success) {
      setEntries(previous);
      setError(prev => ({ ...prev, [entryId]: res.error ?? "Could not update blog status" }));
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-primary mb-1">
            Blog <span className="gradient-text">Generator</span>
          </h1>
          <p className="text-text-tertiary text-sm">Generate blogs one at a time. Review each before downloading.</p>
        </div>
        {readyCount > 0 && (
          <div className="text-right">
            <p className="text-2xl font-black text-accent-400">{readyCount}</p>
            <p className="text-xs text-text-tertiary">blogs generated</p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-24 animate-pulse bg-surface-secondary/50 rounded-2xl border border-border-subtle" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-border-subtle rounded-3xl">
          <div className="text-5xl mb-4">📝</div>
          <h3 className="text-lg font-bold text-text-secondary mb-2">No calendar yet</h3>
          <p className="text-sm text-text-tertiary mb-4">Generate your content calendar first.</p>
          <Link href={`/projects/${projectId}/calendar`} className="text-brand-400 font-bold hover:underline text-sm">
            → Go to Calendar
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
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
                className={`glass-card p-5 transition-all ${isHighlighted ? "ring-2 ring-brand-500/40 border-brand-500/30" : ""}`}
              >
                <div className="flex items-start gap-4">
                  {/* Day number */}
                  <div className="w-14 h-14 rounded-xl bg-surface-elevated border border-border-subtle flex flex-col items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold text-text-tertiary uppercase">
                      {new Date(entry.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { month: "short" })}
                    </span>
                    <span className="text-lg font-black text-text-primary leading-none">
                      {new Date(entry.scheduled_date + "T00:00:00").getDate()}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <h3 className="text-sm font-bold text-text-primary leading-snug">{entry.title}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-text-tertiary">{entry.focus_keyword}</span>
                          <span className="text-[10px] text-text-tertiary/60">·</span>
                          <span className="text-[10px] text-text-tertiary">{entry.article_type}</span>
                          {hasBlog && (
                            <>
                              <span className="text-[10px] text-text-tertiary/60">·</span>
                              <span className="text-[10px] text-text-tertiary">{entry.blog.word_count.toLocaleString()} words</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>

                    {error[entry.id] && (
                      <p className="text-xs text-rose-400 mb-2">{error[entry.id]}</p>
                    )}

                    {hasBlog && (
                      <div className="mb-3 inline-flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-elevated/60 px-3 py-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
                          Status
                        </span>
                        <select
                          value={blogStatus}
                          onChange={e => handleStatusChange(entry.id, entry.blog.id, e.target.value as BlogStatus)}
                          disabled={savingStatus === entry.blog.id}
                          className="bg-transparent text-xs font-bold text-text-primary outline-none disabled:opacity-60"
                        >
                          {BLOG_STATUSES.map(status => (
                            <option key={status.value} value={status.value}>
                              {status.label}
                            </option>
                          ))}
                        </select>
                        {savingStatus === entry.blog.id && (
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-400" />
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-3 flex-wrap">
                      {!hasBlog ? (
                        <>
                          {/* Word count selector */}
                          <select
                            value={wc}
                            onChange={e => setWordCounts(prev => ({ ...prev, [entry.id]: +e.target.value }))}
                            className="text-[10px] font-bold bg-surface-elevated border border-border-subtle rounded-lg px-2 py-1.5 text-text-secondary outline-none"
                          >
                            {WORD_COUNT_OPTIONS.map(opt => (
                              <option key={opt} value={opt}>{opt.toLocaleString()} words</option>
                            ))}
                          </select>

                          <button
                            onClick={() => handleGenerate(entry.id)}
                            disabled={isGenerating || generating !== null}
                            className="px-5 py-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-[10px] font-bold shadow-md shadow-brand-500/20 hover:from-brand-400 hover:to-brand-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            {isGenerating ? (
                              <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Writing blog...</>
                            ) : "Generate Blog"}
                          </button>
                        </>
                      ) : (
                        <>
                          <Link
                            href={`/projects/${projectId}/blogs/${entry.blog.id}`}
                            className="px-4 py-1.5 rounded-lg bg-surface-elevated text-xs font-bold text-text-secondary border border-border-subtle hover:border-brand-500/30 hover:text-brand-400 transition-all"
                          >
                            View Blog
                          </Link>

                          {/* Download buttons */}
                          {(["markdown", "html", "txt", "docx"] as const).map(fmt => (
                            <button
                              key={fmt}
                              onClick={() => handleDownload(entry, fmt)}
                              disabled={downloading === entry.id + fmt}
                              className="px-3 py-1.5 rounded-lg bg-accent-500/10 text-accent-400 border border-accent-500/20 text-[10px] font-bold uppercase hover:bg-accent-500/20 transition-all disabled:opacity-60"
                            >
                              {downloading === entry.id + fmt ? "..." : `.${fmt === "markdown" ? "md" : fmt}`}
                            </button>
                          ))}

                          {/* Regenerate with word count */}
                          <select
                            value={wc}
                            onChange={e => setWordCounts(prev => ({ ...prev, [entry.id]: +e.target.value }))}
                            className="text-[10px] font-bold bg-surface-elevated border border-border-subtle rounded-lg px-2 py-1.5 text-text-secondary outline-none"
                          >
                            {WORD_COUNT_OPTIONS.map(opt => (
                              <option key={opt} value={opt}>{opt.toLocaleString()}w</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleGenerate(entry.id)}
                            disabled={isGenerating || generating !== null}
                            className="px-3 py-1.5 rounded-lg border border-border-subtle text-[10px] font-bold text-text-tertiary hover:text-text-secondary hover:border-brand-500/20 transition-all disabled:opacity-60"
                          >
                            Regenerate
                          </button>
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
