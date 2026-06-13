"use client";

import {
  useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, memo, lazy, Suspense,
  isValidElement, Children, type ReactElement,
  type AnchorHTMLAttributes, type ComponentType,
  type HTMLAttributes, type ImgHTMLAttributes, type ReactNode,
  type RefObject,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useParams, useSearchParams } from "next/navigation";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { blogsApi } from "@/frontend/api/blogs";
import { projectsApi } from "@/frontend/api/projects";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, useProject, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
import toast from "react-hot-toast";
import { Blog, BlogSeoIssueKey, BlogStatus, WORD_COUNT_OPTIONS, ExportFormat, type CalendarEntry } from "@/lib/types";
import type { Project } from "@/lib/types";
import { exportToMarkdown, exportToHTML, exportToText, exportToDocx, triggerBlogDownload } from "@/lib/export";
import { normalizeSiteHost, reclassifyBlogLinkSidebarLists } from "@/lib/blog-content";
import SEOScorePanel from "@/components/dashboard/SEOScorePanel";
import { computeSEOScore } from "@/lib/seo-analyzer";
import { BlogAiRewriterModal } from "@/components/BlogAiRewriterModal";
import type { BlogDeepAnalysisResult } from "@/lib/blog-deep-analysis-types";

// Lazy load heavy modals to improve initial page load
const BlogDeepAnalysisModal = lazy(() =>
  import("@/components/BlogDeepAnalysisModal").then(m => ({
    default: m.BlogDeepAnalysisModal,
  }))
);
import { extractInlineMarkdownLinks, type BlogRewriteSelectionSnapshot } from "@/lib/blog-editor-rewrite-selection";
import { rangeSelectionToMarkdown, rangeSelectionHtmlFragment } from "@/lib/editor-selection-markdown";
import { analyzeBlogContent, type BlogContentAnalysis } from "@/app/actions/blog-actions";
import { calendarApi } from "@/frontend/api/calendar";
import { CalendarDatePicker } from "@/components/CalendarDatePicker";
import { PreviewerScheduler, PreviewShell } from "@/components/content-generator/shared";
import { TipTapBlogEditor, type TipTapBlogEditorRef } from "@/components/content-generator/shared/TipTapBlogEditor";
import { normalizeMarkdownImages } from "@/services/openAiImages";

const BRAND = { actionBlue: "#1863dc", coral: "#ff7759" } as const;

const V = {
  bg:      "var(--surface-primary)",
  bgSec:   "var(--surface-secondary)",
  bgEl:    "var(--surface-elevated)",
  border:  "var(--border-default)",
  borderS: "var(--border-subtle)",
  txt:     "var(--text-primary)",
  txtSec:  "var(--text-secondary)",
  txtMute: "var(--text-tertiary)",
  action:  "var(--brand-action)",
  coral:   "var(--brand-coral)",
} as const;

const MONO = { fontFamily: "CohereMono, monospace", letterSpacing: "0.28px" } as const;

/** Query value for `?from=` — set when opening the blog viewer from Analyze content (`/audit/import`). */
const BLOG_VIEW_FROM_ANALYZE_CONTENT = "analyze-content";

const FORMATS: { key: ExportFormat; label: string; ext: string }[] = [
  { key: "markdown", label: "Markdown",   ext: ".md"   },
  { key: "html",     label: "Web Page",   ext: ".html" },
  { key: "txt",      label: "Plain Text", ext: ".txt"  },
  { key: "docx",     label: "Word",       ext: ".docx" },
];

const BLOG_STATUSES: Array<{ value: BlogStatus; label: string; hint: string; color: string }> = [
  { value: "generated", label: "Generated",  hint: "Draft written and ready for review.",   color: V.txtMute },
  { value: "approved",  label: "Approved",   hint: "Reviewed and approved for publishing.", color: V.action  },
  { value: "published", label: "Published",  hint: "Marked live on your website or CMS.",   color: "#16a34a" },
];

function asBlogStatus(s: string | undefined): BlogStatus {
  return s === "approved" || s === "published" ? s : "generated";
}

function normalizeBlogPlaceholders(blog: Blog): Blog;
function normalizeBlogPlaceholders(blog: Blog | null): Blog | null;
function normalizeBlogPlaceholders(blog: Blog | null): Blog | null {
  if (!blog || !blog.content) return blog;
  return {
    ...blog,
    content: normalizeMarkdownImages(blog.content),
  };
}

// ─── Inset section divider ─────────────────────────────────────────────────
function Divider() {
  return <div className="h-px mx-4 bg-border-subtle opacity-70" />;
}


// ─── Sidebar section label ─────────────────────────────────────────────────
function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-semibold uppercase tracking-[0.8px] text-text-tertiary mb-1.5" style={MONO}>
      {children}
    </p>
  );
}

/** Multi-line selections often expose a zero-size client rect on the Range; merge getClientRects(). */
function rangeSelectionViewportRect(range: Range): DOMRect | null {
  const rects = range.getClientRects();
  if (!rects.length) return null;
  let minL = Infinity;
  let minT = Infinity;
  let maxR = -Infinity;
  let maxB = -Infinity;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r.width === 0 && r.height === 0) continue;
    minL = Math.min(minL, r.left);
    minT = Math.min(minT, r.top);
    maxR = Math.max(maxR, r.right);
    maxB = Math.max(maxB, r.bottom);
  }
  if (minL === Infinity) return null;
  return new DOMRect(minL, minT, maxR - minL, maxB - minT);
}

/**
 * Positions the Ai fix control imperatively so selectionchange does not trigger
 * parent re-renders (which would reset contentEditable / React-managed children).
 */
function editArticleSeedPropsEqual(
  prev: { blog: Blog; ownSiteHost: string | null },
  next: { blog: Blog; ownSiteHost: string | null }
): boolean {
  if (prev.ownSiteHost !== next.ownSiteHost) return false;
  const pi = prev.blog.internal_links ?? [];
  const ni = next.blog.internal_links ?? [];
  if (pi.length !== ni.length) return false;
  for (let i = 0; i < pi.length; i++) if (pi[i] !== ni[i]) return false;
  return (
    prev.blog.id === next.blog.id &&
    prev.blog.content === next.blog.content &&
    prev.blog.meta_description === next.blog.meta_description &&
    prev.blog.title === next.blog.title
  );
}

/** Isolated from parent re-renders (e.g. AI modal) so React does not clear contentEditable DOM. */
const MemoizedVisualBlogEditors = memo(
  function MemoizedVisualBlogEditors({
    blog,
    ownSiteHost,
    titleRef,
    descRef,
  }: {
    blog: Blog;
    ownSiteHost: string | null;
    titleRef: RefObject<HTMLHeadingElement | null>;
    descRef: RefObject<HTMLParagraphElement | null>;
  }) {
    useLayoutEffect(() => {
      const h = titleRef.current;
      const p = descRef.current;
      if (!h || !p) return;
      const { heroTitle } = stripHeroHeading(blog);
      h.textContent = heroTitle;
      p.textContent = blog.meta_description ?? "";
    }, [blog, ownSiteHost, titleRef, descRef]);

    return (
      <header className="mb-10 pb-8 border-b border-border-subtle">
        <h1 ref={titleRef} contentEditable suppressContentEditableWarning spellCheck
          className="mb-4 outline-none text-text-primary"
          style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.5 }}
        />
        <p ref={descRef} contentEditable suppressContentEditableWarning spellCheck
          className="outline-none text-text-tertiary" style={{ fontSize: 17, lineHeight: 1.7 }}
        />
      </header>
    );
  },
  editArticleSeedPropsEqual
);

function BlogImageEditOverlay({
  active,
  bodyRef,
  onUpload,
  onRegenerate,
  onRemove,
  isRegenerating,
}: {
  active: boolean;
  bodyRef: RefObject<HTMLDivElement | null>;
  onUpload: (img: HTMLImageElement) => void;
  onRegenerate: (img: HTMLImageElement) => void;
  onRemove: (img: HTMLImageElement) => void;
  isRegenerating: boolean;
}) {
  const [targetImg, setTargetImg] = useState<HTMLImageElement | null>(null);
  const btnRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = useCallback(() => {
    if (!active || !targetImg || !btnRef.current) return;
    const rect = targetImg.getBoundingClientRect();
    btnRef.current.style.top = `${rect.top + 8}px`;
    btnRef.current.style.left = `${rect.right - 8}px`;
  }, [active, targetImg]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const handleBodyClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "IMG" && bodyRef.current?.contains(target)) {
        setTargetImg(target as HTMLImageElement);
      } else if (!btnRef.current?.contains(target)) {
        setTargetImg(null);
      }
    };
    document.addEventListener("click", handleBodyClick);
    return () => document.removeEventListener("click", handleBodyClick);
  }, [active, bodyRef]);

  useEffect(() => {
    if (!targetImg) return;
    const schedule = () => requestAnimationFrame(updatePosition);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    schedule();
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [targetImg, updatePosition]);

  if (!active || !targetImg) return null;

  return (
    <div
      ref={btnRef}
      className="fixed z-50 flex gap-1.5 -translate-x-full bg-surface-elevated border border-border-subtle rounded-md shadow-md p-1.5"
    >
      <button
        onClick={() => {
          onUpload(targetImg);
          setTargetImg(null);
        }}
        disabled={isRegenerating}
        className="px-2 py-1 text-[11px] font-medium rounded hover:bg-surface-hover text-text-secondary transition-colors disabled:opacity-50"
      >
        Upload
      </button>
      <button
        onClick={() => {
          onRegenerate(targetImg);
          // Don't close immediately so they can see the loading state if we had one, but we disabled it
        }}
        disabled={isRegenerating}
        className="px-2 py-1 text-[11px] font-medium rounded hover:bg-surface-hover text-text-secondary transition-colors disabled:opacity-50"
      >
        {isRegenerating ? "Regenerating..." : "Regenerate"}
      </button>
      <button
        onClick={() => {
          onRemove(targetImg);
          setTargetImg(null);
        }}
        disabled={isRegenerating}
        className="px-2 py-1 text-[11px] font-medium rounded hover:bg-surface-hover text-rose-500 transition-colors disabled:opacity-50"
      >
        Remove
      </button>
    </div>
  );
}

function BlogEditAiFixOverlay({
  active,
  getRoots,
  panelRef,
  onOpen,
}: {
  active: boolean;
  getRoots: () => Array<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  onOpen: (payload: { snapshot: BlogRewriteSelectionSnapshot; range: Range }) => void;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const tick = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    if (!active) {
      btn.style.display = "none";
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      btn.style.display = "none";
      return;
    }
    const roots = getRoots().filter(Boolean) as HTMLElement[];
    const node: Node | null = sel.anchorNode;
    if (!node) {
      btn.style.display = "none";
      return;
    }
    const walk = node.nodeType === Node.TEXT_NODE ? (node.parentElement as HTMLElement | null) : (node as HTMLElement);
    if (!walk || !roots.some(r => r.contains(walk))) {
      btn.style.display = "none";
      return;
    }
    if (!sel.toString().trim()) {
      btn.style.display = "none";
      return;
    }
    const rect = rangeSelectionViewportRect(sel.getRangeAt(0));
    if (!rect) {
      btn.style.display = "none";
      return;
    }
    btn.style.display = "block";
    btn.style.position = "fixed";
    btn.style.top = `${rect.bottom + 6}px`;
    btn.style.left = `${rect.left}px`;
    btn.style.zIndex = "70";
  }, [active, getRoots]);

  useEffect(() => {
    if (!active) {
      const btn = btnRef.current;
      if (btn) btn.style.display = "none";
      return;
    }
    const schedule = () => requestAnimationFrame(tick);
    document.addEventListener("selectionchange", schedule);
    document.addEventListener("keyup", schedule);
    document.addEventListener("mouseup", schedule);
    window.addEventListener("scroll", schedule, true);
    schedule();
    return () => {
      document.removeEventListener("selectionchange", schedule);
      document.removeEventListener("keyup", schedule);
      document.removeEventListener("mouseup", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [active, tick]);

  if (!active) return null;

  return (
    <button
      ref={btnRef}
      type="button"
      className="pointer-events-auto rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-lg transition-all"
      style={{
        display: "none",
        background: "var(--text-primary)",
        color: "var(--surface-primary)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
        letterSpacing: "0.01em",
      }}
      onMouseDown={e => {
        e.preventDefault();
        const sel = window.getSelection();
        if (!sel?.rangeCount || sel.isCollapsed) return;
        const roots = getRoots().filter(Boolean) as HTMLElement[];
        const node: Node | null = sel.anchorNode;
        if (!node) return;
        const walk = node.nodeType === Node.TEXT_NODE ? (node.parentElement as HTMLElement | null) : (node as HTMLElement);
        if (!walk || !roots.some(r => r.contains(walk))) return;
        const range = sel.getRangeAt(0).cloneRange();
        const asMd = rangeSelectionToMarkdown(range);
        const plainText = sel.toString();
        const markdown = asMd.trim() ? asMd : plainText;
        if (!markdown.trim()) return;
        const htmlFragment = rangeSelectionHtmlFragment(range);
        const links = extractInlineMarkdownLinks(markdown);
        const snapshot: BlogRewriteSelectionSnapshot = {
          markdown,
          plainText,
          htmlFragment: htmlFragment || undefined,
          links,
        };
        onOpen({ snapshot, range });
      }}
    >
      ✦ Edit with AI
    </button>
  );
}

// ─── Blog Content Analysis Modal ─────────────────────────────────────────

const ISSUE_SEVERITY_COLORS: Record<"high" | "medium" | "low", string> = {
  high: "border-rose-500/30 bg-rose-500/10 text-rose-400",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
};
const ISSUE_CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  technical: { label: "Technical", icon: "⚙️", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" },
  seo:       { label: "SEO",       icon: "🎯", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  content:   { label: "Content",   icon: "📝", color: "text-violet-400 bg-violet-500/10 border-violet-500/30" },
  ux:        { label: "Reader UX", icon: "👁",  color: "text-pink-400 bg-pink-500/10 border-pink-500/30" },
};
const RUBRIC_STATUS_META: Record<string, { label: string; cls: string }> = {
  pass: { label: "Pass", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
  warn: { label: "Warn", cls: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
  fail: { label: "Fail", cls: "border-rose-500/40 bg-rose-500/10 text-rose-400" },
};

const CONCLUSION_META = {
  ready_to_publish: {
    label: "Ready to publish",
    icon: "✓",
    cls: "border-emerald-500/30 bg-emerald-500/8 text-emerald-400",
    dot: "bg-emerald-400",
  },
  needs_minor_fixes: {
    label: "Needs minor fixes",
    icon: "⚠",
    cls: "border-amber-500/30 bg-amber-500/8 text-amber-400",
    dot: "bg-amber-400",
  },
  needs_major_work: {
    label: "Needs major work",
    icon: "✕",
    cls: "border-rose-500/30 bg-rose-500/8 text-rose-400",
    dot: "bg-rose-400",
  },
} as const;

function BlogContentAnalysisModal({
  open,
  analysis,
  loading,
  error,
  isStale,
  onClose,
  onReanalyse,
  onGenerateEnhanced,
  onSchedule,
  reanalysing,
  enhancing,
  scheduling,
}: {
  open: boolean;
  analysis: BlogContentAnalysis | null;
  loading: boolean;
  error: string;
  isStale: boolean;
  onClose: () => void;
  onReanalyse: () => void;
  onGenerateEnhanced: () => void;
  onSchedule: () => void;
  reanalysing: boolean;
  enhancing: boolean;
  scheduling: boolean;
}) {
  const [tab, setTab] = useState<"issues" | "rubric" | "gaps">("issues");

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const busy = loading || reanalysing;
  const conclusion = analysis?.conclusion;
  const conclusionMeta = conclusion ? CONCLUSION_META[conclusion.verdict] : null;

  return (
    <div
      role="dialog" aria-modal="true"
      className="fixed inset-0 z-80 flex items-start justify-center overflow-y-auto bg-surface-primary/85 p-3 backdrop-blur-sm sm:p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative my-4 flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-secondary shadow-2xl shadow-black/60 animate-scale-in"
        style={{ maxHeight: "calc(100vh - 3rem)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-border-subtle bg-surface-secondary/95 p-5 backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">Content analysis · AI diagnosis</p>
            <h2 className="mt-1 text-xl font-bold text-text-primary">Content Health Report</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Re-analyse button — only show when we have results */}
            {(analysis || error) && (
              <button type="button" onClick={onReanalyse} disabled={busy}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-semibold transition-all disabled:opacity-40 ${
                  isStale
                    ? "border-amber-500/40 bg-amber-500/8 text-amber-400 hover:bg-amber-500/15"
                    : "border-border-subtle bg-surface-elevated text-text-secondary hover:text-text-primary hover:border-border-strong"
                }`}
              >
                <svg className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                {busy ? "Analysing…" : isStale ? "Content changed — re-analyse" : "Re-analyse"}
              </button>
            )}
            <button type="button" onClick={onClose}
              className="rounded-xl border border-border-subtle bg-surface-elevated p-2 text-text-tertiary shadow-sm transition-all hover:border-rose-400/35 hover:bg-rose-500/10 hover:text-rose-300">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {busy && (
            <div className="flex flex-col items-center justify-center gap-4 py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-subtle border-t-brand-action" />
              <p className="text-[13px] text-text-tertiary">Analysing content with Gemini…</p>
            </div>
          )}
          {error && !busy && (
            <div className="m-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-[13px] text-rose-400">
              {error}
            </div>
          )}
          {analysis && !busy && (
            <>
              {/* Conclusion banner — top of modal */}
              {conclusionMeta && conclusion && (
                <div className={`mx-5 mt-5 rounded-xl border p-4 ${conclusionMeta.cls}`}>
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black ${conclusionMeta.cls}`}>
                      {conclusionMeta.icon}
                    </span>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider opacity-70 mb-0.5">Conclusion</p>
                      <p className="text-[14px] font-bold leading-snug">{conclusionMeta.label}</p>
                    </div>
                  </div>
                  <p className="mt-2.5 text-[13px] leading-relaxed opacity-90">{conclusion.summary}</p>
                </div>
              )}

              {/* Verdict */}
              <div className="mx-5 mt-3 rounded-xl border border-border-subtle bg-surface-tertiary/40 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1">Diagnosis</p>
                <p className="text-sm text-text-primary leading-relaxed">{analysis.plain_language_verdict}</p>
              </div>

              {/* Quick wins */}
              {analysis.quick_wins?.length > 0 && (
                <div className="mx-5 mt-3 mb-1 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-2">Quick wins</p>
                  <ul className="space-y-1">
                    {analysis.quick_wins.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] text-text-secondary">
                        <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tabs */}
              <div className="px-5 py-3">
                <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-secondary/50">
                  <div className="flex flex-wrap gap-1 border-b border-border-subtle bg-surface-tertiary/50 p-1.5">
                    {([
                      ["issues", "Issues & fixes", analysis.issues.length],
                      ["rubric", "Quality checklist", analysis.quality_rubric?.length ?? 0],
                      ["gaps", "Content gaps", analysis.content_gaps?.length ?? 0],
                    ] as const).map(([key, label, count]) => (
                      <button key={key} type="button" onClick={() => setTab(key)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${tab === key
                          ? "bg-brand-action text-brand-on-primary shadow-md"
                          : "text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary"}`}>
                        {label}
                        <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === key ? "bg-white/20 text-white" : "bg-surface-elevated text-text-tertiary"}`}>
                          {count}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="p-4">
                    {tab === "issues" && (
                      <ul className="max-h-[min(48vh,460px)] space-y-2 overflow-y-auto pr-1">
                        {analysis.issues.length === 0 ? (
                          <li className="flex items-center gap-2 py-4 text-sm text-emerald-400">
                            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                            No genuine issues found — this content is in great shape.
                          </li>
                        ) : analysis.issues.map((issue, n) => {
                          const cat = ISSUE_CATEGORY_META[issue.category] ?? ISSUE_CATEGORY_META.content;
                          return (
                            <li key={n} className="grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-border-subtle bg-surface-elevated/80 p-3 shadow-sm">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-action/15 text-xs font-black text-brand-action">{n + 1}</span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${ISSUE_SEVERITY_COLORS[issue.severity]}`}>{issue.severity}</span>
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${cat.color}`}>{cat.icon} {cat.label}</span>
                                  <span className="text-xs font-bold text-text-primary">{issue.label}</span>
                                </div>
                                {issue.detail && <p className="mt-1.5 text-[12px] text-text-secondary leading-relaxed">{issue.detail}</p>}
                                {issue.fix && (
                                  <p className="mt-1.5 text-[12px] text-emerald-400 leading-relaxed">
                                    <span className="font-bold text-text-secondary">Fix · </span>{issue.fix}
                                  </p>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {tab === "rubric" && (
                      <ul className="max-h-[min(48vh,460px)] space-y-2 overflow-y-auto">
                        {!(analysis.quality_rubric?.length) ? (
                          <li className="text-sm text-text-tertiary">No rubric data.</li>
                        ) : analysis.quality_rubric.map((row, i) => {
                          const meta = RUBRIC_STATUS_META[row.status] ?? RUBRIC_STATUS_META.warn;
                          return (
                            <li key={row.id} className="flex gap-3 rounded-xl border border-border-subtle bg-surface-elevated/80 px-3 py-2.5">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-tertiary text-[11px] font-bold text-text-tertiary">{i + 1}</span>
                              <div className="min-w-0 flex-1">
                                <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${meta.cls}`}>{meta.label}</span>
                                <p className="mt-1 text-[13px] font-medium text-text-primary">{row.label}</p>
                                <p className="text-[12px] text-text-tertiary leading-relaxed">{row.detail}</p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {tab === "gaps" && (
                      <div className="max-h-[min(48vh,460px)] overflow-y-auto space-y-4">
                        {analysis.content_gaps?.length ? (
                          <>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">Missing topics / angles</p>
                            <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-text-secondary">
                              {analysis.content_gaps.map((g, i) => <li key={i} className="leading-relaxed">{g}</li>)}
                            </ol>
                          </>
                        ) : (
                          <p className="text-sm text-text-tertiary">No content gaps identified.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-surface-secondary/95 p-4 backdrop-blur">
          <p className="text-[11px] text-text-tertiary max-w-xs leading-relaxed">
            &quot;Generate enhanced&quot; rewrites applying <strong className="text-text-secondary">all</strong> issues above at once. &quot;Schedule&quot; queues the keyword for later.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-border-strong bg-surface-elevated px-4 py-2.5 text-xs font-bold text-text-secondary shadow-sm transition-all hover:border-text-tertiary hover:text-text-primary">
              Close
            </button>
            <button type="button" onClick={onSchedule} disabled={scheduling || busy || !analysis}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border-strong bg-surface-elevated px-4 py-2.5 text-xs font-bold text-text-secondary shadow-sm transition-all hover:border-text-tertiary hover:text-text-primary disabled:opacity-50">
              {scheduling ? "Scheduling…" : (
                <><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>Schedule</>
              )}
            </button>
            <button type="button" onClick={onGenerateEnhanced} disabled={enhancing || busy || !analysis}
              className="inline-flex min-w-[168px] items-center justify-center gap-1.5 rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-bold text-brand-on-primary shadow-lg shadow-brand-primary/30 transition-all hover:opacity-90 disabled:opacity-50">
              {enhancing ? "Generating…" : (
                <><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.847-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09Z"/></svg>Generate enhanced</>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function BlogViewerPage() {
  const { id: projectId, blogId } = useParams<{ id: string; blogId: string }>();
  const searchParams = useSearchParams();
  const fromAnalyzeContentPage = searchParams.get("from") === BLOG_VIEW_FROM_ANALYZE_CONTENT;
  const queryClient = useQueryClient();

  const [blog, setBlog]                   = useState<Blog | null>(null);
  const [project, setProject]             = useState<Project | null>(null);

  const { data: blogQueryRes, isLoading: blogQueryLoading } = useQuery({
    queryKey: qk.blog(blogId),
    queryFn: () => blogsApi.getById(blogId),
    enabled: !!blogId,
    ...DEFAULT_QUERY_OPTIONS,
  });
  const { data: projectQueryRes, isLoading: projectQueryLoading } = useProject(projectId);
  const { data: enhancedQueryRes, isLoading: enhancedQueryLoading } = useQuery({
    queryKey: ["blog-enhanced", blogId],
    queryFn: () => blogsApi.getEnhanced(blogId),
    enabled: !!blogId,
    ...DEFAULT_QUERY_OPTIONS,
  });

  const loading = (!blog || !project) && (blogQueryLoading || projectQueryLoading || enhancedQueryLoading);
  const [downloading, setDownloading]     = useState<ExportFormat | null>(null);
  const [regenerating, setRegenerating]   = useState(false);
  const [copied, setCopied]               = useState(false);
  const [savingStatus, setSavingStatus]   = useState(false);
  const [statusError, setStatusError]     = useState("");
  const [editMode, setEditMode]           = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [scoreRefreshing, setScoreRefreshing] = useState(false);
  const [scoreVersion, setScoreVersion]   = useState(0);
  const [fixingIssue, setFixingIssue]     = useState<BlogSeoIssueKey | null>(null);
  const [fixError, setFixError]           = useState("");
  const [editError, setEditError]         = useState("");
  const titleEditorRef = useRef<HTMLHeadingElement | null>(null);
  const descEditorRef  = useRef<HTMLParagraphElement | null>(null);
  const editorRef      = useRef<HTMLDivElement | null>(null);
  const tiptapBodyRef  = useRef<TipTapBlogEditorRef | null>(null);
  const blogPanelRef   = useRef<HTMLDivElement | null>(null);
  const selectionSnapshotRef = useRef<{ range: Range } | null>(null);

  const [editSessionKey, setEditSessionKey] = useState(0);
  const [aiRewriter, setAiRewriter] = useState<{
    open: boolean;
    snapshot: BlogRewriteSelectionSnapshot | null;
  }>({ open: false, snapshot: null });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editingImage, setEditingImage] = useState<HTMLImageElement | null>(null);
  const [regeneratingImage, setRegeneratingImage] = useState(false);
  /** Pre-existing handler — declared here so `handleAddToArticles` does not throw on `setAddingToArticles is not defined`. */
  const [, setAddingToArticles] = useState(false);

  // ── Content analysis ────────────────────────────────────────────────────
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisReanalysing, setAnalysisReanalysing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [contentAnalysis, setContentAnalysis] = useState<BlogContentAnalysis | null>(null);
  /** updated_at of the blog at the time analysis was last run — used to detect stale analysis */
  const [analysisSnapshotAt, setAnalysisSnapshotAt] = useState<string | null>(null);
  const [analysisEnhancing, setAnalysisEnhancing] = useState(false);
  const [analysisScheduling, setAnalysisScheduling] = useState(false);

  // ── Deep Analysis (SERP competitors) ───────────────────────────────────
  const [deepModalOpen, setDeepModalOpen] = useState(false);
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepRunningAgain, setDeepRunningAgain] = useState(false);
  const [deepStage, setDeepStage] = useState(0);
  const [deepError, setDeepError] = useState("");
  const [deepAnalysis, setDeepAnalysis] = useState<BlogDeepAnalysisResult | null>(null);

  // ── Schedule-on-calendar (Instant Articles) ────────────────────────────
  const [calendarEntries, setCalendarEntries] = useState<CalendarEntry[]>([]);
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleVersion, setScheduleVersion] = useState(0);

  // ── Before / After comparison ───────────────────────────────────────────
  // When the user clicks "Generate enhanced" in the analysis modal, we keep
  // them on this page and load the freshly-generated blog into `enhancedBlog`.
  // The toolbar then exposes a Before / After pill so the original (Before)
  // and enhanced (After) versions can be compared side-by-side, without
  // adding the enhanced row to the calendar (entry_id stays null on the
  // server — see `repairBlogFromContent`).
  const [enhancedBlog, setEnhancedBlog] = useState<Blog | null>(null);
  const [compareView, setCompareView] = useState<"before" | "after">("before");
  const isAfterView = compareView === "after" && enhancedBlog !== null;

  const [beforeDeepEnhance, setBeforeDeepEnhance] = useState<{
    title: string;
    metaDescription: string;
    content: string;
  } | null>(null);
  const [deepEnhancedResult, setDeepEnhancedResult] = useState<{
    enhancedTitle: string;
    enhancedMetaDescription: string;
    enhancedContentMarkdown: string;
    appliedFixes: string[];
    unresolvedIssues: string[];
    improvementSummary: string;
  } | null>(null);
  const [deepCompareView, setDeepCompareView] = useState<"before" | "after">("after");
  const [deepEnhancing, setDeepEnhancing] = useState(false);

  const isDeepBefore = deepCompareView === "before" && beforeDeepEnhance !== null;

  const displayBlog: Blog | null = isDeepBefore
    ? (blog
        ? {
            ...blog,
            title: beforeDeepEnhance!.title,
            meta_description: beforeDeepEnhance!.metaDescription,
            content: beforeDeepEnhance!.content,
          }
        : null)
    : (isAfterView ? enhancedBlog : blog);

  /** Updates the currently-displayed blog (Before → `blog`, After → `enhancedBlog`). */
  const updateDisplayBlog = useCallback(
    (next: Blog | ((prev: Blog) => Blog)) => {
      const apply = (prev: Blog): Blog =>
        typeof next === "function" ? (next as (b: Blog) => Blog)(prev) : next;
      if (isAfterView) {
        setEnhancedBlog(prev => {
          const nextVal = prev ? apply(prev) : prev;
          if (nextVal) {
            const normalized = normalizeBlogPlaceholders(nextVal);
            queryClient.setQueryData(["blog-enhanced", blogId], { success: true, data: normalized });
            return normalized;
          }
          return nextVal;
        });
      } else {
        setBlog(prev => {
          const nextVal = prev ? apply(prev) : prev;
          if (nextVal) {
            const normalized = normalizeBlogPlaceholders(nextVal);
            queryClient.setQueryData(qk.blog(blogId), { success: true, data: normalized });
            return normalized;
          }
          return nextVal;
        });
      }
    },
    [isAfterView, blogId, queryClient]
  );

  const analysisIsStale = Boolean(
    contentAnalysis && analysisSnapshotAt && blog && blog.updated_at !== analysisSnapshotAt
  );

  const ownSiteHost = useMemo(
    () => (project?.domain?.trim() ? normalizeSiteHost(project.domain) : null),
    [project?.domain]
  );

  const { externalLinks, internalLinks } = useMemo(
    () =>
      reclassifyBlogLinkSidebarLists(
        displayBlog?.external_links ?? [],
        displayBlog?.internal_links ?? [],
        project?.domain
      ),
    [displayBlog?.external_links, displayBlog?.internal_links, project?.domain]
  );

  const handleImageUpload = (img: HTMLImageElement) => {
    setEditingImage(img);
    fileInputRef.current?.click();
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingImage) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        tiptapBodyRef.current?.updateImageAtDom?.(editingImage, base64);
      }
    };
    reader.readAsDataURL(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setEditingImage(null);
  };

  const handleImageRegenerate = async (img: HTMLImageElement) => {
    if (!displayBlog) return;
    setRegeneratingImage(true);
    try {
      const res = await blogsApi.regenerateImage(displayBlog.id, {
        imageAlt: img.alt,
        contextBefore: "", // We could extract context from DOM if needed
        contextAfter: "",
      });
      if (res.success && res.data) {
        tiptapBodyRef.current?.updateImageAtDom?.(img, res.data.url, res.data.alt);
      } else {
        setEditError(res.error ?? "Failed to regenerate image");
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to regenerate image";
      setEditError(message);
    } finally {
      setRegeneratingImage(false);
    }
  };

  const handleImageRemove = (img: HTMLImageElement) => {
    tiptapBodyRef.current?.deleteImageAtDom?.(img);
  };

  const getEditRoots = useCallback(() => [titleEditorRef.current, descEditorRef.current, editorRef.current], []);

  useEffect(() => {
    if (!editMode) {
      setAiRewriter({ open: false, snapshot: null });
      selectionSnapshotRef.current = null;
    }
  }, [editMode]);

  useEffect(() => {
    setBlog(null);
    setEnhancedBlog(null);
    setCompareView("before");
  }, [blogId]);

  useEffect(() => {
    if (blogQueryRes?.success && blogQueryRes.data) {
      const normalized = normalizeBlogPlaceholders(blogQueryRes.data);
      setBlog(normalized);
      if (blogQueryRes.data.id !== blogId) {
        window.history.replaceState(null, "", `/projects/${projectId}/blogs/${blogQueryRes.data.id}${window.location.search}`);
      }
    }
  }, [blogQueryRes, blogId, projectId]);

  useEffect(() => {
    if (projectQueryRes?.success && projectQueryRes.data) {
      setProject(projectQueryRes.data);
    }
  }, [projectQueryRes]);

  useEffect(() => {
    if (enhancedQueryRes?.success && enhancedQueryRes.data) {
      setEnhancedBlog(normalizeBlogPlaceholders(enhancedQueryRes.data));
    }
  }, [enhancedQueryRes]);

  useEffect(() => {
    void blogsApi.getDeepAnalysis(blogId).then(cached => {
      if (cached.cached && cached.data) setDeepAnalysis(cached.data);
    });
  }, [blogId]);

  const runAnalysis = async (opts?: { reanalyse?: boolean }) => {
    if (opts?.reanalyse) {
      setAnalysisReanalysing(true);
      setContentAnalysis(null);
    } else {
      setAnalysisLoading(true);
    }
    setAnalysisError("");
    const res = await analyzeBlogContent(blog?.id || blogId);
    setAnalysisLoading(false);
    setAnalysisReanalysing(false);
    if (res.success) {
      setContentAnalysis(res.analysis);
      setAnalysisSnapshotAt(blog?.updated_at ?? null);
    } else {
      setAnalysisError(res.error);
    }
  };

  const openAnalysisModal = async () => {
    setAnalysisModalOpen(true);
    if (contentAnalysis && !analysisIsStale) return; // already have fresh data
    await runAnalysis();
  };

  const runDeepAnalysis = useCallback(
    async (opts?: { force?: boolean }) => {
      const force = Boolean(opts?.force);
      if (force) {
        setDeepRunningAgain(true);
        setDeepAnalysis(null);
      } else {
        setDeepLoading(true);
      }
      setDeepError("");
      setDeepStage(0);

      const stageTimer = window.setInterval(() => {
        setDeepStage(s => Math.min(s + 1, 3));
      }, 14_000);

      try {
        const res = await blogsApi.runDeepAnalysis(blog?.id || blogId, { force });
        if (res.success) {
          setDeepAnalysis(res.data);
          if (res.trace) console.log("[deep-analysis] trace:", res.trace);
          const at = "updatedAt" in res && res.updatedAt ? res.updatedAt : new Date().toISOString();
          const score = res.data.deepAnalysisScore;
          const currentBlogId = blog?.id || blogId;
          setBlog(prev =>
            prev && prev.id === currentBlogId
              ? { ...prev, deep_analysis_score: score, deep_analysis_updated_at: at }
              : prev
          );
          setEnhancedBlog(prev =>
            prev && prev.id === currentBlogId
              ? { ...prev, deep_analysis_score: score, deep_analysis_updated_at: at }
              : prev
          );
        } else {
          setDeepError(res.error);
        }
      } catch (e: unknown) {
        setDeepError(e instanceof Error ? e.message : "Deep analysis failed");
      } finally {
        window.clearInterval(stageTimer);
        setDeepLoading(false);
        setDeepRunningAgain(false);
        setDeepStage(3);
      }
    },
    [blogId]
  );

  const openDeepAnalysisModal = useCallback(async () => {
    setDeepModalOpen(true);
    setDeepError("");
    if (deepAnalysis && !deepRunningAgain && !deepLoading) return;

    try {
      const cached = await blogsApi.getDeepAnalysis(blog?.id || blogId);
      if (cached.cached && cached.data) {
        setDeepAnalysis(cached.data);
        return;
      }
    } catch {
      /* run fresh below */
    }
    await runDeepAnalysis();
  }, [blog?.id, blogId, deepAnalysis, deepLoading, deepRunningAgain, runDeepAnalysis]);

  const handleAnalysisEnhanced = async () => {
    if (!blog || !contentAnalysis) return;
    setAnalysisEnhancing(true);
    try {
      const { repairBlogFromContent } = await import("@/app/actions/repair-actions");
      const res = await repairBlogFromContent(blog.id, contentAnalysis);
      if (!res.success || !res.data?.blogId) {
        toast.error(!res.success ? res.error : "Could not generate enhanced version.");
        return;
      }
      if (!res.data.blogId) {
        toast.error("Enhanced version generated but blogId is missing.");
        return;
      }
      const newBlogId = res.data.blogId;
      toast.success("Enhanced version ready — opening.");
      // Pull the freshly-generated blog and surface it in the After view —
      // we deliberately stay on this page so the user can A/B compare.
      const enhancedRes = await blogsApi.getById(newBlogId);
      if (!enhancedRes.success || !enhancedRes.data) {
        toast.error(enhancedRes.error || "Enhanced blog generated but could not be loaded.");
        return;
      }
      setEnhancedBlog(normalizeBlogPlaceholders(enhancedRes.data));
      setCompareView("after");
      setAnalysisModalOpen(false);
      toast.success("Enhanced version ready — viewing After.");
      // Articles + project stats may have shifted because a new blog row exists.
      void queryClient.invalidateQueries({ queryKey: qk.articlesLibrary(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
    } catch (ex) {
      toast.error(ex instanceof Error ? ex.message : "Could not generate enhanced version.");
    } finally {
      setAnalysisEnhancing(false);
    }
  };

  const handleDeepAnalysisEnhanced = useCallback(async () => {
    if (!blog || !deepAnalysis) return;
    setDeepEnhancing(true);
    try {
      const seoScore = computeSEOScore(blog, project?.domain);
      const seoIssues = seoScore.checks.filter(c => !c.pass);

      const res = await blogsApi.enhance(projectId, blog.id, {
        deepAnalysisResult: deepAnalysis,
        seoIssues,
      });

      if (!res.success) {
        toast.error(res.error || "Could not generate enhanced version.");
        return;
      }

      if (res.warning) {
        toast(res.warning, { icon: "⚠️", duration: 8000 });
      } else {
        toast.success("Enhanced version generated!");
      }

      const result = res.data;
      if (result) {
        setBeforeDeepEnhance({
          title: blog.title,
          metaDescription: blog.meta_description || "",
          content: blog.content,
        });

        setDeepEnhancedResult({
          enhancedTitle: result.enhancedTitle,
          enhancedMetaDescription: result.enhancedMetaDescription,
          enhancedContentMarkdown: result.enhancedContentMarkdown,
          appliedFixes: result.appliedFixes,
          unresolvedIssues: result.unresolvedIssues,
          improvementSummary: result.improvementSummary,
        });

        setDeepCompareView("after");
        setDeepModalOpen(false);

        if (res.saved) {
          void queryClient.invalidateQueries({ queryKey: qk.blog(blogId) });
          void queryClient.invalidateQueries({ queryKey: qk.contentGeneratorHistory(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
          
          setScoreVersion(v => v + 1);

          void blogsApi.getDeepAnalysis(blogId).then(cached => {
            if (cached.data) setDeepAnalysis(cached.data);
          });
        }
      }
    } catch (ex) {
      toast.error(ex instanceof Error ? ex.message : "Could not generate enhanced version.");
    } finally {
      setDeepEnhancing(false);
    }
  }, [blog, deepAnalysis, projectId, blogId, project?.domain, queryClient]);

  const handleAnalysisSchedule = async () => {
    if (!blog) return;
    setAnalysisScheduling(true);
    try {
      const keyword = blog.target_keyword || blog.title;
      const res = await calendarApi.addCustomKeyword(projectId, {
        keyword,
        title: blog.title,
        writerNotes: `Content analysis repair for: ${blog.title}`,
      });
      if (res.success) {
        toast.success(`"${keyword}" added to calendar for ${res.scheduled_date ?? "next available date"}.`);
        setAnalysisModalOpen(false);
        await queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
      } else {
        toast.error(res.error ?? "Could not add to calendar.");
      }
    } catch (ex) {
      toast.error(ex instanceof Error ? ex.message : "Could not schedule.");
    } finally {
      setAnalysisScheduling(false);
    }
  };

  // Calendar entries — used to power the right-sidebar Schedule date picker
  // (`scheduledDates` for the picker + looking up `scheduled_date` by entry_id).
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    calendarApi.entries(projectId).then((r) => {
      if (cancelled) return;
      if (r.success) setCalendarEntries(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, scheduleVersion]);

  const scheduledDatesSet = useMemo(
    () => new Set(calendarEntries.map((e) => String(e.scheduled_date).slice(0, 10))),
    [calendarEntries],
  );

  const scheduledDate = useMemo(() => {
    if (!blog?.entry_id) return null;
    const hit = calendarEntries.find((e) => e.id === blog.entry_id);
    return hit ? String(hit.scheduled_date).slice(0, 10) : null;
  }, [blog?.entry_id, calendarEntries]);

  const nextVacantDate = useMemo(() => {
    const taken = new Set(calendarEntries.map((e) => String(e.scheduled_date).slice(0, 10)));
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    for (let i = 0; i < 500; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!taken.has(key)) {
        return key;
      }
    }
    return null;
  }, [calendarEntries]);

  const handleScheduleBlog = async (date: string) => {
    if (!blog) return;
    setScheduling(true);
    try {
      const res = await calendarApi.scheduleExistingBlog(projectId, {
        blogId: blog.id,
        targetDate: date,
        source: "Instant Article",
      });
      if (res.success) {
        const niceDate = new Date(`${res.scheduled_date}T00:00:00`).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
        toast.success(
          res.rescheduled ? `Moved to ${niceDate}.` : `Scheduled for ${niceDate}.`,
        );
        setBlog((b) => {
          const nextVal = b ? { ...b, entry_id: res.data.id } : b;
          if (nextVal) {
            queryClient.setQueryData(qk.blog(blogId), { success: true, data: nextVal });
          }
          return nextVal;
        });
        setScheduleVersion((v) => v + 1);
        void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.contentGeneratorHistory(projectId) });
      } else {
        toast.error(res.error || "Could not schedule");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not schedule");
    } finally {
      setScheduling(false);
      setSchedulePickerOpen(false);
    }
  };

  const handleDirectSchedule = async () => {
    if (!nextVacantDate) {
      toast.error("No free calendar dates found");
      return;
    }
    await handleScheduleBlog(nextVacantDate);
  };

  const handleAddToArticles = async () => {
    if (!blog) return;
    setAddingToArticles(true);
    try {
      const res = await blogsApi.addToArticlesLibrary(blog.id);
      if (res.success) {
        setBlog((b) => {
          const nextVal = b && b.id === blog.id ? { ...b, in_articles_library: true } : b;
          if (nextVal) {
            queryClient.setQueryData(qk.blog(blogId), { success: true, data: nextVal });
          }
          return nextVal;
        });
        if (res.alreadySaved) toast.success("Already in Articles");
        else toast.success("Added to Articles");
        void queryClient.invalidateQueries({ queryKey: qk.articlesLibrary(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.contentGeneratorHistory(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
      } else {
        toast.error(res.error ?? "Could not add article");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not add article");
    } finally {
      setAddingToArticles(false);
    }
  };

  const handleDownload = async (format: ExportFormat) => {
    if (!displayBlog) return;
    setDownloading(format);
    const projectMeta = project
      ? { domain: project.domain ?? undefined, company: project.company ?? undefined }
      : undefined;
    try {
      let blob: Blob;
      if (format === "markdown") blob = exportToMarkdown(displayBlog, projectMeta);
      else if (format === "html") blob = exportToHTML(displayBlog, projectMeta);
      else if (format === "txt") blob = exportToText(displayBlog);
      else blob = await exportToDocx(displayBlog);
      // `triggerBlogDownload` enforces the right extension + MIME type and
      // runs the title/slug through `safeFilename` so the OS save dialog
      // doesn't choke on slashes or punctuation.
      triggerBlogDownload(blob, displayBlog, format);
    } catch (e) {
      console.error("[blog] download failed", e);
    } finally {
      setDownloading(null);
    }
  };

  const handleRegenerate = async () => {
    // Calendar regeneration only makes sense for the original (Before) blog —
    // enhanced rows have entry_id=null on purpose.
    if (!blog) return;
    if (!blog.entry_id) {
      setEditError("Imported articles are not on the calendar. Schedule a keyword on Calendar to run full AI generation.");
      return;
    }
    setRegenerating(true);
    setEditError("");
    try {
      const res = await blogsApi.generate({ entryId: blog.entry_id, wordCount: blog.word_count || 2500 });
      if (res.success && res.data) {
        const normalized = normalizeBlogPlaceholders(res.data);
        setBlog(normalized);
        queryClient.setQueryData(qk.blog(blogId), { success: true, data: normalized });
      } else if (!res.success) {
        setEditError(res.error || "Failed to generate blog.");
      } else {
        setEditError("Failed to generate blog.");
      }
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Failed to generate blog.");
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!displayBlog) return;
    await navigator.clipboard.writeText(displayBlog.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startEditing  = () => {
    if (!displayBlog) return;
    setEditError("");
    setEditSessionKey(k => k + 1);
    setEditMode(true);
  };
  const cancelEditing = () => {
    setEditMode(false);
    setEditError("");
    setAiRewriter({ open: false, snapshot: null });
    selectionSnapshotRef.current = null;
  };

  const handleAiRewriterInsert = (rewritten: string) => {
    // First try TipTap's native replaceSelection (preferred — keeps ProseMirror state consistent).
    if (tiptapBodyRef.current) {
      const ok = tiptapBodyRef.current.replaceSelection(rewritten.trim());
      if (ok) {
        setAiRewriter({ open: false, snapshot: null });
        selectionSnapshotRef.current = null;
        setEditError("");
        return;
      }
    }
    // Fallback: restore the saved DOM range (works when selection was in title/desc contentEditables).
    const snap = selectionSnapshotRef.current;
    if (!displayBlog || !snap?.range) {
      setEditError("Couldn't apply rewrite — select text again.");
      setAiRewriter({ open: false, snapshot: null });
      return;
    }
    try {
      const range = snap.range.cloneRange();
      if (!document.contains(range.startContainer)) {
        setEditError("Editor changed — select text again.");
        setAiRewriter({ open: false, snapshot: null });
        return;
      }
      range.deleteContents();
      const frag = markdownAiSnippetToDocumentFragment(rewritten.trim(), displayBlog, document, ownSiteHost);
      range.insertNode(frag);
      const end = frag.lastChild;
      if (end) {
        range.setStartAfter(end);
        range.collapse(true);
      }
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(range);
      selectionSnapshotRef.current = null;
      setAiRewriter({ open: false, snapshot: null });
      setEditError("");
    } catch {
      setEditError("Couldn't insert rewritten text.");
    }
  };

  const saveEditing = async () => {
    if (!displayBlog) return;
    setSavingContent(true);
    setEditError("");

    const bodyMd = (tiptapBodyRef.current?.getMarkdown() ?? "").replace(/\n{3,}/g, "\n\n").trim();
    const title = titleEditorRef.current?.textContent?.trim() || displayBlog.title;
    const metaDescription = descEditorRef.current?.textContent?.replace(/\s+/g, " ").trim() || "";
    const md = `# ${title}\n\n${bodyMd}`.replace(/\n{3,}/g, "\n\n").trim();

    const res = await blogsApi.updateContent(displayBlog.id, { content: md, title, metaDescription });
    if (res.success && res.data) {
      setScoreRefreshing(true);
      updateDisplayBlog(res.data);
      setEditMode(false);
      setScoreVersion(v => v + 1);
      window.setTimeout(() => setScoreRefreshing(false), 450);
    } else {
      setEditError(res.error ?? "Could not save edited blog.");
    }
    setSavingContent(false);
  };

  const handleStatusChange = async (status: BlogStatus) => {
    if (!displayBlog || displayBlog.status === status) return;
    const prev = displayBlog;
    setSavingStatus(true); setStatusError("");
    updateDisplayBlog({ ...displayBlog, status });
    const res = await blogsApi.updateStatus(displayBlog.id, status);
    if (res.success && res.data) updateDisplayBlog(res.data);
    else { updateDisplayBlog(prev); setStatusError(res.error ?? "Could not update status"); }
    setSavingStatus(false);
  };

  const handleSeoFix = async (key: BlogSeoIssueKey) => {
    if (!displayBlog || fixingIssue || editMode) return;
    setFixingIssue(key); setFixError(""); setScoreRefreshing(true);
    const res = await blogsApi.fixSeo(displayBlog.id, key);
    if (res.success && res.data) { updateDisplayBlog(res.data); setScoreVersion(v => v + 1); }
    else setFixError(res.error ?? "AI fix failed. Try again.");
    setFixingIssue(null);
    window.setTimeout(() => setScoreRefreshing(false), 450);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-7 h-7 border-2 rounded-full animate-spin border-border-subtle border-t-text-primary" />
          <p className="text-[12px] text-text-tertiary">Loading…</p>
        </div>
      </div>
    );
  }

  if (!blog) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="mb-4 text-[14px] text-text-tertiary">Blog not found.</p>
        <ProjectNavLink href={`/projects/${projectId}/blogs`} className="text-[14px] font-medium underline underline-offset-2" style={{ color: V.action }}>
          ← Back to Blogs
        </ProjectNavLink>
      </div>
    );
  }

  // Resolved non-null view target — Before defaults to `blog`, After swaps in
  // the freshly-generated enhancedBlog. All content + sidebar rendering keys
  // off `currentBlog` so toggling the pill flips the entire view.
  const currentBlog: Blog = isDeepBefore
    ? {
        ...blog,
        title: beforeDeepEnhance!.title,
        meta_description: beforeDeepEnhance!.metaDescription,
        content: beforeDeepEnhance!.content,
      }
    : (isAfterView && enhancedBlog ? enhancedBlog : blog);

  const hasSavedDeepAnalysis =
    Boolean(deepAnalysis) ||
    (typeof currentBlog.deep_analysis_score === "number" && currentBlog.deep_analysis_score >= 0);

  const deepScoreDisplay =
    deepAnalysis?.deepAnalysisScore ??
    (typeof currentBlog.deep_analysis_score === "number" ? currentBlog.deep_analysis_score : null);

  const researchSources = currentBlog.research_sources ?? 0;
  const blogStatus      = asBlogStatus(currentBlog.status);
  const statusInfo      = BLOG_STATUSES.find(s => s.value === blogStatus)!;
  const sidebarMuted    = editMode || savingContent || scoreRefreshing;
  const isInstantArticle = Boolean(blog.article_type?.startsWith("Instant ·"));
  const isImport = blog.article_type === "Import";
  const isRepair = blog.article_type === "Repair";
  const historyParentHref = isInstantArticle
    ? `/projects/${projectId}/content-generator/history`
    : (isImport || isRepair)
    ? `/projects/${projectId}/audit/import`
    : `/projects/${projectId}/blogs`;
  const historyParentLabel = isInstantArticle
    ? "Content history"
    : (isImport || isRepair)
    ? "Content Analyzer"
    : "Blogs";

  const breadcrumb = (
    <div className="shrink-0 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[12px] text-text-tertiary">
        <ProjectNavLink
          href={historyParentHref}
          className="inline-flex items-center gap-1.5 hover:text-text-primary transition-colors group font-medium"
        >
          <svg
            className="w-3.5 h-3.5 shrink-0 transition-transform group-hover:-translate-x-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to {historyParentLabel}
        </ProjectNavLink>
      </div>

      {blog.source_url && blog.article_type === "Repair" && (
        <RepairBanner sourceUrl={blog.source_url} repairNotes={blog.repair_notes ?? []} projectId={projectId} />
      )}

      {blog.article_type === "Import" && (
        <div className="rounded-[8px] px-4 py-3 border border-border-subtle bg-surface-secondary">
          <p className="text-[10px] font-medium uppercase text-text-tertiary mb-1" style={MONO}>Imported draft</p>
          <p className="text-[13px] text-text-secondary leading-relaxed">
            This article was uploaded from Content Health → Analyze upload. Preview, SEO score, edits, selection AI, and exports work the same as generated posts.
            Full calendar regeneration is only available for posts created from the schedule.
          </p>
        </div>
      )}

      {(researchSources > 0 || externalLinks.length > 0 || internalLinks.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {researchSources > 0 && (
            <Pill color={V.txtMute} border={V.borderS}>
              <ResearchIcon /> Researched: {researchSources} live sources
            </Pill>
          )}
          {researchSources > 0 && externalLinks.length > 0 && (
            <Pill color={V.action} border={`${BRAND.actionBlue}44`} bg={`${BRAND.actionBlue}0d`}>
              <ExternalLinkIcon /> {externalLinks.length} external links
            </Pill>
          )}
          {researchSources > 0 && internalLinks.length > 0 && (
            <Pill color={V.coral} border={`${BRAND.coral}44`} bg={`${BRAND.coral}0d`}>
              <LinkIcon /> {internalLinks.length} internal links
            </Pill>
          )}
        </div>
      )}
    </div>
  );

  const toolbarLeft = (
    <div className="flex items-center gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary px-2 py-0.5 rounded border border-border-subtle bg-surface-secondary">
        Blog Post
      </span>
      {beforeDeepEnhance && (
        <div className="flex items-center gap-0.5 p-0.5 rounded-full border border-border-subtle bg-surface-secondary/60">
          {(["before", "after"] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => !editMode && setDeepCompareView(v)}
              disabled={editMode}
              className="px-3.5 py-1 rounded-full text-[11px] font-semibold capitalize transition-all disabled:cursor-not-allowed disabled:opacity-40"
              style={deepCompareView === v ? { background: V.txt, color: V.bg } : { background: "transparent", color: V.txtMute }}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const toolbarRight = (
    <div className="flex items-center gap-2">
      {editMode ? (
        <>
          <button type="button" onClick={saveEditing} disabled={savingContent}
            className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-medium disabled:opacity-60"
            style={{ background: V.txt, color: V.bg }}>
            {savingContent ? <><SpinIcon />&nbsp;Saving…</> : "Save edits"}
          </button>
          <button type="button" onClick={cancelEditing} disabled={savingContent}
            className="rounded-full px-4 py-1.5 text-[12px] font-medium border border-border-subtle text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-60">
            Cancel
          </button>
        </>
      ) : (
        <button type="button" onClick={startEditing}
          className="rounded-full px-4 py-1.5 text-[12px] font-medium transition-all"
          style={{ background: V.txt, color: V.bg }}>
          Edit
        </button>
      )}
      {!blog.entry_id && !editMode && (
        <button
          type="button"
          onClick={handleDirectSchedule}
          disabled={scheduling || !nextVacantDate}
          className="rounded-full px-4 py-1.5 text-[12px] font-semibold transition-all disabled:opacity-40"
          style={{ background: V.action, color: "#ffffff" }}
        >
          {scheduling ? "Scheduling..." : "Schedule"}
        </button>
      )}
      <button onClick={handleCopy} disabled={editMode}
        className="rounded-full px-4 py-1.5 text-[12px] font-medium border border-border-subtle text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
        {copied ? "Copied!" : "Copy MD"}
      </button>
    </div>
  );

  const sidebar = (
    <>
      {/* ── Before / After comparison ─────────────────────────── */}
      {enhancedBlog && (
        <div className="px-4 pt-4 pb-2">
          <div className="flex w-full items-center gap-0.5 p-0.5 rounded-full border border-border-subtle bg-surface-primary/40">
            {(["before", "after"] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => !editMode && setCompareView(v)}
                disabled={editMode}
                className="flex-1 px-4 py-1.5 rounded-full text-[12px] font-medium capitalize transition-all disabled:cursor-not-allowed disabled:opacity-40"
                style={compareView === v ? { background: V.txt, color: V.bg } : { background: "transparent", color: V.txtMute }}
                title={v === "before" ? "Original draft" : "AI-enhanced rewrite"}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Content Analysis (Analyze content page entry only) ───── */}
      {fromAnalyzeContentPage && (
        <>
          <div className={`px-4 pb-3 ${enhancedBlog ? "pt-2" : "pt-4"}`}>
            <button
              type="button"
              onClick={() => void openAnalysisModal()}
              disabled={editMode || savingContent}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-bold transition-all disabled:opacity-40 ${
                analysisIsStale
                  ? "bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25"
                  : contentAnalysis
                    ? "bg-surface-elevated border border-border-subtle text-text-primary hover:bg-surface-hover hover:border-border-strong shadow-sm"
                    : "bg-brand-action text-brand-on-primary hover:opacity-90 shadow-md shadow-brand-action/20"
              }`}
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.847-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
              {analysisIsStale ? "Content changed — re-analyse" : contentAnalysis ? "View analysis" : "Analyse content"}
            </button>
            {contentAnalysis && !analysisIsStale && (
              <div className="mt-1.5 flex items-center justify-center gap-2 text-[10px] text-text-tertiary">
                {contentAnalysis.conclusion && (
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold text-[9px] uppercase ${CONCLUSION_META[contentAnalysis.conclusion.verdict].cls}`}>
                    {CONCLUSION_META[contentAnalysis.conclusion.verdict].label}
                  </span>
                )}
                <span>{contentAnalysis.issues.length} issues</span>
              </div>
            )}
          </div>
          <div className="h-px mx-4 bg-border-subtle opacity-60" />
        </>
      )}

      {/* Deep Analysis — SERP competitor gap vs our blog */}
      {beforeDeepEnhance && (
        <div className="px-4 pt-3 pb-1">
          <div className="flex w-full items-center gap-0.5 p-0.5 rounded-full border border-border-subtle bg-surface-primary/40">
            {(["before", "after"] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => !editMode && setDeepCompareView(v)}
                disabled={editMode}
                className="flex-1 px-4 py-1.5 rounded-full text-[12px] font-medium capitalize transition-all disabled:cursor-not-allowed disabled:opacity-40"
                style={deepCompareView === v ? { background: V.txt, color: V.bg } : { background: "transparent", color: V.txtMute }}
                title={v === "before" ? "Original draft" : "AI-enhanced rewrite"}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={`px-4 pb-3 ${fromAnalyzeContentPage ? "pt-2" : "pt-4"} ${sidebarMuted ? "opacity-25 pointer-events-none" : ""}`}>
        <button
          type="button"
          onClick={() => void openDeepAnalysisModal()}
          disabled={editMode || savingContent || !displayBlog?.target_keyword?.trim()}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-bold transition-all disabled:opacity-40 bg-surface-elevated border border-border-subtle text-text-primary hover:bg-surface-hover hover:border-border-strong shadow-sm"
          title={!displayBlog?.target_keyword?.trim() ? "Add a target keyword to run deep analysis" : undefined}
        >
          <svg className="h-4 w-4 shrink-0 text-brand-action" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
          {hasSavedDeepAnalysis ? "View Deep Analysis" : "Deep Analysis"}
        </button>
        {deepScoreDisplay != null && (
          <p className="mt-1.5 text-center text-[10px] text-text-tertiary">
            Score <span className="font-semibold text-text-secondary">{deepScoreDisplay}/100</span>
          </p>
        )}
      </div>
      <div className="h-px mx-4 bg-border-subtle opacity-60" />

      {/* SEO Score — borderless embed, blends into panel bg */}
      <div className={`transition-all duration-300 ${sidebarMuted ? "opacity-25 grayscale pointer-events-none" : ""}`}>
        <SEOScorePanel
          key={`${currentBlog.id}-${currentBlog.updated_at}-${scoreVersion}`}
          blog={currentBlog}
          projectDomain={project?.domain}
          fixingIssue={fixingIssue}
          onFixIssue={check => handleSeoFix(check.key)}
          className="p-4 bg-transparent border-0"
        />
      </div>

      {(editMode || savingContent || scoreRefreshing) && (
        <div className="px-4 pb-3 -mt-1">
          <p className="text-[10px] text-text-tertiary leading-relaxed">
            {editMode ? "Score paused while editing. Save to recalculate." : "Recalculating SEO score…"}
          </p>
        </div>
      )}
      {fixError && (
        <div className="px-4 pb-3">
          <p className="text-[10px] text-rose-500">{fixError}</p>
        </div>
      )}

      {/* ── Editorial metadata ──────────────────────────────────── */}
      <Divider />
      <div className="px-4 pt-3.5 pb-1">

        {/* Status — only shown in edit mode */}
        {editMode && (
          <div className="mb-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <SLabel>Status</SLabel>
              {savingStatus && <SpinIcon className="w-3 h-3" />}
            </div>
            <div className="relative">
              <select
                value={blogStatus}
                onChange={e => handleStatusChange(e.target.value as BlogStatus)}
                disabled={savingStatus}
                className="w-full rounded-[6px] px-3 py-2 text-[13px] font-medium outline-none appearance-none transition-all pr-7"
                style={{ background: "var(--surface-tertiary)", border: `1px solid var(--border-subtle)`, color: V.txt }}
              >
                {BLOG_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
              </svg>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusInfo.color }} />
              <p className="text-[10px] text-text-tertiary">{statusInfo.hint}</p>
            </div>
            {statusError && <p className="mt-1 text-[10px] text-rose-500">{statusError}</p>}
          </div>
        )}

        {/* Target keyword */}
        <div className="mb-3.5">
          <SLabel>Target Keyword</SLabel>
          <p className="text-[13px] font-semibold text-text-primary leading-snug">{currentBlog.target_keyword}</p>
        </div>

        {/* Type + Slug side by side */}
        <div className="grid grid-cols-2 gap-4 mb-3.5">
          <div>
            <SLabel>Type</SLabel>
            <p className="text-[12px] font-medium text-text-primary">{currentBlog.article_type}</p>
          </div>
          <div className="min-w-0">
            <SLabel>Slug</SLabel>
            <p className="text-[11px] break-all text-text-tertiary leading-snug" style={{ fontFamily: "CohereMono, monospace" }}>
              /{currentBlog.slug}
            </p>
          </div>
        </div>

      </div>

      {/* ── Meta description ─────────────────────────────────────── */}
      <Divider />
      <div className="px-4 py-3.5">
        <div className="flex items-center justify-between mb-1.5">
          <SLabel>Meta Description</SLabel>
          <span
            className="text-[9px] font-semibold tabular-nums rounded-full px-1.5 py-0.5"
            style={{
              background: currentBlog.meta_description.length >= 140 && currentBlog.meta_description.length <= 165 ? "#16a34a18" : "#b91c1c14",
              color: currentBlog.meta_description.length >= 140 && currentBlog.meta_description.length <= 165 ? "#16a34a" : "#b91c1c",
            }}
          >
            {currentBlog.meta_description.length}/160
          </span>
        </div>
        <p className="text-[11px] text-text-tertiary leading-relaxed">{currentBlog.meta_description}</p>
      </div>

      {/* ── Links ────────────────────────────────────────────────── */}
      {(externalLinks.length > 0 || internalLinks.length > 0) && (
        <>
          <Divider />
          <div className="px-4 py-3.5 space-y-3">
            {externalLinks.length > 0 && (
              <div>
                <SLabel>External links ({externalLinks.length})</SLabel>
                <div className="space-y-1">
                  {externalLinks.map((url, i) => {
                    return (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[11px] hover:underline truncate"
                        style={{ color: V.action }}
                        title={url}>
                        <ExternalLinkIcon className="w-3 h-3 shrink-0" />
                        <span className="truncate">{url}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
            {internalLinks.length > 0 && (
              <div>
                <SLabel>Internal links ({internalLinks.length})</SLabel>
                <div className="space-y-0.5">
                  {internalLinks.map((path, i) => {
                    const fullUrl = path.startsWith('/') && project?.domain ? `https://${project.domain}${path}` : path;
                    return (
                      <a key={i} href={fullUrl} target="_blank" rel="noopener noreferrer" 
                        className="text-[11px] truncate block hover:underline" 
                        style={{ fontFamily: "CohereMono, monospace", color: V.coral }}
                        title={fullUrl}>
                        {fullUrl}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Schedule ─────────────────────────────────────────────── */}
      <Divider />
      <div className="px-4 py-3.5">
        <PreviewerScheduler
          projectId={projectId}
          blogId={blog.id}
          entryId={blog.entry_id}
          onScheduleUpdated={(newId) => {
            setBlog((b) => {
              const nextVal = b ? { ...b, entry_id: newId } : b;
              if (nextVal) {
                queryClient.setQueryData(qk.blog(blogId), { success: true, data: nextVal });
              }
              return nextVal;
            });
            setScheduleVersion((v) => v + 1);
          }}
        />
      </div>

      {/* ── Export ───────────────────────────────────────────────── */}
      <Divider />
      <div className="px-4 py-3.5">
        <SLabel>Export</SLabel>
        <div className="grid grid-cols-2 gap-1.5">
          {FORMATS.map(fmt => (
            <button
              key={fmt.key}
              onClick={() => handleDownload(fmt.key)}
              disabled={downloading === fmt.key}
              className="group flex items-center justify-between rounded-[6px] px-3 py-2 text-[11px] font-medium transition-all disabled:opacity-50"
              style={{ border: `1px solid var(--border-subtle)`, background: "var(--surface-tertiary)", color: V.txtMute }}
              onMouseEnter={e => { e.currentTarget.style.color = V.txt; e.currentTarget.style.borderColor = V.border; }}
              onMouseLeave={e => { e.currentTarget.style.color = V.txtMute; e.currentTarget.style.borderColor = V.borderS; }}
            >
              <span style={MONO}>{fmt.ext}</span>
              {downloading === fmt.key ? <SpinIcon className="w-3 h-3" /> : <DownloadIcon className="w-3 h-3" />}
            </button>
          ))}
        </div>
      </div>

      {/* ── Generate — hidden for imported/repaired content ──────── */}
      {!isImport && !isRepair && (
        <>
          <Divider />
          <div className="px-4 py-4">
            <SLabel>Generate</SLabel>
            <p className="text-[11px] text-text-tertiary mb-2.5 leading-relaxed">
              {isAfterView
                ? "Calendar regeneration runs against the original draft. Switch to Before to use it."
                : blog.entry_id
                ? "Runs full research + generation with Gemini AI"
                : "Not available for imported drafts — create a scheduled post from Calendar to run full generation."}
            </p>
            <button
              onClick={handleRegenerate}
              disabled={regenerating || !blog.entry_id || isAfterView}
              className="w-full rounded-[32px] py-2.5 text-[13px] font-medium flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
              style={{ background: V.txt, color: V.bg }}
            >
              {regenerating ? <><SpinIcon />&nbsp;Generating…</> : "Generate blog"}
            </button>
            {editError && <p className="mt-2 text-[11px] text-brand-coral">{editError}</p>}
          </div>
        </>
      )}
    </>
  );

  return (
    <>
      <PreviewShell
        header={breadcrumb}
        toolbarLeft={toolbarLeft}
        toolbarRight={toolbarRight}
        sidebar={sidebar}
        sidebarWidthPx={288}
        framedCanvas={false}
        toolbarInsideCanvas
        immersiveFullscreen
      >
        <div ref={blogPanelRef} className="h-full overflow-y-auto">
          {editError && (
            <div className="px-5 py-2.5 text-[12px] text-rose-500 bg-rose-500/5 border-b border-border-subtle">
              {editError}
            </div>
          )}

          {deepEnhancedResult && deepCompareView === "after" && (
            <div className="mx-5 my-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-[13px]">
              <div className="flex items-start gap-2.5">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-text-primary mb-1">Deep Enhancement Summary</p>
                  <p className="text-text-secondary leading-relaxed mb-3">{deepEnhancedResult.improvementSummary}</p>
                  
                  {deepEnhancedResult.appliedFixes?.length > 0 && (
                    <div className="space-y-1 mb-3">
                      <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Applied Fixes</p>
                      <ul className="list-inside list-disc space-y-0.5 text-[12px] text-text-secondary">
                        {deepEnhancedResult.appliedFixes.map((fix, idx) => (
                          <li key={idx}>{fix}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {deepEnhancedResult.unresolvedIssues?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Unresolved / Needs Manual Work</p>
                      <ul className="list-inside list-disc space-y-0.5 text-[12px] text-text-tertiary">
                        {deepEnhancedResult.unresolvedIssues.map((issue, idx) => (
                          <li key={idx}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {editMode ? (
            <div>
              <ArticleMetaRow blog={currentBlog} />
              <article className="mx-auto max-w-[860px] px-8 py-12">
                <MemoizedVisualBlogEditors
                  key={`${currentBlog.id}-${editSessionKey}`}
                  blog={currentBlog}
                  ownSiteHost={ownSiteHost}
                  titleRef={titleEditorRef}
                  descRef={descEditorRef}
                />
                <div className="text-text-secondary" style={{ fontSize: 17, lineHeight: 1.78 }}>
                  <TipTapBlogEditor
                    key={`tiptap-${currentBlog.id}-${editSessionKey}`}
                    initialMarkdown={stripHeroHeading(currentBlog).body}
                    containerRef={editorRef}
                    ref={tiptapBodyRef}
                  />
                </div>
                <footer className="mt-14 pt-6 text-[11px] text-text-tertiary border-t border-border-subtle">
                  — End of article —
                </footer>
              </article>
              <p className="px-5 py-3 text-[11px] text-text-tertiary border-t border-border-subtle">
                Save to update title, description, SEO score, word count, and link counts.
              </p>
            </div>
          ) : (
            <EditorialPreview blog={currentBlog} ownSiteHost={ownSiteHost} />
          )}
        </div>
      </PreviewShell>

      <BlogEditAiFixOverlay
        active={editMode && !aiRewriter.open}
        getRoots={getEditRoots}
        panelRef={blogPanelRef}
        onOpen={({ snapshot, range }) => {
          selectionSnapshotRef.current = { range };
          setAiRewriter({ open: true, snapshot });
        }}
      />

      <BlogImageEditOverlay
        active={editMode}
        bodyRef={editorRef}
        onUpload={handleImageUpload}
        onRegenerate={handleImageRegenerate}
        onRemove={handleImageRemove}
        isRegenerating={regeneratingImage}
      />

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleImageFileChange}
      />

      <BlogContentAnalysisModal
        open={analysisModalOpen}
        analysis={contentAnalysis}
        loading={analysisLoading}
        error={analysisError}
        isStale={analysisIsStale}
        onClose={() => setAnalysisModalOpen(false)}
        onReanalyse={() => void runAnalysis({ reanalyse: true })}
        onGenerateEnhanced={() => void handleAnalysisEnhanced()}
        onSchedule={() => void handleAnalysisSchedule()}
        reanalysing={analysisReanalysing}
        enhancing={analysisEnhancing}
        scheduling={analysisScheduling}
      />

      <Suspense fallback={null}>
        <BlogDeepAnalysisModal
          open={deepModalOpen}
          analysis={deepAnalysis}
          loading={deepLoading}
          loadingStage={deepStage}
          error={deepError}
          onClose={() => setDeepModalOpen(false)}
          onGenerateEnhanced={() => void handleDeepAnalysisEnhanced()}
          enhancing={deepEnhancing}
        />
      </Suspense>

      <BlogAiRewriterModal
        open={aiRewriter.open}
        blogId={currentBlog.id}
        projectDomain={project?.domain ?? ""}
        selection={aiRewriter.snapshot}
        renderMarkdownSnippet={md => (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={buildMarkdownComponents(internalSetForBlog(currentBlog), ownSiteHost)}
            urlTransform={markdownUrlTransform}
          >
            {md}
          </ReactMarkdown>
        )}
        onClose={() => {
          setAiRewriter({ open: false, snapshot: null });
          selectionSnapshotRef.current = null;
        }}
        onInsert={handleAiRewriterInsert}
      />
    </>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────
function SpinIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return <div className={`animate-spin rounded-full border-2 border-current/20 border-t-current ${className}`} />;
}
function ResearchIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714a2.25 2.25 0 0 0 .659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 1-6.23-.607L5 14.5" /></svg>;
}
function ExternalLinkIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>;
}
function LinkIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>;
}
function DownloadIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>;
}

// ─── Pill ─────────────────────────────────────────────────────────────────
function Pill({ color, border, bg, children }: { color: string; border: string; bg?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium"
      style={{ color, border: `1px solid ${border}`, background: bg ?? "transparent" }}>
      {children}
    </span>
  );
}

// ─── Repair Banner ────────────────────────────────────────────────────────
function RepairBanner({ sourceUrl, repairNotes, projectId }: { sourceUrl: string; repairNotes: string[]; projectId: string }) {
  const [open, setOpen] = useState(repairNotes.length > 0);
  return (
    <div className="rounded-[8px] px-4 py-3 border border-border-subtle bg-surface-secondary">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-surface-tertiary" style={{ color: V.action }}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.847-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase text-text-tertiary mb-0.5" style={MONO}>Repair Draft</p>
            <p className="text-[13px] text-text-primary">Surgical repair of <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: V.action }}>{sourceUrl}</a></p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {repairNotes.length > 0 && (
            <button onClick={() => setOpen(v => !v)} className="rounded-full px-3 py-1.5 text-[11px] font-medium border border-border-subtle text-text-tertiary hover:text-text-primary transition-colors">
              {open ? "Hide" : "Summary"}
            </button>
          )}
          <ProjectNavLink href={`/projects/${projectId}/audit`} className="rounded-full px-3 py-1.5 text-[11px] font-medium border border-border-subtle text-text-primary hover:bg-surface-tertiary transition-colors">
            ← Audit
          </ProjectNavLink>
        </div>
      </div>
      {open && repairNotes.length > 0 && (
        <div className="mt-2.5 rounded-[6px] p-3 bg-surface-tertiary">
          <ul className="space-y-1 text-[11px] text-text-secondary">
            {repairNotes.map((note, i) => (
              <li key={i} className="flex items-start gap-2">
                <svg className="mt-0.5 h-3 w-3 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Editorial Preview ────────────────────────────────────────────────────
function EditorialPreview({ blog, ownSiteHost }: { blog: Blog; ownSiteHost: string | null }) {
  const internalSet = useMemo(() => internalSetForBlog(blog), [blog]);
  const { heroTitle, body } = useMemo(() => stripHeroHeading(blog), [blog]);
  const components = useMemo(() => buildMarkdownComponents(internalSet, ownSiteHost), [internalSet, ownSiteHost]);
  return (
    <>
      <ArticleMetaRow blog={blog} />
      <article className="mx-auto max-w-[860px] px-8 py-12">
        <header className="mb-10 pb-8 border-b border-border-subtle">
          <h1 className="mb-4 text-text-primary" style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.5 }}>
            {heroTitle}
          </h1>
          {blog.meta_description && (
            <p className="text-text-tertiary" style={{ fontSize: 17, lineHeight: 1.7 }}>{blog.meta_description}</p>
          )}
        </header>
        <div className="editorial-body space-y-5 text-text-secondary" style={{ fontSize: 17, lineHeight: 1.78 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={markdownUrlTransform}>
            {body}
          </ReactMarkdown>
        </div>
        <footer className="mt-14 pt-6 text-[11px] text-text-tertiary border-t border-border-subtle">
          — End of article —
        </footer>
      </article>
    </>
  );
}

// ─── Article meta row ─────────────────────────────────────────────────────
function ArticleMetaRow({ blog }: { blog: Blog }) {
  const date = new Date(blog.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return (
    <div className="px-6 py-2.5 bg-surface-secondary border-b border-border-subtle">
      <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-3">
        {blog.article_type && (
          <span className="rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase border border-border-subtle bg-surface-primary text-text-secondary" style={MONO}>
            {blog.article_type}
          </span>
        )}
        {blog.target_keyword && (
          <span className="text-[11px] text-text-tertiary">
            Target: <span className="font-semibold text-text-secondary">{blog.target_keyword}</span>
          </span>
        )}
        <span className="text-border-subtle opacity-80">·</span>
        <span className="text-[11px] text-text-tertiary">{date}</span>
        <span className="text-border-subtle opacity-80">·</span>
        <span className="text-[11px] text-text-tertiary">{Math.max(1, Math.ceil(blog.word_count / 200))} min read</span>
        <span className="text-border-subtle opacity-80">·</span>
        <span className="text-[11px] text-text-tertiary">{blog.word_count.toLocaleString()} words</span>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function internalSetForBlog(blog: Blog): Set<string> { return new Set(blog.internal_links ?? []); }

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/\/embed\/([^/?#]+)/);
      if (m) return m[1];
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return id || null;
    }
  } catch {
    // not a valid URL
  }
  return null;
}

function stripHeroHeading(blog: Blog): { heroTitle: string; body: string } {
  const h1 = blog.content.match(/^\s*#\s+(.+)\s*$/m);
  if (!h1) return { heroTitle: blog.title, body: blog.content };
  return { heroTitle: h1[1].replace(/\*+/g, "").trim(), body: blog.content.replace(h1[0], "").replace(/^\n+/, "") };
}

function markdownUrlTransform(url: string): string {
  const t = url.trim();
  if (/^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/i.test(t)) return t;
  if (/^data:image\/svg\+xml;[a-z0-9;=,-]+,[\s\S]+$/i.test(t)) return t;
  if (/^(https?:|mailto:|tel:)/i.test(t)) return t;
  if (t.startsWith("/") || t.startsWith("#")) return t;
  return "";
}

// ─── Markdown components ──────────────────────────────────────────────────
function linkHostName(href: string): string | null {
  try {
    return new URL(href).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function buildMarkdownComponents(internalSet: Set<string>, ownSiteHost: string | null = null): Components {
  const MarkdownLink: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement>> = ({ href = "", children, ...rest }) => {
    const isHttp = /^https?:\/\//i.test(href);
    const host = isHttp ? linkHostName(href) : null;
    const isOwnSite =
      Boolean(ownSiteHost && host && (host === ownSiteHost || host.endsWith(`.${ownSiteHost}`)));
    const isInternal = (!isHttp && href.startsWith("/")) || internalSet.has(href) || isOwnSite;
    const showExternalChrome = isHttp && !isOwnSite;
    const label = typeof children === "string" ? children : flattenChildren(children);
    return (
      <a href={href} target="_blank" rel={showExternalChrome ? "noopener noreferrer" : undefined}
        className="underline underline-offset-[3px] transition-colors rounded-sm px-0.5 inline-flex items-baseline gap-0.5"
        style={{ color: isInternal ? V.action : V.coral, textDecorationStyle: "dotted", textDecorationColor: "currentColor" }} {...rest}>
        {label}
        {showExternalChrome && (
          <svg className="relative top-px inline h-3 w-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        )}
      </a>
    );
  };

  const H1: ComponentType<HTMLAttributes<HTMLHeadingElement>> = ({ children, ...r }) => <h1 className="text-text-primary" style={{ marginTop: 40, marginBottom: 20, fontSize: 30, fontWeight: 800, lineHeight: 1.2, letterSpacing: -0.3 }} {...r}>{children}</h1>;
  const H2: ComponentType<HTMLAttributes<HTMLHeadingElement>> = ({ children, ...r }) => <h2 className="text-text-primary" style={{ marginTop: 48, marginBottom: 16, fontSize: 24, fontWeight: 800, lineHeight: 1.25, letterSpacing: -0.2 }} {...r}>{children}</h2>;
  const H3: ComponentType<HTMLAttributes<HTMLHeadingElement>> = ({ children, ...r }) => <h3 className="text-text-primary" style={{ marginTop: 32, marginBottom: 12, fontSize: 18, fontWeight: 700 }} {...r}>{children}</h3>;
  const P: ComponentType<HTMLAttributes<HTMLParagraphElement>> = ({ children, ...r }) => <p className="text-text-secondary" style={{ fontSize: 17, lineHeight: 1.78 }} {...r}>{children}</p>;
  const Strong: ComponentType<HTMLAttributes<HTMLElement>> = ({ children, ...r }) => <strong className="font-bold text-text-primary" {...r}>{children}</strong>;
  const Em: ComponentType<HTMLAttributes<HTMLElement>> = ({ children, ...r }) => <em className="italic text-text-secondary" {...r}>{children}</em>;
  const UL: ComponentType<HTMLAttributes<HTMLUListElement>> = ({ children, ...r }) => <ul className="my-5 space-y-2 pl-6 list-disc text-text-secondary" {...r}>{children}</ul>;
  const OL: ComponentType<HTMLAttributes<HTMLOListElement>> = ({ children, ...r }) => <ol className="my-5 space-y-2 pl-6 list-decimal text-text-secondary" {...r}>{children}</ol>;
  const LI: ComponentType<HTMLAttributes<HTMLLIElement>> = ({ children, ...r }) => <li className="text-text-secondary [&>p]:my-0!" style={{ fontSize: 17, lineHeight: 1.7 }} {...r}>{children}</li>;
  const BQ: ComponentType<HTMLAttributes<HTMLQuoteElement>> = ({ children, ...r }) => (
    <blockquote className="my-6 rounded-r-[4px] pl-5 pr-4 py-4 italic text-text-secondary [&>p]:my-0! border-l-2 border-text-tertiary bg-surface-secondary" style={{ fontSize: 17, lineHeight: 1.7 }} {...r}>{children}</blockquote>
  );
  const Code: ComponentType<HTMLAttributes<HTMLElement> & { className?: string }> = ({ children, className, ...r }) => {
    if (typeof className === "string" && /language-/i.test(className))
      return <code className={`${className} font-mono text-[13px] text-text-secondary`} {...r}>{children}</code>;
    return <code className="rounded-[4px] px-1.5 py-0.5 text-[0.85em] font-mono bg-surface-secondary text-text-tertiary border border-border-subtle" {...r}>{children}</code>;
  };
  const Pre: ComponentType<HTMLAttributes<HTMLPreElement>> = ({ children, ...r }) => {
    const childrenArray = Children.toArray(children);
    const codeChild = childrenArray.find(
      (child): child is ReactElement<{ className?: string; children?: ReactNode }> => {
        if (!isValidElement(child)) return false;
        const props = child.props as any;
        return typeof props?.className === "string" && props.className.includes("language-youtube");
      }
    );

    if (codeChild) {
      const rawUrl = flattenChildren(codeChild.props.children).trim();
      const videoId = extractYouTubeId(rawUrl);
      if (videoId) {
        return (
          <div
            className="my-8 overflow-hidden rounded-[12px] border border-border-subtle"
            style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}
          >
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}`}
              title="YouTube video"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                border: 0,
              }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        );
      }
    }
    return <pre className="my-6 overflow-x-auto rounded-[8px] p-4 text-[13px] leading-relaxed border border-border-subtle bg-surface-secondary text-text-secondary" {...r}>{children}</pre>;
  };
  const HR: ComponentType<HTMLAttributes<HTMLHRElement>> = (p) => <hr className="my-10 border-t border-border-subtle" {...p} />;
  const Table: ComponentType<HTMLAttributes<HTMLTableElement>> = ({ children, ...r }) => (
    <div className="my-6 overflow-x-auto rounded-[8px] border border-border-subtle">
      <table className="w-full border-collapse text-[14px]" {...r}>{children}</table>
    </div>
  );
  const THead: ComponentType<HTMLAttributes<HTMLTableSectionElement>> = ({ children, ...r }) => <thead className="text-left bg-surface-secondary text-text-tertiary" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }} {...r}>{children}</thead>;
  const TR: ComponentType<HTMLAttributes<HTMLTableRowElement>> = ({ children, ...r }) => <tr className="border-t border-border-subtle" {...r}>{children}</tr>;
  const TD: ComponentType<HTMLAttributes<HTMLTableCellElement>> = ({ children, ...r }) => <td className="px-4 py-2.5 align-top text-text-secondary" {...r}>{children}</td>;
  const TH: ComponentType<HTMLAttributes<HTMLTableCellElement>> = ({ children, ...r }) => <th className="px-4 py-2.5 align-top" {...r}>{children}</th>;
  const Img: ComponentType<ImgHTMLAttributes<HTMLImageElement>> = ({ alt = "", src, ...r }) => {
    const safeSrc = typeof src === "string" ? markdownUrlTransform(src) : "";
    if (!safeSrc)
      return null;
    return (
      <span className="my-8 block overflow-hidden rounded-[16px] border border-border-subtle">
        <img alt={alt} src={safeSrc} loading="lazy" className="aspect-video w-full object-cover" {...r} />
        {alt && <span className="block px-4 py-2 text-[12px] text-text-tertiary border-t border-border-subtle">{alt}</span>}
      </span>
    );
  };

  return { a: MarkdownLink, h1: H1, h2: H2, h3: H3, img: Img, p: P, strong: Strong, em: Em, ul: UL, ol: OL, li: LI, blockquote: BQ, code: Code, pre: Pre, hr: HR, table: Table, thead: THead, tr: TR, td: TD, th: TH } as unknown as Components;
}

function flattenChildren(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenChildren).join("");
  return "";
}

/** One-time HTML for the visual body editor — avoids React children inside contentEditable. */
function markdownBodyToHtml(markdown: string, internalSet: Set<string>, ownSiteHost: string | null): string {
  return renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={buildMarkdownComponents(internalSet, ownSiteHost)} urlTransform={markdownUrlTransform}>
      {markdown}
    </ReactMarkdown>
  );
}

/** Inserts AI rewriter output into contentEditable with the same link styling as the seeded editor. */
function markdownAiSnippetToDocumentFragment(
  markdown: string,
  blog: Blog,
  doc: Document,
  ownSiteHost: string | null
): DocumentFragment {
  const internalSet = internalSetForBlog(blog);
  const html = renderToStaticMarkup(
    <div className="text-text-secondary" style={{ fontSize: 17, lineHeight: 1.78 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={buildMarkdownComponents(internalSet, ownSiteHost)} urlTransform={markdownUrlTransform}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const wrapper = parsed.body.firstElementChild;
  const frag = doc.createDocumentFragment();
  if (!wrapper) {
    frag.appendChild(doc.createTextNode(markdown));
    return frag;
  }
  while (wrapper.firstChild) {
    const next = wrapper.firstChild;
    frag.appendChild(doc.importNode(next, true));
    wrapper.removeChild(next);
  }
  if (!frag.childNodes.length) frag.appendChild(doc.createTextNode(markdown));
  return frag;
}
