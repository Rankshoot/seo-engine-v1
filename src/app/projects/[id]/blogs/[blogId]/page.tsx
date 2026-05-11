"use client";

import {
  useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, memo,
  type AnchorHTMLAttributes, type ComponentType,
  type HTMLAttributes, type ImgHTMLAttributes, type ReactNode,
  type RefObject,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useParams } from "next/navigation";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { blogsApi } from "@/frontend/api/blogs";
import { projectsApi } from "@/frontend/api/projects";
import { Blog, BlogSeoIssueKey, BlogStatus, WORD_COUNT_OPTIONS, ExportFormat } from "@/lib/types";
import type { Project } from "@/lib/types";
import { exportToMarkdown, exportToHTML, exportToText, exportToDocx, triggerBlogDownload } from "@/lib/export";
import { normalizeSiteHost, reclassifyBlogLinkSidebarLists } from "@/lib/blog-content";
import SEOScorePanel from "@/components/dashboard/SEOScorePanel";
import { BlogAiRewriterModal } from "@/components/BlogAiRewriterModal";
import { rangeSelectionToMarkdown } from "@/lib/editor-selection-markdown";

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
    bodyRef,
  }: {
    blog: Blog;
    ownSiteHost: string | null;
    titleRef: RefObject<HTMLHeadingElement | null>;
    descRef: RefObject<HTMLParagraphElement | null>;
    bodyRef: RefObject<HTMLDivElement | null>;
  }) {
    useLayoutEffect(() => {
      const h = titleRef.current;
      const p = descRef.current;
      const bodyEl = bodyRef.current;
      if (!h || !p || !bodyEl) return;
      const { heroTitle, body } = stripHeroHeading(blog);
      h.textContent = heroTitle;
      p.textContent = blog.meta_description ?? "";
      bodyEl.innerHTML = markdownBodyToHtml(body, internalSetForBlog(blog), ownSiteHost);
    }, [blog, ownSiteHost, titleRef, descRef, bodyRef]);

    return (
      <>
        <header className="mb-10 pb-8 border-b border-border-subtle">
          <h1 ref={titleRef} contentEditable suppressContentEditableWarning spellCheck
            className="mb-4 outline-none text-text-primary"
            style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.5 }}
          />
          <p ref={descRef} contentEditable suppressContentEditableWarning spellCheck
            className="outline-none text-text-tertiary" style={{ fontSize: 17, lineHeight: 1.7 }}
          />
        </header>
        <div ref={bodyRef} contentEditable suppressContentEditableWarning spellCheck
          className="editorial-body visual-blog-editor min-h-[50vh] space-y-5 outline-none text-text-secondary"
          style={{ fontSize: 17, lineHeight: 1.78 }}
        />
      </>
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
      if (targetImg) setTargetImg(null);
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
  onOpen: (payload: { text: string; range: Range }) => void;
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
    const panel = panelRef.current;
    panel?.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      document.removeEventListener("selectionchange", schedule);
      document.removeEventListener("keyup", schedule);
      document.removeEventListener("mouseup", schedule);
      panel?.removeEventListener("scroll", schedule);
    };
  }, [active, tick, panelRef]);

  if (!active) return null;

  return (
    <button
      ref={btnRef}
      type="button"
      className="pointer-events-auto rounded-full border border-border-default px-2.5 py-1 text-[11px] font-semibold shadow-lg"
      style={{ display: "none", background: "var(--text-primary)", color: "var(--surface-primary)" }}
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
        const text = asMd.trim() ? asMd : sel.toString();
        if (!text.trim()) return;
        onOpen({ text, range });
      }}
    >
      Ai fix
    </button>
  );
}

export default function BlogViewerPage() {
  const { id: projectId, blogId } = useParams<{ id: string; blogId: string }>();

  const [blog, setBlog]                   = useState<Blog | null>(null);
  const [project, setProject]             = useState<Project | null>(null);
  const [loading, setLoading]             = useState(true);
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
  const [activeView, setActiveView]       = useState<"preview" | "raw">("preview");
  const titleEditorRef = useRef<HTMLHeadingElement | null>(null);
  const descEditorRef  = useRef<HTMLParagraphElement | null>(null);
  const editorRef      = useRef<HTMLDivElement | null>(null);
  const blogPanelRef   = useRef<HTMLDivElement | null>(null);
  const selectionSnapshotRef = useRef<{ range: Range } | null>(null);

  const [editSessionKey, setEditSessionKey] = useState(0);
  const [aiRewriter, setAiRewriter] = useState<{ open: boolean; text: string }>({ open: false, text: "" });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editingImage, setEditingImage] = useState<HTMLImageElement | null>(null);
  const [regeneratingImage, setRegeneratingImage] = useState(false);

  const ownSiteHost = useMemo(
    () => (project?.domain?.trim() ? normalizeSiteHost(project.domain) : null),
    [project?.domain]
  );

  const { externalLinks, internalLinks } = useMemo(
    () =>
      reclassifyBlogLinkSidebarLists(
        blog?.external_links ?? [],
        blog?.internal_links ?? [],
        project?.domain
      ),
    [blog?.external_links, blog?.internal_links, project?.domain]
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
        editingImage.src = base64;
      }
    };
    reader.readAsDataURL(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setEditingImage(null);
  };

  const handleImageRegenerate = async (img: HTMLImageElement) => {
    if (!blog) return;
    setRegeneratingImage(true);
    try {
      const res = await blogsApi.regenerateImage(blog.id, {
        imageAlt: img.alt,
        contextBefore: "", // We could extract context from DOM if needed
        contextAfter: "",
      });
      if (res.success && res.data) {
        img.src = res.data.url;
        img.alt = res.data.alt;
        const nextSibling = img.nextElementSibling;
        if (nextSibling && nextSibling.tagName === "SPAN") {
          nextSibling.textContent = res.data.alt;
        }
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
    const parent = img.parentElement;
    if (parent && parent.tagName === "SPAN" && parent.classList.contains("overflow-hidden")) {
      parent.remove();
    } else {
      img.remove();
    }
  };

  const getEditRoots = useCallback(() => [titleEditorRef.current, descEditorRef.current, editorRef.current], []);

  useEffect(() => {
    if (!editMode) {
      setAiRewriter({ open: false, text: "" });
      selectionSnapshotRef.current = null;
    }
  }, [editMode]);

  useEffect(() => {
    Promise.all([
      blogsApi.getById(blogId),
      projectsApi.get(projectId),
    ]).then(([blogRes, projRes]) => {
      if (blogRes.success && blogRes.data) setBlog(blogRes.data);
      if (projRes.success && projRes.data) setProject(projRes.data);
      setLoading(false);
    });
  }, [blogId, projectId]);

  const handleDownload = async (format: ExportFormat) => {
    if (!blog) return;
    setDownloading(format);
    const projectMeta = project
      ? { domain: project.domain ?? undefined, company: project.company ?? undefined }
      : undefined;
    try {
      let blob: Blob;
      if (format === "markdown") blob = exportToMarkdown(blog, projectMeta);
      else if (format === "html") blob = exportToHTML(blog, projectMeta);
      else if (format === "txt") blob = exportToText(blog);
      else blob = await exportToDocx(blog);
      // `triggerBlogDownload` enforces the right extension + MIME type and
      // runs the title/slug through `safeFilename` so the OS save dialog
      // doesn't choke on slashes or punctuation.
      triggerBlogDownload(blob, blog, format);
    } catch (e) {
      console.error("[blog] download failed", e);
    } finally {
      setDownloading(null);
    }
  };

  const handleRegenerate = async () => {
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
        setBlog(res.data);
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
    if (!blog) return;
    await navigator.clipboard.writeText(blog.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startEditing  = () => {
    if (!blog) return;
    setEditError("");
    setActiveView("preview");
    setEditSessionKey(k => k + 1);
    setEditMode(true);
  };
  const cancelEditing = () => {
    setEditMode(false);
    setEditError("");
    setAiRewriter({ open: false, text: "" });
    selectionSnapshotRef.current = null;
  };

  const handleAiRewriterInsert = (rewritten: string) => {
    const snap = selectionSnapshotRef.current;
    if (!blog || !snap?.range) {
      setEditError("Couldn't apply rewrite — select text again.");
      setAiRewriter({ open: false, text: "" });
      return;
    }
    try {
      const range = snap.range.cloneRange();
      if (!document.contains(range.startContainer)) {
        setEditError("Editor changed — select text again.");
        setAiRewriter({ open: false, text: "" });
        return;
      }
      range.deleteContents();
      const frag = markdownAiSnippetToDocumentFragment(rewritten.trim(), blog, document, ownSiteHost);
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
      setAiRewriter({ open: false, text: "" });
      setEditError("");
    } catch {
      setEditError("Couldn't insert rewritten text.");
    }
  };

  const saveEditing = async () => {
    if (!blog) return;
    setSavingContent(true);
    setEditError("");
    const html = editorRef.current?.innerHTML ?? "";
    const TurndownService = (await import("turndown")).default;
    const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
    
    // Custom rule to handle our image wrappers so we don't get duplicate alt text
    td.addRule('img-wrapper', {
      filter: function (node) {
        return node.nodeName === 'SPAN' && node.classList.contains('overflow-hidden') && node.querySelector('img') !== null;
      },
      replacement: function (content, node) {
        const img = node.querySelector('img');
        if (!img) return '';
        return `\n\n![${img.getAttribute('alt') || ''}](${img.getAttribute('src') || ''})\n\n`;
      }
    });

    const bodyMd = td.turndown(html).replace(/\n{3,}/g, "\n\n").trim();
    const title = titleEditorRef.current?.textContent?.trim() || blog.title;
    const metaDescription = descEditorRef.current?.textContent?.replace(/\s+/g, " ").trim() || "";
    const md = `# ${title}\n\n${bodyMd}`.replace(/\n{3,}/g, "\n\n").trim();
    const res = await blogsApi.updateContent(blog.id, { content: md, title, metaDescription });
    if (res.success && res.data) {
      setScoreRefreshing(true);
      setBlog(res.data); setEditMode(false); setActiveView("preview");
      setScoreVersion(v => v + 1);
      window.setTimeout(() => setScoreRefreshing(false), 450);
    } else {
      setEditError(res.error ?? "Could not save edited blog.");
    }
    setSavingContent(false);
  };

  const handleStatusChange = async (status: BlogStatus) => {
    if (!blog || blog.status === status) return;
    const prev = blog;
    setSavingStatus(true); setStatusError("");
    setBlog({ ...blog, status });
    const res = await blogsApi.updateStatus(blog.id, status);
    if (res.success && res.data) setBlog(res.data);
    else { setBlog(prev); setStatusError(res.error ?? "Could not update status"); }
    setSavingStatus(false);
  };

  const handleSeoFix = async (key: BlogSeoIssueKey) => {
    if (!blog || fixingIssue || editMode) return;
    setFixingIssue(key); setFixError(""); setScoreRefreshing(true);
    const res = await blogsApi.fixSeo(blog.id, key);
    if (res.success && res.data) { setBlog(res.data); setScoreVersion(v => v + 1); }
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

  const researchSources = blog.research_sources ?? 0;
  const blogStatus      = asBlogStatus(blog.status);
  const statusInfo      = BLOG_STATUSES.find(s => s.value === blogStatus)!;
  const sidebarMuted    = editMode || savingContent || scoreRefreshing;

  return (
    <div className="flex flex-col h-full overflow-hidden gap-3">

      {/* ── Top strip ───────────────────────────────────────────────────── */}
      <div className="shrink-0 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[12px] text-text-tertiary">
          <ProjectNavLink href={`/projects/${projectId}/blogs`} className="hover:text-text-primary transition-colors">
            Content History
          </ProjectNavLink>
          <span className="opacity-30">›</span>
          <span className="font-medium text-text-primary truncate max-w-[380px]">{blog.title}</span>
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

        {researchSources > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Pill color={V.txtMute} border={V.borderS}>
              <ResearchIcon /> Researched: {researchSources} live sources
            </Pill>
            {externalLinks.length > 0 && (
              <Pill color={V.action} border={`${BRAND.actionBlue}44`} bg={`${BRAND.actionBlue}0d`}>
                <ExternalLinkIcon /> {externalLinks.length} external links
              </Pill>
            )}
            {internalLinks.length > 0 && (
              <Pill color={V.coral} border={`${BRAND.coral}44`} bg={`${BRAND.coral}0d`}>
                <LinkIcon /> {internalLinks.length} internal links
              </Pill>
            )}
          </div>
        )}
      </div>

      {/* ── Panels ──────────────────────────────────────────────────────── */}
      <div className="flex gap-5 flex-1 min-h-0">

        {/* LEFT: blog content */}
        <div ref={blogPanelRef} className="flex-1 min-w-0 overflow-y-auto blog-content-panel rounded-[10px] border border-border-subtle bg-surface-primary">

          {/* Sticky toolbar */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-2.5 border-b border-border-subtle bg-surface-primary">
            <div className="flex items-center gap-0.5 p-0.5 rounded-full border border-border-subtle">
              {(["preview", "raw"] as const).map(v => (
                <button
                  key={v}
                  onClick={() => !editMode && setActiveView(v)}
                  disabled={editMode && v === "raw"}
                  className="px-4 py-1 rounded-full text-[12px] font-medium capitalize transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  style={activeView === v ? { background: V.txt, color: V.bg } : { background: "transparent", color: V.txtMute }}
                >
                  {v}
                </button>
              ))}
            </div>
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
                <button type="button" onClick={startEditing} disabled={activeView !== "preview"}
                  className="rounded-full px-4 py-1.5 text-[12px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: V.txt, color: V.bg }}>
                  Edit
                </button>
              )}
              <button onClick={handleCopy} disabled={editMode}
                className="rounded-full px-4 py-1.5 text-[12px] font-medium border border-border-subtle text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {copied ? "Copied!" : "Copy MD"}
              </button>
            </div>
          </div>

          {editError && (
            <div className="px-5 py-2.5 text-[12px] text-rose-500 bg-rose-500/5 border-b border-border-subtle">
              {editError}
            </div>
          )}

          {editMode ? (
            <div>
              <ArticleMetaRow blog={blog} />
              <article className="mx-auto max-w-[860px] px-8 py-12">
                <MemoizedVisualBlogEditors
                  key={editSessionKey}
                  blog={blog}
                  ownSiteHost={ownSiteHost}
                  titleRef={titleEditorRef}
                  descRef={descEditorRef}
                  bodyRef={editorRef}
                />
                <footer className="mt-14 pt-6 text-[11px] text-text-tertiary border-t border-border-subtle">
                  — End of article —
                </footer>
              </article>
              <p className="px-5 py-3 text-[11px] text-text-tertiary border-t border-border-subtle">
                Save to update title, description, SEO score, word count, and link counts.
              </p>
            </div>
          ) : activeView === "preview" ? (
            <EditorialPreview blog={blog} ownSiteHost={ownSiteHost} />
          ) : (
            <div className="p-8">
              <pre className="text-[13px] whitespace-pre-wrap leading-relaxed overflow-x-auto text-text-secondary" style={{ fontFamily: "CohereMono, monospace" }}>
                {blog.content}
              </pre>
            </div>
          )}
        </div>

        {/* RIGHT: unified sidebar */}
        {/* outer clips scrollbar inside the rounded border */}
        <div className="w-[288px] shrink-0 rounded-[10px] border border-border-subtle bg-surface-secondary overflow-hidden">
          <div className="h-full overflow-y-auto blog-sidebar-scroll">

            {/* SEO Score — borderless embed, blends into panel bg */}
            <div className={`transition-all duration-300 ${sidebarMuted ? "opacity-25 grayscale pointer-events-none" : ""}`}>
              <SEOScorePanel
                key={`${blog.id}-${blog.updated_at}-${scoreVersion}`}
                blog={blog}
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

              {/* Status */}
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
                  {/* Custom chevron */}
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

              {/* Target keyword */}
              <div className="mb-3.5">
                <SLabel>Target Keyword</SLabel>
                <p className="text-[13px] font-semibold text-text-primary leading-snug">{blog.target_keyword}</p>
              </div>

              {/* Type + Slug side by side */}
              <div className="grid grid-cols-2 gap-4 mb-3.5">
                <div>
                  <SLabel>Type</SLabel>
                  <p className="text-[12px] font-medium text-text-primary">{blog.article_type}</p>
                </div>
                <div className="min-w-0">
                  <SLabel>Slug</SLabel>
                  <p className="text-[11px] break-all text-text-tertiary leading-snug" style={{ fontFamily: "CohereMono, monospace" }}>
                    /{blog.slug}
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
                    background: blog.meta_description.length >= 140 && blog.meta_description.length <= 165 ? "#16a34a18" : "#b91c1c14",
                    color: blog.meta_description.length >= 140 && blog.meta_description.length <= 165 ? "#16a34a" : "#b91c1c",
                  }}
                >
                  {blog.meta_description.length}/160
                </span>
              </div>
              <p className="text-[11px] text-text-tertiary leading-relaxed">{blog.meta_description}</p>
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
                        {externalLinks.slice(0, 4).map((url, i) => {
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
                        {internalLinks.slice(0, 3).map((path, i) => {
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

            {/* ── Generate ───────────────────────────────────────────── */}
            <Divider />
            <div className="px-4 py-4">
              <SLabel>Generate</SLabel>
              <p className="text-[11px] text-text-tertiary mb-2.5 leading-relaxed">
                {blog.entry_id
                  ? "Runs full research + generation with Gemini AI"
                  : "Not available for imported drafts — create a scheduled post from Calendar to run full generation."}
              </p>
              <button
                onClick={handleRegenerate}
                disabled={regenerating || !blog.entry_id}
                className="w-full rounded-[32px] py-2.5 text-[13px] font-medium flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
                style={{ background: V.txt, color: V.bg }}
              >
                {regenerating ? <><SpinIcon />&nbsp;Generating…</> : "Generate blog"}
              </button>
              {editError && <p className="mt-2 text-[11px] text-brand-coral">{editError}</p>}
            </div>

          </div>
        </div>

      </div>

      <BlogEditAiFixOverlay
        active={editMode && !aiRewriter.open}
        getRoots={getEditRoots}
        panelRef={blogPanelRef}
        onOpen={({ text, range }) => {
          selectionSnapshotRef.current = { range };
          setAiRewriter({ open: true, text });
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

      <BlogAiRewriterModal
        open={aiRewriter.open}
        blogId={blog.id}
        selectedText={aiRewriter.text}
        renderMarkdownSnippet={md => (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={buildMarkdownComponents(internalSetForBlog(blog), ownSiteHost)}
            urlTransform={markdownUrlTransform}
          >
            {md}
          </ReactMarkdown>
        )}
        onClose={() => {
          setAiRewriter({ open: false, text: "" });
          selectionSnapshotRef.current = null;
        }}
        onInsert={handleAiRewriterInsert}
      />
    </div>
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

function stripHeroHeading(blog: Blog): { heroTitle: string; body: string } {
  const h1 = blog.content.match(/^\s*#\s+(.+)\s*$/m);
  if (!h1) return { heroTitle: blog.title, body: blog.content };
  return { heroTitle: h1[1].replace(/\*+/g, "").trim(), body: blog.content.replace(h1[0], "").replace(/^\n+/, "") };
}

function markdownUrlTransform(url: string): string {
  const t = url.trim();
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(t)) return t;
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
  const Pre: ComponentType<HTMLAttributes<HTMLPreElement>> = ({ children, ...r }) => <pre className="my-6 overflow-x-auto rounded-[8px] p-4 text-[13px] leading-relaxed border border-border-subtle bg-surface-secondary text-text-secondary" {...r}>{children}</pre>;
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
      return <span className="my-8 block rounded-[8px] px-4 py-5 text-[12px] text-text-tertiary border border-dashed border-border-subtle bg-surface-secondary">Image could not be displayed.</span>;
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
