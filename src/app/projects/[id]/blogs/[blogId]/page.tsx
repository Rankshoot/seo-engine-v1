"use client";

import { useState, useEffect, useMemo, type AnchorHTMLAttributes, type ComponentType, type HTMLAttributes, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
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

      {/* Repair banner — only shown when this blog was generated from the audit */}
      {blog.source_url && blog.article_type === "Repair" && (
        <RepairBanner
          sourceUrl={blog.source_url}
          repairNotes={blog.repair_notes ?? []}
          projectId={projectId}
        />
      )}

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
          {activeView === "preview" ? (
            <EditorialPreview blog={blog} />
          ) : (
            <div className="p-8">
              <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
                {blog.content}
              </pre>
            </div>
          )}
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

// ─────────────────────────────────────────────────────────────────────────────
// Repair banner — surfaces what changed from the original URL.
// ─────────────────────────────────────────────────────────────────────────────

function RepairBanner({
  sourceUrl,
  repairNotes,
  projectId,
}: {
  sourceUrl: string;
  repairNotes: string[];
  projectId: string;
}) {
  const [open, setOpen] = useState(repairNotes.length > 0);

  return (
    <div className="rounded-2xl border border-brand-500/30 bg-gradient-to-r from-brand-500/10 to-accent-500/10 px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/20 text-brand-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.847-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-400">Repair draft</p>
            <p className="text-sm text-text-primary">
              AI rewrite of{" "}
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-brand-400 underline decoration-brand-500/40 underline-offset-2 hover:decoration-brand-400"
                title={`Open the original page — ${sourceUrl}`}
              >
                {sourceUrl}
              </a>
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              Preview below shows the repaired version as it would appear once published. Replace the content on your
              CMS, or download it in any format from the sidebar.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {repairNotes.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen(v => !v)}
              className="rounded-xl border border-accent-500/30 bg-accent-500/10 px-3 py-2 text-xs font-bold text-accent-400 hover:bg-accent-500/20"
            >
              {open ? "Hide changes" : `See ${repairNotes.length} change${repairNotes.length === 1 ? "" : "s"}`}
            </button>
          )}
          <Link
            href={`/projects/${projectId}/audit`}
            className="rounded-xl border border-brand-500/30 bg-surface-elevated px-4 py-2 text-xs font-bold text-brand-400 hover:bg-brand-500/10"
          >
            Back to audit
          </Link>
        </div>
      </div>

      {open && repairNotes.length > 0 && (
        <div className="mt-4 rounded-xl border border-accent-500/20 bg-surface-primary/60 p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-accent-400">
            What the AI changed
          </p>
          <ul className="space-y-1.5 text-sm text-text-secondary">
            {repairNotes.map((note, i) => (
              <li key={i} className="flex items-start gap-2">
                <svg
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Editorial preview — renders the Markdown as it'd appear on a public blog:
//   · Centered, constrained reading column (max ~720px, like Medium/Substack).
//   · Serif-leaning body copy with generous line-height and paragraph spacing.
//   · Hero: category pill, H1, meta row (read time, date).
//   · Rich link pills: every [text](url) becomes an underlined, tooltip-bearing
//     anchor that opens in a new tab, with an inline ↗ icon for external links.
//   · FAQ / Key takeaways / blockquotes all get distinct treatments.
// ─────────────────────────────────────────────────────────────────────────────

function EditorialPreview({ blog }: { blog: Blog }) {
  const internalSet = useMemo(() => new Set(blog.internal_links ?? []), [blog.internal_links]);

  // Strip the first H1 from the content so we can render it as the hero title
  // and avoid a duplicate H1 inside the body.
  const { heroTitle, body } = useMemo(() => {
    const h1 = blog.content.match(/^\s*#\s+(.+)\s*$/m);
    if (!h1) return { heroTitle: blog.title, body: blog.content };
    const stripped = blog.content.replace(h1[0], "").replace(/^\n+/, "");
    return { heroTitle: h1[1].replace(/\*+/g, "").trim(), body: stripped };
  }, [blog.content, blog.title]);

  const components = useMemo(
    () => buildMarkdownComponents(internalSet),
    [internalSet]
  );

  const publishedDate = new Date(blog.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <article className="mx-auto max-w-[720px] px-6 py-10 sm:px-10 sm:py-14">
      {/* Hero */}
      <header className="mb-10 border-b border-border-subtle pb-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {blog.article_type && (
            <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-400">
              {blog.article_type}
            </span>
          )}
          {blog.target_keyword && (
            <span className="text-[11px] text-text-tertiary">
              Targets <span className="font-bold text-text-secondary">{blog.target_keyword}</span>
            </span>
          )}
        </div>
        <h1 className="mb-4 text-[34px] font-black leading-[1.15] tracking-tight text-text-primary sm:text-[40px]">
          {heroTitle}
        </h1>
        {blog.meta_description && (
          <p className="text-lg leading-relaxed text-text-secondary">{blog.meta_description}</p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
          <span>{publishedDate}</span>
          <span className="text-text-tertiary/40">·</span>
          <span>{Math.max(1, Math.ceil(blog.word_count / 200))} min read</span>
          <span className="text-text-tertiary/40">·</span>
          <span>{blog.word_count.toLocaleString()} words</span>
        </div>
      </header>

      {/* Body */}
      <div className="editorial-body space-y-5 text-[17px] leading-[1.75] text-text-secondary">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {body}
        </ReactMarkdown>
      </div>

      {/* Footer — like a published blog "end of article" mark */}
      <footer className="mt-14 border-t border-border-subtle pt-6 text-[11px] text-text-tertiary">
        <p>— End of article —</p>
      </footer>
    </article>
  );
}

// Build ReactMarkdown component overrides. Factoring out so we can memoize
// against the internal-link set.
function buildMarkdownComponents(internalSet: Set<string>): Components {
  const MarkdownLink: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement>> = ({
    href = "",
    children,
    ...rest
  }) => {
    const isExternal = /^https?:\/\//i.test(href);
    const isKnownInternal = internalSet.has(href) || href.startsWith("/");
    const isInternal = isKnownInternal && !isExternal ? true : internalSet.has(href);
    const label = typeof children === "string" ? children : flattenChildren(children);

    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        title={`${isInternal ? "Internal link · " : isExternal ? "External link · " : ""}${href}`}
        data-external={isExternal ? "true" : undefined}
        className={
          isInternal
            ? "font-semibold text-brand-400 underline decoration-brand-500/40 decoration-2 underline-offset-[3px] transition-colors hover:bg-brand-500/10 hover:decoration-brand-400 rounded-sm px-0.5"
            : "font-semibold text-accent-400 underline decoration-accent-500/40 decoration-2 underline-offset-[3px] transition-colors hover:bg-accent-500/10 hover:decoration-accent-400 rounded-sm px-0.5 inline-flex items-baseline gap-0.5"
        }
        {...rest}
      >
        {label}
        {isExternal && (
          <svg
            className="relative top-px inline h-3 w-3 opacity-70"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
            />
          </svg>
        )}
      </a>
    );
  };

  const Heading1: ComponentType<HTMLAttributes<HTMLHeadingElement>> = ({ children, ...rest }) => (
    <h1
      className="mt-10 mb-5 text-3xl font-black leading-tight tracking-tight text-text-primary"
      {...rest}
    >
      {children}
    </h1>
  );

  const Heading2: ComponentType<HTMLAttributes<HTMLHeadingElement>> = ({ children, ...rest }) => (
    <h2
      className="mt-12 mb-4 text-2xl font-black leading-snug tracking-tight text-text-primary"
      {...rest}
    >
      {children}
    </h2>
  );

  const Heading3: ComponentType<HTMLAttributes<HTMLHeadingElement>> = ({ children, ...rest }) => (
    <h3 className="mt-8 mb-3 text-lg font-bold text-text-primary" {...rest}>
      {children}
    </h3>
  );

  const Paragraph: ComponentType<HTMLAttributes<HTMLParagraphElement>> = ({ children, ...rest }) => (
    <p className="text-[17px] leading-[1.75] text-text-secondary" {...rest}>
      {children}
    </p>
  );

  const Strong: ComponentType<HTMLAttributes<HTMLElement>> = ({ children, ...rest }) => (
    <strong className="font-bold text-text-primary" {...rest}>
      {children}
    </strong>
  );

  const Emphasis: ComponentType<HTMLAttributes<HTMLElement>> = ({ children, ...rest }) => (
    <em className="italic text-text-primary/90" {...rest}>
      {children}
    </em>
  );

  const UnorderedList: ComponentType<HTMLAttributes<HTMLUListElement>> = ({ children, ...rest }) => (
    <ul className="my-5 space-y-2 pl-6 [&>li]:relative [&>li]:pl-2 [&>li]:marker:text-brand-400" {...rest}>
      {children}
    </ul>
  );

  const OrderedList: ComponentType<HTMLAttributes<HTMLOListElement>> = ({ children, ...rest }) => (
    <ol className="my-5 list-decimal space-y-2 pl-6 [&>li]:marker:font-bold [&>li]:marker:text-brand-400" {...rest}>
      {children}
    </ol>
  );

  const ListItem: ComponentType<HTMLAttributes<HTMLLIElement>> = ({ children, ...rest }) => (
    <li className="text-[17px] leading-[1.7] text-text-secondary [&>p]:my-0!" {...rest}>
      {children}
    </li>
  );

  const Blockquote: ComponentType<HTMLAttributes<HTMLQuoteElement>> = ({ children, ...rest }) => (
    <blockquote
      className="my-6 rounded-r-lg border-l-4 border-brand-500 bg-brand-500/5 px-5 py-4 text-[17px] italic leading-[1.7] text-text-primary [&>p]:my-0!"
      {...rest}
    >
      {children}
    </blockquote>
  );

  // react-markdown passes `className="language-xxx"` on fenced code blocks.
  // Inline code has no className — we style it as a pill; fenced code lives
  // inside our <pre> renderer and should stay unstyled.
  const InlineCode: ComponentType<HTMLAttributes<HTMLElement> & { className?: string }> = ({
    children,
    className,
    ...rest
  }) => {
    const isFenced = typeof className === "string" && /language-/i.test(className);
    if (isFenced) {
      return (
        <code className={`${className} font-mono text-[13px] text-text-secondary`} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded-md border border-border-subtle bg-surface-elevated px-1.5 py-0.5 text-[0.85em] font-mono text-accent-400"
        {...rest}
      >
        {children}
      </code>
    );
  };

  const Preformatted: ComponentType<HTMLAttributes<HTMLPreElement>> = ({ children, ...rest }) => (
    <pre
      className="my-6 overflow-x-auto rounded-xl border border-border-subtle bg-surface-primary p-4 text-[13px] leading-relaxed text-text-secondary"
      {...rest}
    >
      {children}
    </pre>
  );

  const HorizontalRule: ComponentType<HTMLAttributes<HTMLHRElement>> = props => (
    <hr className="my-10 border-t border-border-subtle" {...props} />
  );

  const Table: ComponentType<HTMLAttributes<HTMLTableElement>> = ({ children, ...rest }) => (
    <div className="my-6 overflow-x-auto rounded-xl border border-border-subtle">
      <table className="w-full border-collapse text-sm" {...rest}>
        {children}
      </table>
    </div>
  );

  const TableHead: ComponentType<HTMLAttributes<HTMLTableSectionElement>> = ({ children, ...rest }) => (
    <thead className="bg-surface-elevated text-left text-[11px] font-bold uppercase tracking-wider text-text-tertiary" {...rest}>
      {children}
    </thead>
  );

  const TableRow: ComponentType<HTMLAttributes<HTMLTableRowElement>> = ({ children, ...rest }) => (
    <tr className="border-t border-border-subtle" {...rest}>
      {children}
    </tr>
  );

  const TableCell: ComponentType<HTMLAttributes<HTMLTableCellElement>> = ({ children, ...rest }) => (
    <td className="px-4 py-2.5 align-top text-text-secondary" {...rest}>
      {children}
    </td>
  );

  const TableHeaderCell: ComponentType<HTMLAttributes<HTMLTableCellElement>> = ({ children, ...rest }) => (
    <th className="px-4 py-2.5 align-top" {...rest}>
      {children}
    </th>
  );

  // React-markdown's Components map expects these keys; cast unifies ref types.
  return {
    a: MarkdownLink,
    h1: Heading1,
    h2: Heading2,
    h3: Heading3,
    p: Paragraph,
    strong: Strong,
    em: Emphasis,
    ul: UnorderedList,
    ol: OrderedList,
    li: ListItem,
    blockquote: Blockquote,
    code: InlineCode,
    pre: Preformatted,
    hr: HorizontalRule,
    table: Table,
    thead: TableHead,
    tr: TableRow,
    td: TableCell,
    th: TableHeaderCell,
  } as unknown as Components;
}

function flattenChildren(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenChildren).join("");
  return "";
}
