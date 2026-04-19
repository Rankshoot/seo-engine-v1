"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getBlogById, generateBlog } from "@/app/actions/blog-actions";
import { Blog, WORD_COUNT_OPTIONS, ExportFormat } from "@/lib/types";
import { exportToMarkdown, exportToHTML, exportToText, exportToDocx, triggerDownload } from "@/lib/export";
import SEOScorePanel from "@/components/dashboard/SEOScorePanel";

const FORMATS: { key: ExportFormat; label: string; color: string }[] = [
  { key: "markdown", label: ".md — Markdown", color: "bg-surface-elevated text-text-secondary border-border-subtle hover:border-brand-500/30 hover:text-brand-400" },
  { key: "html", label: ".html — Web Page", color: "bg-surface-elevated text-text-secondary border-border-subtle hover:border-cyan-500/30 hover:text-cyan-400" },
  { key: "txt", label: ".txt — Plain Text", color: "bg-surface-elevated text-text-secondary border-border-subtle hover:border-accent-500/30 hover:text-accent-400" },
  { key: "docx", label: ".docx — Word", color: "bg-brand-500/10 text-brand-400 border-brand-500/20 hover:bg-brand-500/20" },
];

export default function BlogViewerPage() {
  const { id: projectId, blogId } = useParams<{ id: string; blogId: string }>();

  const [blog, setBlog] = useState<Blog | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [wordCount, setWordCount] = useState(2500);
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState<"preview" | "raw">("preview");

  useEffect(() => {
    getBlogById(blogId).then(res => {
      if (res.success && res.data) setBlog(res.data);
      setLoading(false);
    });
  }, [blogId]);

  const handleDownload = async (format: ExportFormat) => {
    if (!blog) return;
    setDownloading(format);
    const slug = blog.slug || blog.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    let blob: Blob;
    if (format === "markdown") blob = exportToMarkdown(blog);
    else if (format === "html") blob = exportToHTML(blog);
    else if (format === "txt") blob = exportToText(blog);
    else blob = await exportToDocx(blog);
    triggerDownload(blob, `${slug}.${format === "markdown" ? "md" : format}`);
    setDownloading(null);
  };

  const handleRegenerate = async () => {
    if (!blog) return;
    setRegenerating(true);
    const res = await generateBlog(blog.entry_id, wordCount);
    if (res.success && res.data) setBlog(res.data);
    setRegenerating(false);
  };

  const handleCopy = async () => {
    if (!blog) return;
    await navigator.clipboard.writeText(blog.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-400 rounded-full animate-spin" />
          <p className="text-xs text-text-tertiary">Loading blog...</p>
        </div>
      </div>
    );
  }

  if (!blog) {
    return (
      <div className="text-center py-32">
        <p className="text-text-tertiary mb-4">Blog not found.</p>
        <Link href={`/projects/${projectId}/blogs`} className="text-brand-400 hover:underline font-bold">← Back to Blogs</Link>
      </div>
    );
  }

  const externalLinks = blog.external_links ?? [];
  const internalLinks = blog.internal_links ?? [];
  const researchSources = blog.research_sources ?? 0;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-text-tertiary">
        <Link href={`/projects/${projectId}/blogs`} className="hover:text-brand-400 transition-colors">Content History</Link>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" /></svg>
        <span className="text-text-secondary truncate max-w-sm">{blog.title}</span>
      </div>

      {/* Research badge */}
      {researchSources > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714a2.25 2.25 0 0 0 .659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 1-6.23-.607L5 14.5m14.8.5-1.57.393A9.065 9.065 0 0 1 12 15m0 0a9.065 9.065 0 0 1-6.23-.607m0 0L5 14.5M5 14.5l-1.27-.317"/></svg>
            Researched: {researchSources} live sources
          </span>
          {externalLinks.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-400 font-bold">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
              {externalLinks.length} external links
            </span>
          )}
          {internalLinks.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 font-bold">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
              {internalLinks.length} internal links
            </span>
          )}
        </div>
      )}

      {/* Main layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_310px] gap-8 items-start">
        {/* Left: Blog content */}
        <div className="glass-card p-0 overflow-hidden">
          {/* Content toolbar */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border-subtle">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-elevated border border-border-subtle">
              {(["preview", "raw"] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setActiveView(v)}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold capitalize transition-all ${activeView === v ? "bg-brand-500 text-white" : "text-text-tertiary hover:text-text-secondary"}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-text-tertiary">
              <span>{blog.word_count.toLocaleString()} words</span>
              <span className="text-text-tertiary/40">·</span>
              <span>~{Math.ceil(blog.word_count / 200)} min read</span>
              <button
                onClick={handleCopy}
                className="ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border-subtle text-[10px] font-bold hover:text-text-secondary transition-all"
              >
                {copied ? "Copied!" : "Copy MD"}
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-8">
            {activeView === "preview" ? (
              <div className="prose prose-invert prose-sm max-w-none
                prose-headings:font-black prose-headings:text-text-primary
                prose-h1:text-3xl prose-h1:leading-tight prose-h1:mb-4
                prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-h2:border-b prose-h2:border-border-subtle prose-h2:pb-2
                prose-h3:text-base prose-h3:mt-5 prose-h3:mb-2
                prose-p:text-text-secondary prose-p:leading-relaxed prose-p:my-3
                prose-strong:text-text-primary
                prose-a:text-brand-400 prose-a:no-underline hover:prose-a:underline
                prose-ul:space-y-1 prose-li:text-text-secondary
                prose-code:text-accent-400 prose-code:bg-surface-elevated prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {blog.content}
                </ReactMarkdown>
              </div>
            ) : (
              <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
                {blog.content}
              </pre>
            )}
          </div>
        </div>

        {/* Right: Sidebar panels */}
        <div className="space-y-4 xl:sticky xl:top-6">
          {/* SEO Score */}
          <SEOScorePanel blog={blog} />

          {/* Target Keyword */}
          <div className="glass-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Target Keyword</p>
            <p className="text-sm font-bold text-text-primary">{blog.target_keyword}</p>
          </div>

          {/* Article Type */}
          <div className="glass-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Article Type</p>
            <p className="text-sm font-bold text-text-primary">{blog.article_type}</p>
          </div>

          {/* Slug */}
          <div className="glass-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Slug</p>
            <p className="text-xs font-mono text-text-secondary bg-surface-elevated px-3 py-2 rounded-lg border border-border-subtle break-all">/{blog.slug}</p>
          </div>

          {/* Meta description */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Meta Description</p>
              <span className={`text-[10px] font-bold ${blog.meta_description.length >= 140 && blog.meta_description.length <= 165 ? "text-accent-400" : "text-rose-400"}`}>
                {blog.meta_description.length}/160
              </span>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">{blog.meta_description}</p>
          </div>

          {/* Links summary */}
          {(externalLinks.length > 0 || internalLinks.length > 0) && (
            <div className="glass-card p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Links</p>
              {externalLinks.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-text-tertiary mb-1.5">External ({externalLinks.length})</p>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {externalLinks.slice(0, 5).map((url, i) => {
                      let host = url;
                      try { host = new URL(url).hostname; } catch { /* */ }
                      return (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 text-[10px] text-brand-400 hover:underline truncate">
                          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                          {host}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
              {internalLinks.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-text-tertiary mb-1.5">Internal ({internalLinks.length})</p>
                  <div className="space-y-1">
                    {internalLinks.slice(0, 4).map((path, i) => (
                      <p key={i} className="text-[10px] font-mono text-accent-400 truncate">{path}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Download */}
          <div className="glass-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-3">Download</p>
            <div className="space-y-2">
              {FORMATS.map(fmt => (
                <button
                  key={fmt.key}
                  onClick={() => handleDownload(fmt.key)}
                  disabled={downloading === fmt.key}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-xs font-bold transition-all ${fmt.color} disabled:opacity-60`}
                >
                  <span>{fmt.label}</span>
                  {downloading === fmt.key ? (
                    <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Regenerate */}
          <div className="glass-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-3">Regenerate</p>
            <p className="text-[10px] text-text-tertiary mb-2">Re-runs full research + rewrite with Gemini AI</p>
            <select value={wordCount} onChange={e => setWordCount(+e.target.value)} className="input-field w-full text-xs mb-3">
              {WORD_COUNT_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt.toLocaleString()} words</option>
              ))}
            </select>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="w-full py-2.5 rounded-xl border border-border-subtle text-xs font-bold text-text-tertiary hover:text-text-secondary hover:border-brand-500/30 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {regenerating ? (
                <><div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Researching & writing...</>
              ) : "Regenerate with Research"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
