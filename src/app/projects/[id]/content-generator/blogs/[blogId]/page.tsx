"use client";

import {
  useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense,
} from "react";
import { useParams, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, useProject, DEFAULT_QUERY_OPTIONS } from "@/lib/query";

import { blogsApi } from "@/frontend/api/blogs";
import { calendarApi } from "@/frontend/api/calendar";
import { computeSEOScore } from "@/lib/seo-analyzer";
import { normalizeSiteHost, reclassifyBlogLinkSidebarLists } from "@/lib/blog-content";
import { analyzeBlogContent, type BlogContentAnalysis } from "@/app/actions/blog-actions";
import { normalizeMarkdownImages } from "@/services/openAiImages";
import {
  exportToMarkdown, exportToHTML, exportToText, exportToDocx, triggerBlogDownload,
} from "@/lib/export";
import type { Blog, BlogSeoIssueKey, BlogStatus, ExportFormat, CalendarEntry } from "@/lib/types";
import type { Project } from "@/lib/types";
import type { BlogDeepAnalysisResult } from "@/lib/blog-deep-analysis-types";
import type { BlogRewriteSelectionSnapshot } from "@/lib/blog-editor-rewrite-selection";

import { ProjectNavLink } from "@/components/ProjectNavLink";
import { PageTitle } from "@/components/common";
import { TipTapBlogEditor, type TipTapBlogEditorRef } from "@/components/content-generator/shared/TipTapBlogEditor";
import SEOScorePanel from "@/components/dashboard/SEOScorePanel";
import { BlogAiRewriterModal } from "@/components/BlogAiRewriterModal";
import {
  PreviewerScheduler,
  PreviewShell,
  StudioBreadcrumb,
  ContentTypeBadge,
  MetricPill,
} from "@/components/content-generator/shared";

// Lazy-loaded heavy modals
const BlogDeepAnalysisModal = lazy(() =>
  import("@/components/BlogDeepAnalysisModal").then(m => ({ default: m.BlogDeepAnalysisModal }))
);
const BlogContentAnalysisModal = lazy(() =>
  import("@/components/blog/BlogContentAnalysisModal").then(m => ({ default: m.BlogContentAnalysisModal }))
);

// Extracted components
import { BlogEditAiFixOverlay, BlogImageEditOverlay } from "@/components/blog/BlogEditOverlays";
import { MemoizedVisualBlogEditors } from "@/components/blog/BlogEditorComponents";
import { EditorialPreview, ArticleMetaRow } from "@/components/blog/BlogArticlePreview";
import {
  SpinIcon, ExternalLinkIcon, DownloadIcon, RepairBanner,
} from "@/components/blog/BlogViewerHelpers";
import {
  buildMarkdownComponents, markdownUrlTransform, internalSetForBlog,
  markdownAiSnippetToDocumentFragment,
} from "@/components/blog/BlogMarkdownComponents";
import { CONCLUSION_META } from "@/components/blog/BlogContentAnalysisModal";

// ─── Constants ─────────────────────────────────────────────────────────────

const V = {
  bg:      "var(--surface-primary)",
  bgSec:   "var(--surface-secondary)",
  border:  "var(--border-default)",
  borderS: "var(--border-subtle)",
  txt:     "var(--text-primary)",
  txtSec:  "var(--text-secondary)",
  txtMute: "var(--text-tertiary)",
  action:  "var(--brand-action)",
  coral:   "var(--brand-coral)",
} as const;

const MONO = { fontFamily: "CohereMono, monospace", letterSpacing: "0.28px" } as const;

/** Query param value set when opening the blog viewer from Analyze content (`/audit/import`). */
const BLOG_VIEW_FROM_ANALYZE_CONTENT = "analyze-content";

const FORMATS: { key: ExportFormat; label: string; ext: string }[] = [
  { key: "markdown", label: "Markdown",   ext: ".md"   },
  { key: "html",     label: "Web Page",   ext: ".html" },
  { key: "txt",      label: "Plain Text", ext: ".txt"  },
  { key: "docx",     label: "Word",       ext: ".docx" },
];

const BLOG_STATUSES: Array<{ value: BlogStatus; label: string; hint: string; color: string }> = [
  { value: "generated", label: "Generated", hint: "Draft written and ready for review.",   color: V.txtMute },
  { value: "approved",  label: "Approved",  hint: "Reviewed and approved for publishing.", color: V.action  },
  { value: "published", label: "Published", hint: "Marked live on your website or CMS.",   color: "#16a34a" },
];

// ─── Utilities ─────────────────────────────────────────────────────────────

function asBlogStatus(s: string | undefined): BlogStatus {
  return s === "approved" || s === "published" ? s : "generated";
}

function normalizeBlogPlaceholders(blog: Blog): Blog;
function normalizeBlogPlaceholders(blog: Blog | null): Blog | null;
function normalizeBlogPlaceholders(blog: Blog | null): Blog | null {
  if (!blog || !blog.content) return blog;
  return { ...blog, content: normalizeMarkdownImages(blog.content) };
}

// ─── Small layout helpers ──────────────────────────────────────────────────

function Divider() {
  return <div className="h-px mx-4 bg-border-subtle opacity-70" />;
}

function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-semibold uppercase tracking-[0.8px] text-text-tertiary mb-1.5" style={MONO}>
      {children}
    </p>
  );
}

// ─── Page component ────────────────────────────────────────────────────────

export default function BlogViewerPage() {
  const { id: projectId, blogId } = useParams<{ id: string; blogId: string }>();
  const searchParams = useSearchParams();
  const fromAnalyzeContentPage = searchParams.get("from") === BLOG_VIEW_FROM_ANALYZE_CONTENT;
  const queryClient = useQueryClient();

  // ── Data fetching ──────────────────────────────────────────────────────
  const [blog, setBlog]       = useState<Blog | null>(null);
  const [project, setProject] = useState<Project | null>(null);

  const { data: blogQueryRes,     isLoading: blogQueryLoading     } = useQuery({
    queryKey: qk.blog(blogId),
    queryFn:  () => blogsApi.getById(blogId),
    enabled:  !!blogId,
    ...DEFAULT_QUERY_OPTIONS,
  });
  const { data: projectQueryRes,  isLoading: projectQueryLoading  } = useProject(projectId);
  const { data: enhancedQueryRes, isLoading: enhancedQueryLoading } = useQuery({
    queryKey: ["blog-enhanced", blogId],
    queryFn:  () => blogsApi.getEnhanced(blogId),
    enabled:  !!blogId,
    ...DEFAULT_QUERY_OPTIONS,
  });

  const loading = (!blog || !project) && (blogQueryLoading || projectQueryLoading || enhancedQueryLoading);

  // ── UI state ───────────────────────────────────────────────────────────
  const [downloading,     setDownloading]     = useState<ExportFormat | null>(null);
  const [regenerating,    setRegenerating]    = useState(false);
  const [copied,          setCopied]          = useState(false);
  const [savingStatus,    setSavingStatus]    = useState(false);
  const [statusError,     setStatusError]     = useState("");
  const [editMode,        setEditMode]        = useState(false);
  const [savingContent,   setSavingContent]   = useState(false);
  const [scoreRefreshing, setScoreRefreshing] = useState(false);
  const [scoreVersion,    setScoreVersion]    = useState(0);
  const [fixingIssue,     setFixingIssue]     = useState<BlogSeoIssueKey | null>(null);
  const [fixError,        setFixError]        = useState("");
  const [editError,       setEditError]       = useState("");
  const [editSessionKey,  setEditSessionKey]  = useState(0);

  // ── Refs ───────────────────────────────────────────────────────────────
  const titleEditorRef     = useRef<HTMLHeadingElement | null>(null);
  const descEditorRef      = useRef<HTMLParagraphElement | null>(null);
  const editorRef          = useRef<HTMLDivElement | null>(null);
  const tiptapBodyRef      = useRef<TipTapBlogEditorRef | null>(null);
  const blogPanelRef       = useRef<HTMLDivElement | null>(null);
  const selectionSnapshotRef = useRef<{ range: Range } | null>(null);
  const fileInputRef       = useRef<HTMLInputElement | null>(null);

  // ── AI rewriter ────────────────────────────────────────────────────────
  const [aiRewriter, setAiRewriter] = useState<{
    open: boolean;
    snapshot: BlogRewriteSelectionSnapshot | null;
  }>({ open: false, snapshot: null });

  // ── Image editing ──────────────────────────────────────────────────────
  const [editingImage,      setEditingImage]      = useState<HTMLImageElement | null>(null);
  const [regeneratingImage, setRegeneratingImage] = useState(false);

  // ── Content analysis ───────────────────────────────────────────────────
  const [analysisModalOpen,  setAnalysisModalOpen]  = useState(false);
  const [analysisLoading,    setAnalysisLoading]    = useState(false);
  const [analysisReanalysing,setAnalysisReanalysing]= useState(false);
  const [analysisError,      setAnalysisError]      = useState("");
  const [contentAnalysis,    setContentAnalysis]    = useState<BlogContentAnalysis | null>(null);
  const [analysisSnapshotAt, setAnalysisSnapshotAt] = useState<string | null>(null);
  const [analysisEnhancing,  setAnalysisEnhancing]  = useState(false);
  const [analysisScheduling, setAnalysisScheduling] = useState(false);

  // ── Deep analysis ──────────────────────────────────────────────────────
  const [deepModalOpen,   setDeepModalOpen]   = useState(false);
  const [deepLoading,     setDeepLoading]     = useState(false);
  const [deepRunningAgain,setDeepRunningAgain]= useState(false);
  const [deepStage,       setDeepStage]       = useState(0);
  const [deepError,       setDeepError]       = useState("");
  const [deepAnalysis,    setDeepAnalysis]    = useState<BlogDeepAnalysisResult | null>(null);

  // ── Calendar / scheduling ──────────────────────────────────────────────
  const [calendarEntries,  setCalendarEntries]  = useState<CalendarEntry[]>([]);
  const [scheduling,       setScheduling]       = useState(false);
  const [scheduleVersion,  setScheduleVersion]  = useState(0);

  // ── Before / After comparison ──────────────────────────────────────────
  const [enhancedBlog,      setEnhancedBlog]      = useState<Blog | null>(null);
  const [compareView,       setCompareView]       = useState<"before" | "after">("before");
  const isAfterView = compareView === "after" && enhancedBlog !== null;

  const [beforeDeepEnhance, setBeforeDeepEnhance] = useState<{
    title: string; metaDescription: string; content: string;
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
  const [deepEnhancing,   setDeepEnhancing]   = useState(false);

  const isDeepBefore = deepCompareView === "before" && beforeDeepEnhance !== null;

  // ── Derived display blog ───────────────────────────────────────────────
  const displayBlog: Blog | null = isDeepBefore
    ? (blog ? { ...blog, title: beforeDeepEnhance!.title, meta_description: beforeDeepEnhance!.metaDescription, content: beforeDeepEnhance!.content } : null)
    : (isAfterView ? enhancedBlog : blog);

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
    () => reclassifyBlogLinkSidebarLists(
      displayBlog?.external_links ?? [],
      displayBlog?.internal_links ?? [],
      project?.domain
    ),
    [displayBlog?.external_links, displayBlog?.internal_links, project?.domain]
  );

  // ── Effects ─────────────────────────────────────────────────────────────
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
        window.history.replaceState(
          null, "",
          `/projects/${projectId}/content-generator/blogs/${blogQueryRes.data.id}${window.location.search}`
        );
      }
    }
  }, [blogQueryRes, blogId, projectId]);

  useEffect(() => {
    if (projectQueryRes?.success && projectQueryRes.data) setProject(projectQueryRes.data);
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

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    calendarApi.entries(projectId).then(r => {
      if (cancelled) return;
      if (r.success) setCalendarEntries(r.data);
    });
    return () => { cancelled = true; };
  }, [projectId, scheduleVersion]);

  // ── Derived calendar values ────────────────────────────────────────────
  const scheduledDatesSet = useMemo(
    () => new Set(calendarEntries.map(e => String(e.scheduled_date).slice(0, 10))),
    [calendarEntries]
  );

  const nextVacantDate = useMemo(() => {
    const taken = new Set(calendarEntries.map(e => String(e.scheduled_date).slice(0, 10)));
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    for (let i = 0; i < 500; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!taken.has(key)) return key;
    }
    return null;
  }, [calendarEntries]);

  // ── Image handlers ─────────────────────────────────────────────────────
  const handleImageUpload = (img: HTMLImageElement) => {
    setEditingImage(img);
    fileInputRef.current?.click();
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingImage) return;
    const reader = new FileReader();
    reader.onload = event => {
      const base64 = event.target?.result as string;
      if (base64) tiptapBodyRef.current?.updateImageAtDom?.(editingImage, base64);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setEditingImage(null);
  };

  const handleImageRegenerate = async (img: HTMLImageElement) => {
    if (!displayBlog) return;
    setRegeneratingImage(true);
    try {
      const res = await blogsApi.regenerateImage(displayBlog.id, {
        imageAlt: img.alt, contextBefore: "", contextAfter: "",
      });
      if (res.success && res.data) {
        tiptapBodyRef.current?.updateImageAtDom?.(img, res.data.url, res.data.alt);
      } else {
        setEditError(res.error ?? "Failed to regenerate image");
      }
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Failed to regenerate image");
    } finally {
      setRegeneratingImage(false);
    }
  };

  const handleImageRemove = (img: HTMLImageElement) => {
    tiptapBodyRef.current?.deleteImageAtDom?.(img);
  };

  const getEditRoots = useCallback(
    () => [titleEditorRef.current, descEditorRef.current, editorRef.current],
    []
  );

  // ── Analysis handlers ──────────────────────────────────────────────────
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
    if (contentAnalysis && !analysisIsStale) return;
    await runAnalysis();
  };

  const runDeepAnalysis = useCallback(async (opts?: { force?: boolean }) => {
    const force = Boolean(opts?.force);
    if (force) { setDeepRunningAgain(true); setDeepAnalysis(null); }
    else        { setDeepLoading(true); }
    setDeepError("");
    setDeepStage(0);

    const stageTimer = window.setInterval(() => {
      setDeepStage(s => Math.min(s + 1, 3));
    }, 14_000);

    try {
      const res = await blogsApi.runDeepAnalysis(blog?.id || blogId, { force });
      if (res.success) {
        setDeepAnalysis(res.data);
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
  }, [blogId]);

  const openDeepAnalysisModal = useCallback(async () => {
    setDeepModalOpen(true);
    setDeepError("");
    if (deepAnalysis && !deepRunningAgain && !deepLoading) return;
    try {
      const cached = await blogsApi.getDeepAnalysis(blog?.id || blogId);
      if (cached.cached && cached.data) { setDeepAnalysis(cached.data); return; }
    } catch { /* run fresh below */ }
    await runDeepAnalysis();
  }, [blog?.id, blogId, deepAnalysis, deepLoading, deepRunningAgain, runDeepAnalysis]);

  const handleAnalysisEnhanced = async () => {
    if (!blog || !contentAnalysis) return;
    setAnalysisEnhancing(true);
    try {
      const { repairBlogFromContent } = await import("@/app/actions/repair-actions");
      const res = await repairBlogFromContent(blog.id, contentAnalysis);
      if (!res.success || !res.data?.blogId) {
        toast.error(!res.success ? res.error : "Could not generate enhanced version."); return;
      }
      const enhancedRes = await blogsApi.getById(res.data.blogId);
      if (!enhancedRes.success || !enhancedRes.data) {
        toast.error(enhancedRes.error || "Enhanced blog generated but could not be loaded."); return;
      }
      setEnhancedBlog(normalizeBlogPlaceholders(enhancedRes.data));
      setCompareView("after");
      setAnalysisModalOpen(false);
      toast.success("Enhanced version ready — viewing After.");
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
      const res = await blogsApi.enhance(projectId, blog.id, { deepAnalysisResult: deepAnalysis, seoIssues });
      if (!res.success) { toast.error(res.error || "Could not generate enhanced version."); return; }

      if (res.warning) toast(res.warning, { icon: "⚠️", duration: 8000 });
      else toast.success("Enhanced version generated!");

      const result = res.data;
      if (result) {
        setBeforeDeepEnhance({ title: blog.title, metaDescription: blog.meta_description || "", content: blog.content });
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
        keyword, title: blog.title, writerNotes: `Content analysis repair for: ${blog.title}`,
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

  // ── Schedule handler ───────────────────────────────────────────────────
  const handleScheduleBlog = async (date: string) => {
    if (!blog) return;
    setScheduling(true);
    try {
      const res = await calendarApi.scheduleExistingBlog(projectId, {
        blogId: blog.id, targetDate: date, source: "Instant Article",
      });
      if (res.success) {
        const niceDate = new Date(`${res.scheduled_date}T00:00:00`).toLocaleDateString("en-US", {
          month: "long", day: "numeric", year: "numeric",
        });
        toast.success(res.rescheduled ? `Moved to ${niceDate}.` : `Scheduled for ${niceDate}.`);
        setBlog(b => {
          const nextVal = b ? { ...b, entry_id: res.data.id } : b;
          if (nextVal) queryClient.setQueryData(qk.blog(blogId), { success: true, data: nextVal });
          return nextVal;
        });
        setScheduleVersion(v => v + 1);
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
    }
  };

  const handleDirectSchedule = async () => {
    if (!nextVacantDate) { toast.error("No free calendar dates found"); return; }
    await handleScheduleBlog(nextVacantDate);
  };

  // ── Export handler ─────────────────────────────────────────────────────
  const handleDownload = async (format: ExportFormat) => {
    if (!displayBlog) return;
    setDownloading(format);
    const projectMeta = project
      ? { domain: project.domain ?? undefined, company: project.company ?? undefined }
      : undefined;
    try {
      let blob: Blob;
      if (format === "markdown")     blob = exportToMarkdown(displayBlog, projectMeta);
      else if (format === "html")    blob = exportToHTML(displayBlog, projectMeta);
      else if (format === "txt")     blob = exportToText(displayBlog);
      else                           blob = await exportToDocx(displayBlog);
      triggerBlogDownload(blob, displayBlog, format);
    } catch (e) {
      console.error("[blog] download failed", e);
    } finally {
      setDownloading(null);
    }
  };

  // ── Edit mode handlers ─────────────────────────────────────────────────
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
        const normalized = normalizeBlogPlaceholders(res.data);
        setBlog(normalized);
        queryClient.setQueryData(qk.blog(blogId), { success: true, data: normalized });
      } else {
        setEditError(!res.success ? (res.error || "Failed to generate blog.") : "Failed to generate blog.");
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

  const startEditing = () => {
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
    if (tiptapBodyRef.current) {
      const ok = tiptapBodyRef.current.replaceSelection(rewritten.trim());
      if (ok) {
        setAiRewriter({ open: false, snapshot: null });
        selectionSnapshotRef.current = null;
        setEditError("");
        return;
      }
    }
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
      if (end) { range.setStartAfter(end); range.collapse(true); }
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

  // ── Loading / not-found states ─────────────────────────────────────────
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
        <ProjectNavLink
          href={`/projects/${projectId}/content-generator/blogs`}
          className="text-[14px] font-medium underline underline-offset-2"
          style={{ color: V.action }}
        >
          ← Back to Blogs
        </ProjectNavLink>
      </div>
    );
  }

  // ── Resolved display target ────────────────────────────────────────────
  const currentBlog: Blog = isDeepBefore
    ? { ...blog, title: beforeDeepEnhance!.title, meta_description: beforeDeepEnhance!.metaDescription, content: beforeDeepEnhance!.content }
    : (isAfterView && enhancedBlog ? enhancedBlog : blog);

  const hasSavedDeepAnalysis =
    Boolean(deepAnalysis) ||
    (typeof currentBlog.deep_analysis_score === "number" && currentBlog.deep_analysis_score >= 0);

  const deepScoreDisplay =
    deepAnalysis?.deepAnalysisScore ??
    (typeof currentBlog.deep_analysis_score === "number" ? currentBlog.deep_analysis_score : null);

  const researchSources  = currentBlog.research_sources ?? 0;
  const blogStatus       = asBlogStatus(currentBlog.status);
  const statusInfo       = BLOG_STATUSES.find(s => s.value === blogStatus)!;
  const sidebarMuted     = editMode || savingContent || scoreRefreshing;
  const isInstantArticle = Boolean(blog.article_type?.startsWith("Instant ·"));
  const isImport         = blog.article_type === "Import";
  const isRepair         = blog.article_type === "Repair";

  const historyParentHref = isInstantArticle
    ? `/projects/${projectId}/content-generator/history`
    : (isImport || isRepair)
    ? `/projects/${projectId}/audit/import`
    : `/projects/${projectId}/content-generator/blogs`;
  const historyParentLabel = isInstantArticle
    ? "Content history"
    : (isImport || isRepair)
    ? "Content Analyzer"
    : "Blogs";

  // ── Render: breadcrumb ─────────────────────────────────────────────────
  const breadcrumb = (
    <div className="shrink-0 space-y-2">
      <StudioBreadcrumb parentHref={historyParentHref} parentLabel={historyParentLabel} current={blog.title} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <PageTitle>Blog Post</PageTitle>
          <p className="mt-2 text-[13px] leading-relaxed text-text-tertiary">
            Search engine optimized article — high-quality layout, metadata, formatting, SEO scores, and exports.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ContentTypeBadge type="Blog Post" />
        {blog.target_keyword ? <MetricPill label="primary keyword" value={blog.target_keyword} /> : null}
        <MetricPill label="words" value={blog.word_count.toLocaleString()} />
        {researchSources > 0 ? <MetricPill tone="action" label="live sources" value={researchSources} /> : null}
        {externalLinks.length > 0 ? <MetricPill tone="action" label="citations" value={externalLinks.length} /> : null}
        {internalLinks.length > 0 ? <MetricPill tone="coral" label="internal links" value={internalLinks.length} /> : null}
      </div>
      {blog.source_url && blog.article_type === "Repair" && (
        <RepairBanner sourceUrl={blog.source_url} repairNotes={blog.repair_notes ?? []} projectId={projectId} />
      )}
      {blog.article_type === "Import" && (
        <div className="rounded-[8px] px-4 py-3 border border-border-subtle bg-surface-secondary">
          <p className="text-[10px] font-medium uppercase text-text-tertiary mb-1" style={MONO}>Imported draft</p>
          <p className="text-[13px] text-text-secondary leading-relaxed">
            This article was uploaded from Content Health → Analyze upload. Preview, SEO score, edits, selection AI, and exports work the same as generated posts.
          </p>
        </div>
      )}
    </div>
  );

  // ── Render: toolbar ────────────────────────────────────────────────────
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
          <button
            type="button"
            onClick={saveEditing}
            disabled={savingContent}
            className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-medium disabled:opacity-60"
            style={{ background: V.txt, color: V.bg }}
          >
            {savingContent ? <><SpinIcon />&nbsp;Saving…</> : "Save edits"}
          </button>
          <button
            type="button"
            onClick={cancelEditing}
            disabled={savingContent}
            className="rounded-full px-4 py-1.5 text-[12px] font-medium border border-border-subtle text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className="rounded-full px-4 py-1.5 text-[12px] font-medium transition-all"
          style={{ background: V.txt, color: V.bg }}
        >
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
      <button
        onClick={handleCopy}
        disabled={editMode}
        className="rounded-full px-4 py-1.5 text-[12px] font-medium border border-border-subtle text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {copied ? "Copied!" : "Copy MD"}
      </button>
    </div>
  );

  // ── Render: sidebar ────────────────────────────────────────────────────
  const sidebar = (
    <>
      {/* Before / After compare (analysis-enhanced) */}
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

      {/* Content Analysis — only shown when opened from Analyze Content page */}
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

      {/* Deep compare pill (deep-enhance) */}
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

      {/* Deep Analysis button */}
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

      {/* SEO Score */}
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
      {fixError && <div className="px-4 pb-3"><p className="text-[10px] text-rose-500">{fixError}</p></div>}

      {/* Editorial metadata */}
      <Divider />
      <div className="px-4 pt-3.5 pb-1">
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

        <div className="mb-3.5">
          <SLabel>Target Keyword</SLabel>
          <p className="text-[13px] font-semibold text-text-primary leading-snug">{currentBlog.target_keyword}</p>
        </div>

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

      {/* Meta description */}
      <Divider />
      <div className="px-4 py-3.5">
        <div className="flex items-center justify-between mb-1.5">
          <SLabel>Meta Description</SLabel>
          <span
            className="text-[9px] font-semibold tabular-nums rounded-full px-1.5 py-0.5"
            style={{
              background: currentBlog.meta_description.length >= 140 && currentBlog.meta_description.length <= 165 ? "#16a34a18" : "#b91c1c14",
              color:      currentBlog.meta_description.length >= 140 && currentBlog.meta_description.length <= 165 ? "#16a34a"   : "#b91c1c",
            }}
          >
            {currentBlog.meta_description.length}/160
          </span>
        </div>
        <p className="text-[11px] text-text-tertiary leading-relaxed">{currentBlog.meta_description}</p>
      </div>

      {/* Links */}
      {(externalLinks.length > 0 || internalLinks.length > 0) && (
        <>
          <Divider />
          <div className="px-4 py-3.5 space-y-3">
            {externalLinks.length > 0 && (
              <div>
                <SLabel>External links ({externalLinks.length})</SLabel>
                <div className="space-y-1">
                  {externalLinks.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11px] hover:underline truncate"
                      style={{ color: V.action }} title={url}>
                      <ExternalLinkIcon className="w-3 h-3 shrink-0" />
                      <span className="truncate">{url}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
            {internalLinks.length > 0 && (
              <div>
                <SLabel>Internal links ({internalLinks.length})</SLabel>
                <div className="space-y-0.5">
                  {internalLinks.map((path, i) => {
                    const fullUrl = path.startsWith("/") && project?.domain ? `https://${project.domain}${path}` : path;
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

      {/* Schedule */}
      <Divider />
      <div className="px-4 py-3.5">
        <PreviewerScheduler
          projectId={projectId}
          blogId={blog.id}
          entryId={blog.entry_id}
          onScheduleUpdated={newId => {
            setBlog(b => {
              const nextVal = b ? { ...b, entry_id: newId } : b;
              if (nextVal) queryClient.setQueryData(qk.blog(blogId), { success: true, data: nextVal });
              return nextVal;
            });
            setScheduleVersion(v => v + 1);
          }}
        />
      </div>

      {/* Export */}
      <Divider />
      <div className="px-4 py-3.5">
        <SLabel>Export</SLabel>
        <div className="grid grid-cols-2 gap-1.5">
          {FORMATS.map(fmt => (
            <button
              key={fmt.key}
              onClick={() => handleDownload(fmt.key)}
              disabled={downloading === fmt.key}
              className="flex items-center justify-between rounded-[6px] px-3 py-2 text-[11px] font-medium transition-all disabled:opacity-50 border border-border-subtle bg-surface-tertiary text-text-tertiary hover:text-text-primary hover:border-border-default"
            >
              <span style={MONO}>{fmt.ext}</span>
              {downloading === fmt.key ? <SpinIcon className="w-3 h-3" /> : <DownloadIcon className="w-3 h-3" />}
            </button>
          ))}
        </div>
      </div>

      {/* Generate (calendar-based) */}
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

  // ── Render: main return ────────────────────────────────────────────────
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

          {/* Deep enhancement result banner */}
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
                        {deepEnhancedResult.appliedFixes.map((fix, idx) => <li key={idx}>{fix}</li>)}
                      </ul>
                    </div>
                  )}
                  {deepEnhancedResult.unresolvedIssues?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Unresolved / Needs Manual Work</p>
                      <ul className="list-inside list-disc space-y-0.5 text-[12px] text-text-tertiary">
                        {deepEnhancedResult.unresolvedIssues.map((issue, idx) => <li key={idx}>{issue}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Blog content */}
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
                    initialMarkdown={currentBlog.content.replace(/^\s*#\s+.+\n+/, "")}
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

      {/* AI edit overlays */}
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

      {/* Modals */}
      <Suspense fallback={null}>
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
      </Suspense>
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
        contentType="Blog Post"
        contentPart={
          typeof document !== "undefined"
            ? document.activeElement === titleEditorRef.current
              ? "Blog Title"
              : document.activeElement === descEditorRef.current
              ? "Meta Description"
              : "Blog Body"
            : "Blog Body"
        }
        surroundingContext={currentBlog.content}
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
