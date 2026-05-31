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
  EbookScorePanel,
  ExportMenu,
  MetricPill,
  PreviewShell,
  ResourcesPanel,
  StudioBreadcrumb,
  ViewModePill,
  type PreviewMode,
} from "@/components/content-generator/shared";
import { EbookReader, type EbookTheme } from "@/components/content-generator/ebook/EbookReader";
import { blogsApi } from "@/frontend/api/blogs";
import { projectsApi } from "@/frontend/api/projects";
import { exportEbook, EBOOK_EXPORT_OPTIONS } from "@/lib/content-exports";
import { normalizeSiteHost } from "@/lib/blog-content";
import type { StudioBrand } from "@/lib/studio-brand";
import type { Blog, EbookContentData, Project } from "@/lib/types";

const MONO_LABEL = { fontFamily: "CohereMono, monospace", letterSpacing: "0.28px" } as const;

export default function EbookViewerPage() {
  const { id: projectId, ebookId } = useParams<{ id: string; ebookId: string }>();
  const queryClient = useQueryClient();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [project, setProject] = useState<Project | null>(null);

  const { data: blogRes, isLoading: blogLoading } = useQuery({
    queryKey: qk.blog(ebookId),
    queryFn: () => blogsApi.getById(ebookId),
    enabled: !!ebookId,
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
  const [theme, setTheme] = useState<EbookTheme>("sepia");
  const [fontScale, setFontScale] = useState(1);

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
          <p className="text-[12px] text-text-tertiary">Loading ebook…</p>
        </div>
      </div>
    );
  }

  if (!blog) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="mb-4 text-[14px] text-text-tertiary">Ebook not found.</p>
        <ProjectNavLink
          href={`/projects/${projectId}/content-generator/ebooks`}
          className="text-[14px] font-medium underline underline-offset-2 text-brand-action"
        >
          ← Back to Ebooks
        </ProjectNavLink>
      </div>
    );
  }

  const data = (blog.content_data ?? {}) as EbookContentData;

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
        // Preserve `content_data` (cover, ToC, FAQ) since the inline editor
        // only edits the markdown body — the API doesn't roundtrip JSONB.
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
      <StudioBreadcrumb parentHref={`${studioBase}/ebooks`} parentLabel="Ebooks" current={blog.title} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <PageTitle>Ebook</PageTitle>
          <p className="mt-2 text-[13px] leading-relaxed text-text-tertiary">
            Read like a real ebook — sepia or dark, sized for long-form. Export to PDF, Word, EPUB-ready
            chapters, or paste straight into your CMS as Markdown.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ContentTypeBadge type="Ebook" />
        {blog.target_keyword ? <MetricPill label="primary keyword" value={blog.target_keyword} /> : null}
        <MetricPill label="words" value={blog.word_count.toLocaleString()} />
        <MetricPill label="chapters" value={data.table_of_contents?.length ?? 0} />
        {blog.research_sources > 0 ? (
          <MetricPill tone="action" label="live sources" value={blog.research_sources} />
        ) : null}
        {blog.external_links?.length ? (
          <MetricPill tone="action" label="external links" value={blog.external_links.length} />
        ) : null}
        {blog.internal_links?.length ? (
          <MetricPill tone="coral" label="internal links" value={blog.internal_links.length} />
        ) : null}
      </div>
    </div>
  );

  const sidebar = (
    <>
      {/* Asset summary */}
      <div className="px-4 pt-4 pb-3 border-b border-border-subtle">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary" style={MONO_LABEL}>
          Cover
        </p>
        <p className="mt-1 text-[14px] font-semibold text-text-primary leading-snug">{data.cover_title || blog.title}</p>
        {data.cover_subtitle ? (
          <p className="mt-1.5 text-[11px] text-text-tertiary leading-relaxed">{data.cover_subtitle}</p>
        ) : null}
      </div>

      <EbookScorePanel blog={blog} className="px-4 py-4 bg-transparent border-0 border-b border-border-subtle" />

      {data.table_of_contents?.length ? (
        <div className="border-b border-border-subtle px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-2" style={MONO_LABEL}>
            Table of contents
          </p>
          <ol className="space-y-1.5">
            {data.table_of_contents.map(c => (
              <li key={c.number} className="flex gap-2 text-[12px] text-text-secondary">
                <span className="font-mono text-[10px] tabular-nums text-text-tertiary shrink-0">
                  {String(c.number).padStart(2, "0")}
                </span>
                <span className="leading-snug">{c.title}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {data.cta ? (
        <div className="border-b border-border-subtle px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1.5" style={MONO_LABEL}>
            CTA
          </p>
          <p className="text-[12px] leading-relaxed text-text-secondary">{data.cta}</p>
        </div>
      ) : null}

      {data.faqs?.length ? (
        <div className="border-b border-border-subtle px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-2" style={MONO_LABEL}>
            FAQ ({data.faqs.length})
          </p>
          <ul className="space-y-2">
            {data.faqs.slice(0, 5).map((q, i) => (
              <li key={i} className="text-[12px] text-text-secondary">
                <p className="font-medium text-text-primary">{q.question}</p>
                <p className="mt-0.5 text-[11px] text-text-tertiary leading-relaxed">{q.answer}</p>
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
        options={EBOOK_EXPORT_OPTIONS}
        onExport={fmt => exportEbook(blog, fmt, project ? { domain: project.domain, company: project.company } : undefined)}
      />
    </>
  );

  const toolbarLeft = (
    <div className="flex items-center gap-2">
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
      {mode === "preview" ? (
        <>
          <ThemeSwitcher value={theme} onChange={setTheme} />
          <FontSizeSwitcher value={fontScale} onChange={setFontScale} />
        </>
      ) : null}
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
    ) : null;

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
    >
      <EbookReader
        blog={blog}
        ownSiteHost={ownSiteHost}
        brand={studioBrand}
        mode={mode}
        titleRef={titleRef}
        descRef={descRef}
        bodyRef={bodyRef}
        editSessionKey={editSessionKey}
        theme={theme}
        onThemeChange={setTheme}
        fontScale={fontScale}
        onFontScaleChange={setFontScale}
      />
    </PreviewShell>
  );
}

function ThemeSwitcher({
  value,
  onChange,
}: {
  value: EbookTheme;
  onChange: (next: EbookTheme) => void;
}) {
  const options: { id: EbookTheme; label: string }[] = [
    { id: "sepia", label: "Sepia" },
    { id: "dark", label: "Night" },
    { id: "system", label: "App" },
  ];
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-full border border-border-subtle">
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className="px-3 py-1 rounded-full text-[11px] font-medium transition-all"
          style={
            value === o.id
              ? { background: "var(--text-primary)", color: "var(--surface-primary)" }
              : { background: "transparent", color: "var(--text-tertiary)" }
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FontSizeSwitcher({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border-subtle">
      <button
        type="button"
        onClick={() => onChange(Math.max(0.85, +(value - 0.05).toFixed(2)))}
        className="h-7 w-7 text-[12px] text-text-tertiary hover:text-text-primary transition-colors"
        aria-label="Decrease font size"
      >
        A-
      </button>
      <span className="text-[10px] font-mono tabular-nums text-text-tertiary px-1">
        {Math.round(value * 100)}%
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(1.4, +(value + 0.05).toFixed(2)))}
        className="h-7 w-7 text-[14px] text-text-tertiary hover:text-text-primary transition-colors"
        aria-label="Increase font size"
      >
        A+
      </button>
    </div>
  );
}
