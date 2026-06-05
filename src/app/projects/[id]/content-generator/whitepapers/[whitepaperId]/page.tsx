"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  type PreviewMode,
} from "@/components/content-generator/shared";
import { WhitepaperReader } from "@/components/content-generator/whitepaper/WhitepaperReader";
import { blogsApi } from "@/frontend/api/blogs";
import { exportWhitepaper, WHITEPAPER_EXPORT_OPTIONS } from "@/lib/content-exports";
import { normalizeSiteHost } from "@/lib/blog-content";
import type { StudioBrand } from "@/lib/studio-brand";
import type { Blog, Project, WhitepaperContentData } from "@/lib/types";

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

  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const descRef = useRef<HTMLParagraphElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const ownSiteHost = useMemo(
    () => (project?.domain ? normalizeSiteHost(project.domain) : null),
    [project?.domain],
  );

  const studioBrand: StudioBrand | null = useMemo(() => {
    if (!project?.company?.trim() || !project?.domain?.trim()) return null;
    return { company: project.company.trim(), domain: project.domain.trim() };
  }, [project?.company, project?.domain]);

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
    if (!bodyRef.current) return;
    setSaving(true);
    try {
      const TurndownService = (await import("turndown")).default;
      const td = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
        bulletListMarker: "-",
      });
      const html = bodyRef.current.innerHTML;
      const bodyMd = td.turndown(html).replace(/\n{3,}/g, "\n\n").trim();
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
    <ViewModePill<PreviewMode>
      modes={[
        { key: "preview", label: "Read" },
        { key: "edit", label: "Edit" },
        { key: "raw", label: "Raw" },
      ]}
      active={mode}
      onChange={next => {
        if (next === "edit") startEdit();
        else if (mode === "edit") cancelEdit();
        setMode(next);
      }}
    />
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
    ) : null;

  return (
    <PreviewShell
      header={breadcrumb}
      toolbarLeft={toolbarLeft}
      toolbarRight={toolbarRight}
      sidebar={sidebar}
      sidebarWidthPx={320}
      framedCanvas={false}
    >
      <WhitepaperReader
        blog={blog}
        ownSiteHost={ownSiteHost}
        mode={mode}
        brand={studioBrand}
        companyName={project?.company}
        titleRef={titleRef}
        descRef={descRef}
        bodyRef={bodyRef}
        editSessionKey={editSessionKey}
      />
    </PreviewShell>
  );
}
