"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, useProject, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { Button, PageTitle, Spinner } from "@/components/common";
import {
  ContentTypeBadge,
  MetricPill,
  PreviewShell,
  StudioBreadcrumb,
  PreviewerScheduler,
} from "@/components/content-generator/shared";
import { LandingPagePreview } from "@/components/landing-page/LandingPagePreview";
import { blogsApi } from "@/frontend/api/blogs";
import { calendarApi } from "@/frontend/api/calendar";
import type { Blog, LandingPageContentData, Project } from "@/lib/types";

export default function LandingPageViewerPage() {
  const { id: projectId, pageId } = useParams<{ id: string; pageId: string }>();
  const queryClient = useQueryClient();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const { data: blogRes, isLoading: blogLoading } = useQuery({
    queryKey: qk.blog(pageId),
    queryFn: () => blogsApi.getById(pageId),
    enabled: !!pageId,
    ...DEFAULT_QUERY_OPTIONS,
  });

  const { data: projectRes, isLoading: projectLoading } = useProject(projectId);

  const loading = (!blog || !project) && (blogLoading || projectLoading);

  useEffect(() => {
    if (blogRes?.success && blogRes.data) setBlog(blogRes.data);
  }, [blogRes]);

  useEffect(() => {
    if (projectRes?.success && projectRes.data) setProject(projectRes.data);
  }, [projectRes]);

  const studioBase = `/projects/${projectId}/content-generator`;

  const data = useMemo(
    () => (blog?.content_data ?? {}) as LandingPageContentData,
    [blog?.content_data],
  );

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
        if (!taken.has(key)) { targetDate = key; break; }
      }
      if (!targetDate) { toast.error("No free calendar dates found"); return; }
      const res = await calendarApi.scheduleExistingBlog(projectId, { blogId: blog.id, targetDate });
      if (res.success) {
        const niceDate = new Date(`${res.scheduled_date}T00:00:00`).toLocaleDateString("en-US", {
          month: "long", day: "numeric", year: "numeric",
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Spinner size={28} />
          <p className="text-[12px] text-text-tertiary">Loading landing page…</p>
        </div>
      </div>
    );
  }

  if (!blog) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="mb-4 text-[14px] text-text-tertiary">Landing page not found.</p>
        <ProjectNavLink
          href={`/projects/${projectId}/content-generator/landing-pages`}
          className="text-[14px] font-medium underline underline-offset-2 text-brand-action"
        >
          ← Back to Landing pages
        </ProjectNavLink>
      </div>
    );
  }

  const breadcrumb = (
    <div className="shrink-0 space-y-2">
      <StudioBreadcrumb
        parentHref={`${studioBase}/landing-pages`}
        parentLabel="Landing pages"
        current={blog.title}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <PageTitle>Landing page</PageTitle>
          <p className="mt-2 text-[13px] leading-relaxed text-text-tertiary">
            Brand-styled, SEO landing page with real conversion copy. Preview below, then schedule or publish.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ContentTypeBadge type="Landing Page" />
        {blog.target_keyword ? (
          <MetricPill label="primary keyword" value={blog.target_keyword} />
        ) : null}
        {data.page_type ? (
          <MetricPill label="page type" value={data.page_type} />
        ) : null}
        {data.sections?.length ? (
          <MetricPill label="sections" value={data.sections.length} />
        ) : null}
      </div>
    </div>
  );

  const sidebar = (
    <>
      {/* Meta */}
      <div className="px-4 pt-4 pb-3 border-b border-border-subtle">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1" style={{ fontFamily: "CohereMono, monospace" }}>
          Page title
        </p>
        <p className="text-[14px] font-semibold text-text-primary leading-snug">{blog.title}</p>
        {data.meta_description && (
          <p className="mt-2 text-[11px] text-text-tertiary leading-relaxed">{data.meta_description}</p>
        )}
      </div>

      {/* Section list */}
      {data.sections?.length ? (
        <div className="border-b border-border-subtle px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-2" style={{ fontFamily: "CohereMono, monospace" }}>
            Sections ({data.sections.length})
          </p>
          <ol className="space-y-1.5">
            {data.sections.map((s, i) => (
              <li key={i} className="flex gap-2 text-[12px] text-text-secondary">
                <span className="font-mono text-[10px] tabular-nums text-text-tertiary shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="capitalize leading-snug">{s.type.replace(/-/g, " ")}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {/* Brand palette */}
      {project?.brand_primary_color && (
        <div className="border-b border-border-subtle px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-2" style={{ fontFamily: "CohereMono, monospace" }}>
            Brand colours
          </p>
          <div className="flex gap-2">
            {[project.brand_primary_color, project.brand_secondary_color, project.brand_accent_color].filter(Boolean).map((c, i) => (
              <span
                key={i}
                className="h-5 w-5 rounded-full border border-white/20 shadow-sm"
                style={{ background: c! }}
                title={c!}
              />
            ))}
          </div>
        </div>
      )}

      {/* Scheduling */}
      <div className="border-b border-border-subtle px-4 py-4">
        <PreviewerScheduler
          projectId={projectId}
          blogId={blog.id}
          entryId={blog.entry_id}
          onScheduleUpdated={(newId) => {
            setBlog(prev => (prev ? { ...prev, entry_id: newId } : prev));
            void queryClient.invalidateQueries({ queryKey: qk.blog(blog.id) });
          }}
        />
      </div>
    </>
  );

  const toolbarLeft = (
    <div className="flex items-center gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary px-2 py-0.5 rounded border border-border-subtle bg-surface-secondary">
        Landing Page
      </span>
    </div>
  );

  const toolbarRight = (
    <div className="flex items-center gap-2">
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
      sidebarWidthPx={300}
      framedCanvas={false}
      toolbarInsideCanvas
      immersiveFullscreen
    >
      <div className="p-6 overflow-auto h-full">
        <LandingPagePreview data={data} project={project} className="mx-auto max-w-5xl" />
      </div>
    </PreviewShell>
  );
}
