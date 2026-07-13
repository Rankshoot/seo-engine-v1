"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, useProject, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { Button, PageTitle, Spinner } from "@/components/common";
import {
  ContentTypeBadge,
  ExportMenu,
  MetricPill,
  PreviewShell,
  ResourcesPanel,
  StudioBreadcrumb,
  ViewModePill,
  WhitepaperScorePanel,
  PreviewerScheduler,
  type PreviewMode,
} from "@/components/content-generator/shared";
import { WhitepaperReader } from "@/components/content-generator/whitepaper/WhitepaperReader";
import type { TipTapBlogEditorRef } from "@/components/content-generator/shared/TipTapBlogEditor";
import { InlineAiEditOverlay } from "@/components/content-generator/shared/InlineAiEditOverlay";
import { AiEditPanel } from "@/components/content-generator/shared/AiEditPanel";
import { blogsApi } from "@/frontend/api/blogs";
import { calendarApi } from "@/frontend/api/calendar";
import { exportWhitepaper, WHITEPAPER_EXPORT_OPTIONS } from "@/lib/content-exports";
import { normalizeSiteHost } from "@/lib/blog-content";
import type { StudioBrand } from "@/lib/studio-brand";
import type { Blog, Project, WhitepaperContentData } from "@/lib/types";
import type { BlogRewriteSelectionSnapshot } from "@/lib/blog-editor-rewrite-selection";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function clearAllDomHighlights() {
  if (typeof document === "undefined") return;
  const highlights = document.querySelectorAll("mark.ai-rewrite-highlight");
  highlights.forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
    }
  });
}

const MONO_LABEL = { fontFamily: "CohereMono, monospace", letterSpacing: "0.28px" } as const;

export default function WhitepaperViewerPage() {
  const { id: projectId, whitepaperId } = useParams<{ id: string; whitepaperId: string }>();
  const queryClient = useQueryClient();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [project, setProject] = useState<Project | null>(null);

  const { data: blogRes, isLoading: blogLoading } = useQuery({
    queryKey: qk.blog(whitepaperId),
    queryFn: () => blogsApi.getById(whitepaperId),
    enabled: !!whitepaperId,
    ...DEFAULT_QUERY_OPTIONS,
  });

  const { data: projectRes, isLoading: projectLoading } = useProject(projectId);

  const loading = (!blog || !project) && (blogLoading || projectLoading);

  useEffect(() => {
    if (blogRes?.success && blogRes.data) {
      setBlog(blogRes.data);
    }
  }, [blogRes]);

  useEffect(() => {
    if (projectRes?.success && projectRes.data) {
      setProject(projectRes.data);
    }
  }, [projectRes]);

  const [mode, setMode] = useState<PreviewMode>("preview");
  const [editSessionKey, setEditSessionKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  // AI inline edit state
  const [aiEdit, setAiEdit] = useState<{ open: boolean; snapshot: BlogRewriteSelectionSnapshot | null }>({
    open: false,
    snapshot: null,
  });
  const selectionSnapshotRef = useRef<{ range: Range } | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const getEditorRoots = useCallback(() => [editorContainerRef.current], []);

  useEffect(() => {
    if (mode !== "edit") {
      setAiEdit({ open: false, snapshot: null });
      selectionSnapshotRef.current = null;
    }
  }, [mode]);

  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (!aiEdit.open) return;
      const target = e.target as HTMLElement;
      const isInsideSidebar = target.closest(".ai-edit-panel") || target.closest("[data-ai-panel]");
      if (isInsideSidebar) return;
      if (target.textContent?.includes("Edit with AI")) return;
      
      clearAllDomHighlights();
      tiptapRef.current?.clearHighlight();
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
    };
  }, [aiEdit.open]);

  const handleDirectSchedule = async () => {
    if (!projectId || !blog || scheduling) return;
    setScheduling(true);
    try {
      const entriesRes = await calendarApi.entries(projectId);
      if (!entriesRes.success || !entriesRes.data) {
        toast.error("Could not fetch calendar dates");
        return;
      }
      const taken = new Set(entriesRes.data.map(e => String(e.scheduled_date).slice(0, 10)));
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      let targetDate = "";
      for (let i = 0; i < 500; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (!taken.has(key)) {
          targetDate = key;
          break;
        }
      }
      if (!targetDate) {
        toast.error("No free calendar dates found");
        return;
      }
      const res = await calendarApi.scheduleExistingBlog(projectId, {
        blogId: blog.id,
        targetDate,
      });
      if (res.success) {
        const niceDate = new Date(`${res.scheduled_date}T00:00:00`).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
        toast.success(`Scheduled for ${niceDate}`);
        const updatedBlog = { ...blog, entry_id: res.data.id };
        setBlog(updatedBlog);
        queryClient.setQueryData(qk.blog(blog.id), { success: true, data: updatedBlog });
        void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.contentGeneratorHistory(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) });
      } else {
        toast.error(res.error || "Failed to schedule");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to schedule");
    } finally {
      setScheduling(false);
    }
  };

  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const descRef = useRef<HTMLParagraphElement | null>(null);
  const tiptapRef = useRef<TipTapBlogEditorRef | null>(null);

  const ownSiteHost = useMemo(
    () => (project?.domain ? normalizeSiteHost(project.domain) : null),
    [project?.domain],
  );

  const studioBrand: StudioBrand | null = useMemo(() => {
    if (!project?.company?.trim() || !project?.domain?.trim()) return null;
    return { company: project.company.trim(), domain: project.domain.trim() };
  }, [project?.company, project?.domain]);

  const handleAiRewriterInsert = useCallback((rewritten: string) => {
    clearAllDomHighlights();
    if (tiptapRef.current) {
      const ok = tiptapRef.current.replaceSelection(rewritten.trim());
      if (ok) {
        setAiEdit({ open: false, snapshot: null });
        selectionSnapshotRef.current = null;
        return;
      }
    }

    // Fallback: replace selection in DOM range (for contentEditable fields like Cover Title/Subtitle)
    const snap = selectionSnapshotRef.current;
    if (snap?.range) {
      try {
        const range = snap.range.cloneRange();
        if (document.contains(range.startContainer)) {
          range.deleteContents();
          const mark = document.createElement("mark");
          mark.className = "ai-rewrite-highlight";
          mark.style.backgroundColor = "rgba(234, 179, 8, 0.25)";
          mark.style.borderBottom = "2px solid var(--brand-action)";
          mark.appendChild(document.createTextNode(rewritten.trim()));
          range.insertNode(mark);

          const end = mark.lastChild;
          if (end) {
            range.setStartAfter(end);
            range.collapse(true);
          }
          const s = window.getSelection();
          s?.removeAllRanges();
          s?.addRange(range);
          selectionSnapshotRef.current = null;
          setAiEdit({ open: false, snapshot: null });
          toast.success("AI edit applied.");
          return;
        }
      } catch (e) {
        console.error("DOM fallback insert failed", e);
      }
    }

    toast.error("Couldn't apply rewrite — select text again.");
    setAiEdit({ open: false, snapshot: null });
  }, []);

  const studioBase = `/projects/${projectId}/content-generator`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Spinner size={28} />
          <p className="text-[12px] text-text-tertiary">Loading whitepaper…</p>
        </div>
      </div>
    );
  }

  if (!blog) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="mb-4 text-[14px] text-text-tertiary">Whitepaper not found.</p>
        <ProjectNavLink
          href={`/projects/${projectId}/content-generator/whitepapers`}
          className="text-[14px] font-medium underline underline-offset-2 text-brand-action"
        >
          ← Back to Whitepapers
        </ProjectNavLink>
      </div>
    );
  }

  const data = (blog.content_data ?? {}) as WhitepaperContentData;

  const startEdit = () => {
    setEditSessionKey(k => k + 1);
    setMode("edit");
  };
  const cancelEdit = () => setMode("preview");

  const saveEdit = async () => {
    if (!tiptapRef.current) return;
    setSaving(true);
    try {
      const bodyMd = tiptapRef.current.getMarkdown().replace(/\n{3,}/g, "\n\n").trim();
      const title = titleRef.current?.textContent?.trim() || blog.title;
      const metaDescription =
        descRef.current?.textContent?.replace(/\s+/g, " ").trim() || blog.meta_description;
      const md = `# ${title}\n\n${bodyMd}`.replace(/\n{3,}/g, "\n\n").trim();
      const res = await blogsApi.updateContent(blog.id, { content: md, title, metaDescription });
      if (res.success && res.data) {
        const updatedBlog = { ...res.data, content_data: blog.content_data };
        setBlog(updatedBlog);
        queryClient.setQueryData(qk.blog(blog.id), { success: true, data: updatedBlog });
        setMode("preview");
        toast.success("Saved.");
      } else {
        toast.error(res.error ?? "Could not save");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const breadcrumb = (
    <div className="shrink-0 space-y-2">
      <StudioBreadcrumb parentHref={`${studioBase}/whitepapers`} parentLabel="Whitepapers" current={blog.title} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <PageTitle>Whitepaper</PageTitle>
          <p className="mt-2 text-[13px] leading-relaxed text-text-tertiary">
            Branded research document — executive summary callout, numbered sections, and a
            references list. Export to PDF, Word, or paste the executive summary into a board pack.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ContentTypeBadge type="Whitepaper" />
        {blog.target_keyword ? <MetricPill label="primary keyword" value={blog.target_keyword} /> : null}
        <MetricPill label="words" value={blog.word_count.toLocaleString()} />
        <MetricPill label="sections" value={data.sections?.length ?? 0} />
        {blog.research_sources > 0 ? (
          <MetricPill tone="action" label="live sources" value={blog.research_sources} />
        ) : null}
        {blog.external_links?.length ? (
          <MetricPill tone="action" label="citations" value={blog.external_links.length} />
        ) : null}
      </div>
    </div>
  );

  const sidebar = (
    <>
      <div className="px-4 pt-4 pb-3 border-b border-border-subtle">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary" style={MONO_LABEL}>
          Cover
        </p>
        <p className="mt-1 text-[14px] font-semibold text-text-primary leading-snug">{data.cover_title || blog.title}</p>
        {data.cover_subtitle ? (
          <p className="mt-1.5 text-[11px] text-text-tertiary leading-relaxed">{data.cover_subtitle}</p>
        ) : null}
      </div>

      <WhitepaperScorePanel blog={blog} className="px-4 py-4 bg-transparent border-0 border-b border-border-subtle" />

      {data.sections?.length ? (
        <div className="border-b border-border-subtle px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-2" style={MONO_LABEL}>
            Sections
          </p>
          <ol className="space-y-1.5">
            {data.sections.map(s => (
              <li key={s.number} className="flex gap-2 text-[12px] text-text-secondary">
                <span className="font-mono text-[10px] tabular-nums text-text-tertiary shrink-0">
                  {String(s.number).padStart(2, "0")}
                </span>
                <span className="leading-snug">{s.title}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {data.recommendations?.length ? (
        <div className="border-b border-border-subtle px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-2" style={MONO_LABEL}>
            Recommendations
          </p>
          <ul className="space-y-2">
            {data.recommendations.slice(0, 6).map((r, i) => (
              <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-text-secondary">
                <span className="font-mono text-[10px] tabular-nums text-brand-action shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ResourcesPanel
        blog={blog}
        projectDomain={project?.domain}
        className="border-b border-border-subtle px-4 py-4"
      />

      <div className="border-b border-border-subtle px-4 py-4">
        <PreviewerScheduler
          projectId={projectId}
          blogId={blog.id}
          entryId={blog.entry_id}
          onScheduleUpdated={(newId) => {
            setBlog((prev) => (prev ? { ...prev, entry_id: newId } : prev));
            void queryClient.invalidateQueries({ queryKey: qk.blog(blog.id) });
          }}
        />
      </div>

      <ExportMenu
        className="px-4 py-4"
        title="Export"
        options={WHITEPAPER_EXPORT_OPTIONS}
        onExport={fmt => exportWhitepaper(blog, fmt, project ? { domain: project.domain, company: project.company } : undefined)}
        copyActions={
          data.executive_summary
            ? [
                {
                  label: "Copy executive summary",
                  hint: "Paste into Slides, briefs, board pack",
                  getText: () => data.executive_summary ?? "",
                },
              ]
            : undefined
        }
      />
    </>
  );

  const toolbarLeft = (
    <div className="flex items-center gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary px-2 py-0.5 rounded border border-border-subtle bg-surface-secondary">
        Whitepaper
      </span>
    </div>
  );

  const toolbarRight =
    mode === "edit" ? (
      <>
        <Button variant="secondary" shape="pill" size="sm" onClick={cancelEdit} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" shape="pill" size="sm" onClick={() => void saveEdit()} loading={saving}>
          Save edits
        </Button>
      </>
    ) : (
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          shape="pill"
          size="sm"
          onClick={startEdit}
        >
          Edit
        </Button>
        {!blog.entry_id && (
          <Button
            variant="primary"
            shape="pill"
            size="sm"
            onClick={() => void handleDirectSchedule()}
            loading={scheduling}
          >
            Schedule
          </Button>
        )}
      </div>
    );

  return (
    <PreviewShell
      header={breadcrumb}
      toolbarLeft={toolbarLeft}
      toolbarRight={toolbarRight}
      sidebar={sidebar}
      sidePanel={
        mode === "edit" ? (
          <AiEditPanel
            blogId={blog.id}
            projectDomain={project?.domain ?? ""}
            selection={aiEdit.snapshot}
            contentType="Whitepaper"
            contentPart={
              typeof document !== "undefined"
                ? document.activeElement === titleRef.current
                  ? "Cover Title"
                  : document.activeElement === descRef.current
                  ? "Cover Subtitle"
                  : "Whitepaper Body"
                : "Whitepaper Body"
            }
            surroundingContext={blog.content}
            renderMarkdownSnippet={md => (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
            )}
            onDiscard={() => {
              setAiEdit({ open: false, snapshot: null });
              selectionSnapshotRef.current = null;
              clearAllDomHighlights();
              tiptapRef.current?.clearHighlight();
            }}
            onInsert={handleAiRewriterInsert}
          />
        ) : null
      }
      sidebarWidthPx={320}
      framedCanvas={false}
      toolbarInsideCanvas
      immersiveFullscreen
    >
      <WhitepaperReader
        blog={blog}
        ownSiteHost={ownSiteHost}
        mode={mode}
        brand={studioBrand}
        companyName={project?.company}
        titleRef={titleRef}
        descRef={descRef}
        tiptapRef={tiptapRef}
        editSessionKey={editSessionKey}
        editorContainerRef={editorContainerRef}
      />
      <InlineAiEditOverlay
        active={mode === "edit"}
        getRoots={getEditorRoots}
        onOpen={({ snapshot, range }) => {
          setAiEdit({ open: true, snapshot });
          if (range) selectionSnapshotRef.current = { range };
          clearAllDomHighlights();
          tiptapRef.current?.setHighlightCurrentSelection();
          
          const active = document.activeElement;
          if (range && (active === titleRef.current || active === descRef.current)) {
            try {
              const mark = document.createElement("mark");
              mark.className = "ai-rewrite-highlight";
              mark.style.backgroundColor = "rgba(234, 179, 8, 0.25)";
              mark.style.borderBottom = "2px solid var(--brand-action)";
              range.surroundContents(mark);
            } catch (e) {
              console.warn("Could not wrap DOM range:", e);
            }
          }
        }}
      />
    </PreviewShell>
  );
}
