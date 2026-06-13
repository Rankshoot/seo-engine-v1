"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, useProject, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { Button, PageTitle, Spinner } from "@/components/common";
import {
  ContentTypeBadge,
  ExportMenu,
  LinkedInScorePanel,
  MetricPill,
  PreviewShell,
  ResourcesPanel,
  StudioBreadcrumb,
  ViewModePill,
  PreviewerScheduler,
  type PreviewMode,
} from "@/components/content-generator/shared";
import { LinkedInFeedCard } from "@/components/content-generator/linkedin/LinkedInFeedCard";
import { InlineAiEditOverlay } from "@/components/content-generator/shared/InlineAiEditOverlay";
import { BlogAiRewriterModal } from "@/components/BlogAiRewriterModal";
import type { BlogRewriteSelectionSnapshot } from "@/lib/blog-editor-rewrite-selection";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  draftFromContentData,
  draftToMarkdown,
  type LinkedInDraft,
} from "@/components/content-generator/linkedin/LinkedInStructuredEditor";
import { blogsApi } from "@/frontend/api/blogs";
import { calendarApi } from "@/frontend/api/calendar";
import {
  exportLinkedInPost,
  LINKEDIN_EXPORT_OPTIONS,
} from "@/lib/content-exports";
import { brandFaviconUrl, displayDomain } from "@/lib/studio-brand";
import type {
  Blog,
  ContentDataPayload,
  LinkedInContentData,
  Project,
} from "@/lib/types";

const MONO_LABEL = { fontFamily: "CohereMono, monospace", letterSpacing: "0.28px" } as const;

export function parseLinkedInMarkdown(markdown: string): LinkedInDraft {
  const lines = markdown.split(/\r?\n/);
  let currentSection: "title" | "hook" | "body" | "cta" | "hashtags" | null = null;
  const sections = {
    hook: [] as string[],
    body: [] as string[],
    cta: [] as string[],
    hashtags: [] as string[],
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (line.startsWith("# ")) {
      currentSection = "title";
      continue;
    }
    if (line.startsWith("## ")) {
      const heading = trimmed.replace(/^##\s+/, "").toLowerCase();
      if (heading.includes("hook")) {
        currentSection = "hook";
      } else if (heading.includes("body") || heading.includes("content")) {
        currentSection = "body";
      } else if (heading.includes("call to action") || heading.includes("cta")) {
        currentSection = "cta";
      } else if (heading.includes("hashtag")) {
        currentSection = "hashtags";
      } else {
        if (currentSection && currentSection !== "title") {
          sections[currentSection].push(line);
        } else {
          currentSection = "body";
          sections.body.push(line);
        }
      }
      continue;
    }

    if (currentSection && currentSection !== "title") {
      sections[currentSection].push(line);
    } else if (!currentSection && trimmed !== "") {
      currentSection = "body";
      sections.body.push(line);
    }
  }

  const hook = sections.hook.join("\n").trim();
  const body = sections.body.join("\n").trim();
  const cta = sections.cta.join("\n").trim();
  const hashtagsRaw = sections.hashtags.join("\n").trim();
  const hashtags = hashtagsRaw
    ? hashtagsRaw
        .split(/[,\s]+/)
        .map(t => t.trim())
        .filter(Boolean)
        .map(t => (t.startsWith("#") ? t : `#${t}`))
    : [];

  return { hook, body, cta, hashtags };
}

export function cleanLinkedInMarkdown(content: string): string {
  if (!content) return content;
  const idx = content.indexOf("> Copy-ready post:");
  if (idx !== -1) {
    return content.slice(0, idx).trim();
  }
  return content.trim();
}

export default function LinkedInViewerPage() {
  const { id: projectId, postId } = useParams<{ id: string; postId: string }>();
  const queryClient = useQueryClient();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [project, setProject] = useState<Project | null>(null);

  const { data: blogRes, isLoading: blogLoading } = useQuery({
    queryKey: qk.blog(postId),
    queryFn: () => blogsApi.getById(postId),
    enabled: !!postId,
    ...DEFAULT_QUERY_OPTIONS,
  });

  const { data: projectRes, isLoading: projectLoading } = useProject(projectId);

  const loading = (!blog || !project) && (blogLoading || projectLoading);

  const [mode, setMode] = useState<PreviewMode>("preview");
  const [draft, setDraft] = useState<LinkedInDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const [aiEdit, setAiEdit] = useState<{
    open: boolean;
    snapshot: BlogRewriteSelectionSnapshot | null;
  }>({ open: false, snapshot: null });

  const textareaSelectionRef = useRef<{
    element: HTMLTextAreaElement | HTMLInputElement;
    start: number;
    end: number;
  } | null>(null);

  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const getEditorRoots = useCallback(() => [editorContainerRef.current], []);

  const handleAiRewriterInsert = useCallback((rewritten: string) => {
    if (textareaSelectionRef.current && draft) {
      const { element, start, end } = textareaSelectionRef.current;
      const placeholder = (element.placeholder || "").toLowerCase();
      let field: "hook" | "body" | "cta" | null = null;
      if (placeholder.includes("hook")) field = "hook";
      else if (placeholder.includes("body")) field = "body";
      else if (placeholder.includes("action") || placeholder.includes("cta")) field = "cta";

      if (field) {
        const val = element.value;
        const nextVal = val.slice(0, start) + rewritten.trim() + val.slice(end);
        setDraft({
          ...draft,
          [field]: nextVal,
        });
        toast.success("AI edit applied.");
      } else {
        toast.error("Could not determine which field to edit.");
      }
    }
    setAiEdit({ open: false, snapshot: null });
    textareaSelectionRef.current = null;
  }, [draft]);

  useEffect(() => {
    if (mode !== "edit") setAiEdit({ open: false, snapshot: null });
  }, [mode]);



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

  useEffect(() => {
    if (blogRes?.success && blogRes.data) {
      const data = blogRes.data;
      const cleanedContent = data.content ? cleanLinkedInMarkdown(data.content) : "";
      const parsedDraft = cleanedContent ? parseLinkedInMarkdown(cleanedContent) : null;
      const enrichedContentData = parsedDraft
        ? {
            ...data.content_data,
            hook: parsedDraft.hook,
            body: parsedDraft.body,
            cta: parsedDraft.cta,
            hashtags: parsedDraft.hashtags,
          }
        : data.content_data;

      const patchedBlog: Blog = {
        ...data,
        content: cleanedContent,
        content_data: enrichedContentData as ContentDataPayload,
      };

      setBlog(patchedBlog);
      setDraft(prev => prev ?? parsedDraft ?? draftFromContentData(patchedBlog.content_data as Partial<LinkedInContentData>));
    }
  }, [blogRes]);

  useEffect(() => {
    if (projectRes?.success && projectRes.data) {
      setProject(projectRes.data);
    }
  }, [projectRes]);

  const studioBase = `/projects/${projectId}/content-generator`;

  const composedPost = useMemo(() => {
    if (!blog) return "";
    const data = mode === "edit" && draft ? draft : (blog.content_data ?? {}) as LinkedInContentData;
    return [data.hook, data.body, data.cta].filter(Boolean).join("\n\n");
  }, [blog, draft, mode]);

  const composedHashtags = useMemo(() => {
    if (!blog) return [];
    const data = mode === "edit" && draft ? draft : (blog.content_data ?? {}) as LinkedInContentData;
    return (data.hashtags ?? []).map(h => (h.startsWith("#") ? h : `#${h}`));
  }, [blog, draft, mode]);

  const charCount = useMemo(() => {
    return [composedPost, composedHashtags.join(" ")].filter(Boolean).join("\n\n").length;
  }, [composedPost, composedHashtags]);

  const featuredImageUrl = useMemo(() => {
    if (!blog) return null;
    const d = (blog.content_data ?? {}) as LinkedInContentData;
    const u = (d.featured_image_url ?? "").trim();
    return u || null;
  }, [blog]);

  const handleGenerateImage = useCallback(async () => {
    if (!blog || !project) return;
    setImageGenerating(true);
    try {
      const res = await blogsApi.regenerateImage(blog.id, {
        imageAlt: `${blog.title} LinkedIn visual`,
        contextBefore: blog.content,
        contextAfter: "",
      });
      if (res.success && res.data) {
        const currentContentData = (blog.content_data ?? {}) as LinkedInContentData;
        const updatedContentData: LinkedInContentData = {
          ...currentContentData,
          featured_image_url: res.data.url,
        };
        const updateRes = await blogsApi.updateContent(blog.id, {
          content: blog.content,
          contentData: updatedContentData,
        });
        if (updateRes.success && updateRes.data) {
          const patched: Blog = {
            ...updateRes.data,
            content_data: updatedContentData as ContentDataPayload,
          };
          setBlog(patched);
          queryClient.setQueryData(qk.blog(blog.id), { success: true, data: patched });
          toast.success("Branded image generated and attached successfully!");
        } else {
          toast.error(updateRes.error ?? "Failed to save generated image attachment");
        }
      } else {
        toast.error(res.error ?? "Failed to generate image");
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to generate image";
      toast.error(message);
    } finally {
      setImageGenerating(false);
    }
  }, [blog, project, queryClient]);



  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Spinner size={28} />
          <p className="text-[12px] text-text-tertiary">Loading post…</p>
        </div>
      </div>
    );
  }

  if (!blog) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="mb-4 text-[14px] text-text-tertiary">LinkedIn post not found.</p>
        <ProjectNavLink
          href={`${studioBase}/linkedin`}
          className="text-[14px] font-medium underline underline-offset-2 text-brand-action"
        >
          ← Back to LinkedIn posts
        </ProjectNavLink>
      </div>
    );
  }

  const data = (blog.content_data ?? {}) as LinkedInContentData;
  const authorName = project?.company || "Your brand";
  const audience = data.audience || project?.target_audience || "Founders & operators";
  const domainHost = project?.domain?.trim() ? displayDomain(project.domain) : "";
  const headline = domainHost ? `${audience} · ${domainHost}` : audience;
  const authorAvatarUrl = project?.domain?.trim() ? brandFaviconUrl(project.domain.trim()) : null;

  const startEdit = () => {
    setDraft(blog.content ? parseLinkedInMarkdown(blog.content) : draftFromContentData(blog.content_data as Partial<LinkedInContentData>));
    setMode("edit");
  };

  const cancelEdit = () => {
    setDraft(blog.content ? parseLinkedInMarkdown(blog.content) : draftFromContentData(blog.content_data as Partial<LinkedInContentData>));
    setMode("preview");
  };

  const saveEdit = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const md = draftToMarkdown(blog.title, draft);
      const updatedContentData: LinkedInContentData = {
        post_style: data.post_style ?? "educational",
        hook: draft.hook,
        body: draft.body,
        cta: draft.cta,
        hashtags: draft.hashtags,
        audience: data.audience ?? "",
        tone: data.tone ?? "",
        primary_keyword: data.primary_keyword ?? blog.target_keyword,
        ...(data.featured_image_url?.trim()
          ? { featured_image_url: data.featured_image_url.trim() }
          : {}),
      };
      const res = await blogsApi.updateContent(blog.id, {
        content: md,
        title: draft.hook || blog.title,
        metaDescription: (draft.body || draft.hook).replace(/\s+/g, " ").slice(0, 160),
        contentData: updatedContentData,
      });
      if (res.success && res.data) {
        const patched: Blog = {
          ...res.data,
          content_data: updatedContentData as ContentDataPayload,
        };
        setBlog(patched);
        queryClient.setQueryData(qk.blog(blog.id), { success: true, data: patched });
        setMode("preview");
        toast.success("Saved.");
      } else {
        toast.error(!res.success ? res.error ?? "Could not save" : "Could not save");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const breadcrumb = (
    <div className="shrink-0 space-y-2">
      <StudioBreadcrumb parentHref={`${studioBase}/linkedin`} parentLabel="LinkedIn posts" current={blog.title} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <PageTitle>LinkedIn post</PageTitle>
          <p className="mt-2 text-[13px] leading-relaxed text-text-tertiary">
            Feed-accurate preview with optional image slot. Use fullscreen for a focused pass; site light/dark
            theme controls the card. Generate image is optional and runs from Preview when wired up.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ContentTypeBadge type="LinkedIn post" />
        {data.post_style ? <MetricPill label="style" value={data.post_style.replace(/_/g, " ")} /> : null}
        <MetricPill
          tone={charCount > 1300 ? "coral" : charCount > 1100 ? "action" : "neutral"}
          label="characters"
          value={charCount}
        />
        <MetricPill label="words" value={blog.word_count.toLocaleString()} />
        {data.tone ? <MetricPill label="tone" value={data.tone} /> : null}
      </div>
    </div>
  );

  const sidebar = (
    <>
      {/* Asset summary */}
      <div className="px-4 pt-4 pb-3 border-b border-border-subtle">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary" style={MONO_LABEL}>
          Asset
        </p>
        <p className="mt-1 text-[14px] font-semibold text-text-primary leading-snug line-clamp-3">
          {blog.title}
        </p>
        <p className="mt-2 text-[11px] text-text-tertiary">
          Published once you click &quot;Copy post&quot; and paste into LinkedIn.
        </p>
      </div>

      {/* LinkedIn-specific score */}
      <LinkedInScorePanel blog={blog} className="px-4 py-4 bg-transparent border-0 border-b border-border-subtle" />

      {/* Hook + CTA + hashtags */}
      <div className="border-b border-border-subtle px-4 py-4 space-y-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary" style={MONO_LABEL}>
            Hook
          </p>
          <p className="mt-1 text-[12px] font-medium text-text-primary leading-snug">
            {data.hook || "—"}
          </p>
        </div>
        <div className="border-t border-border-subtle pt-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary" style={MONO_LABEL}>
            CTA
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">{data.cta || "—"}</p>
        </div>
        {composedHashtags.length > 0 ? (
          <div className="border-t border-border-subtle pt-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1.5" style={MONO_LABEL}>
              Hashtags ({composedHashtags.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {composedHashtags.map((t, idx) => (
                <span
                  key={`${t}-${idx}`}
                  className="rounded-full border border-border-subtle bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-text-secondary"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* AI recommendations */}
      <div className="border-b border-border-subtle px-4 py-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-2" style={MONO_LABEL}>
          AI recommendations
        </p>
        <ul className="space-y-1.5 text-[12px] text-text-secondary">
          {recommendationsFor(data, charCount).map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-brand-action shrink-0" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>

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

      {/* Export */}
      <ExportMenu
        className="px-4 py-4"
        title="Export"
        options={LINKEDIN_EXPORT_OPTIONS}
        onExport={fmt => exportLinkedInPost(blog, fmt)}
        copyActions={[
          {
            label: "Copy post (no hashtags)",
            hint: "Paste straight into LinkedIn",
            getText: () => composedPost,
          },
          {
            label: "Copy with hashtags",
            hint: "Hook · body · CTA · hashtags",
            getText: () =>
              [composedPost, composedHashtags.join(" ")].filter(Boolean).join("\n\n"),
          },
        ]}
      />
    </>
  );

  const toolbarLeft = (
    <div className="flex items-center gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary px-2 py-0.5 rounded border border-border-subtle bg-surface-secondary">
        LinkedIn Post
      </span>
    </div>
  );

  const toolbarRight =
    mode === "edit" ? (
      <>
        <Button variant="secondary" shape="pill" size="sm" onClick={cancelEdit} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          shape="pill"
          size="sm"
          onClick={() => void saveEdit()}
          loading={saving}
        >
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
      sidebarWidthPx={320}
      framedCanvas={false}
      toolbarInsideCanvas
      immersiveFullscreen
      canvasBg="var(--surface-secondary)"
    >
      <div ref={editorContainerRef} className="h-full overflow-y-auto px-3 py-5 sm:px-6 sm:py-8 md:px-8 md:py-10">
        {mode === "edit" && draft ? (
          <div className="mx-auto max-w-[580px] space-y-5">
            <LinkedInFeedCard
              authorName={authorName}
              authorHeadline={headline}
              authorAvatarUrl={authorAvatarUrl}
              postText={[draft.hook, draft.body, draft.cta].filter(Boolean).join("\n\n")}
              hashtags={draft.hashtags}
              featuredImageUrl={featuredImageUrl}
              allowGenerateImage={false}
              expanded
              isEditing={true}
              editDraft={draft}
              onEditDraftChange={setDraft}
            />
            <p className="text-center text-[11px] text-text-tertiary">
              Editing directly inside the preview card. Changes will be saved once you click{" "}
              <span className="font-medium text-text-secondary">Save edits</span>.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-[580px] space-y-5">
            <LinkedInFeedCard
              authorName={authorName}
              authorHeadline={headline}
              authorAvatarUrl={authorAvatarUrl}
              postText={composedPost}
              hashtags={composedHashtags}
              featuredImageUrl={featuredImageUrl}
              allowGenerateImage
              onGenerateImage={handleGenerateImage}
              imageGenerating={imageGenerating}
            />
            <p className="text-center text-[11px] text-text-tertiary">
              Tap the post to expand text. Use fullscreen for a larger canvas. Switch to{" "}
              <span className="font-medium text-text-secondary">Edit</span> to revise copy — add an optional image from
              Preview when generation is available.
            </p>
          </div>
        )}
      </div>
      <InlineAiEditOverlay
        active={mode === "edit"}
        getRoots={getEditorRoots}
        onOpen={({ snapshot, range, textareaInfo }) => {
          setAiEdit({ open: true, snapshot });
          if (textareaInfo) {
            textareaSelectionRef.current = textareaInfo;
          }
        }}
      />
      <BlogAiRewriterModal
        open={aiEdit.open}
        blogId={blog.id}
        projectDomain={project?.domain ?? ""}
        selection={aiEdit.snapshot}
        renderMarkdownSnippet={md => (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
        )}
        onClose={() => setAiEdit({ open: false, snapshot: null })}
        onInsert={handleAiRewriterInsert}
      />
    </PreviewShell>
  );
}

function recommendationsFor(data: LinkedInContentData | undefined, chars: number): string[] {
  const rec: string[] = [];
  if (!data) return ["Open Edit to fill in the hook, body, CTA, and hashtags."];

  const hookWords = (data.hook ?? "").split(/\s+/).filter(Boolean).length;
  if (chars > 1300) {
    rec.push(`Trim ~${chars - 1300} chars — LinkedIn collapses past 1,300.`);
  } else if (chars >= 950 && chars <= 1300) {
    rec.push(`Length ${chars} chars — sweet spot for the feed.`);
  } else if (chars < 700) {
    rec.push("Add a paragraph or two — under 700 chars often feels thin.");
  }
  if (hookWords === 0) rec.push("Add a hook — one line that survives the fold.");
  else if (hookWords > 14) rec.push("Tighten the hook — aim for ≤ 12 words.");
  else rec.push("Hook is sharp — keep that first line magnetic.");

  if ((data.hashtags ?? []).length === 0) rec.push("Add 3–5 targeted hashtags so the algo can route the post.");
  else if ((data.hashtags ?? []).length > 5) rec.push("Drop a hashtag or two — 3–5 is the sweet spot.");

  rec.push("Schedule 9–11am in your audience timezone — peak attention window.");
  return rec;
}
