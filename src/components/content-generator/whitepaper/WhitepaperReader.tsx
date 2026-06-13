"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  LongFormMarkdown,
  StudioBrandMasthead,
  stripHeroH1,
  type LongFormReaderInk,
  type PreviewMode,
} from "@/components/content-generator/shared";
import { TipTapBlogEditor, type TipTapBlogEditorRef } from "@/components/content-generator/shared/TipTapBlogEditor";
import type { StudioBrand } from "@/lib/studio-brand";
import type { Blog, WhitepaperContentData } from "@/lib/types";

export interface WhitepaperSegment {
  title: string;
  headerLine: string | null;
  body: string;
  isEditable: boolean;
}

export function splitMarkdownIntoSegments(markdown: string): WhitepaperSegment[] {
  const lines = markdown.split("\n");
  const out: WhitepaperSegment[] = [];
  let current: WhitepaperSegment | null = null;
  
  for (const line of lines) {
    if (/^#\s+/.test(line)) continue; // skip H1 cover title
    
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (current) out.push(current);
      const title = m[1].trim();
      const lower = title.toLowerCase();
      // Determine if this segment is editable
      const isEditable = !(
        lower === "executive summary" ||
        lower === "recommendations" ||
        lower === "references"
      );
      current = {
        title,
        headerLine: line,
        body: "",
        isEditable,
      };
    } else {
      if (!current && line.trim() !== "") {
        // Text before the first H2 is treated as an editable Introduction segment
        current = {
          title: "Introduction",
          headerLine: null,
          body: "",
          isEditable: true,
        };
      }
      if (current) {
        current.body += line + "\n";
      }
    }
  }
  if (current) out.push(current);
  return out;
}

const MONO_LABEL = { fontFamily: "CohereMono, monospace", letterSpacing: "0.28px" } as const;

/** Light paper surface — dashboard text tokens are illegible on white cards. */
const WHITEPAPER_READER_INK: LongFormReaderInk = {
  primary: "#101828",
  secondary: "#1f2937",
  tertiary: "#475467",
  border: "#d6dde8",
  surfaceMuted: "rgba(16, 24, 40, 0.055)",
};

export interface WhitepaperReaderProps {
  blog: Blog;
  ownSiteHost: string | null;
  mode: PreviewMode;
  companyName?: string;
  /** Richer brand row (logo + domain) on the cover when provided. */
  brand?: StudioBrand | null;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  descRef: React.RefObject<HTMLParagraphElement | null>;
  /** TipTap editor ref — used by the parent page to call getMarkdown() on save. */
  tiptapRef: React.RefObject<TipTapBlogEditorRef | null>;
  editSessionKey: number;
}

/**
 * Branded research document.
 *
 * Mirrors the way a real B2B / analyst whitepaper is laid out — branded
 * cover with publication date, callout-style executive summary, numbered
 * section ribbons, and a references footer. The right rail (handled by
 * the page) covers score / sections nav / recommendations / exports.
 */
export function WhitepaperReader({
  blog,
  ownSiteHost,
  mode,
  companyName,
  brand = null,
  titleRef,
  descRef,
  tiptapRef,
  editSessionKey,
}: WhitepaperReaderProps) {
  const data = (blog.content_data ?? {}) as Partial<WhitepaperContentData>;
  
  const localSegments = useMemo(() => {
    return splitMarkdownIntoSegments(blog.content);
  }, [blog.content]);

  const sections = useMemo(() => {
    return localSegments.filter(s => s.isEditable);
  }, [localSegments]);

  const editorRefs = useRef<Record<number, TipTapBlogEditorRef | null>>({});

  useImperativeHandle(tiptapRef, () => ({
    getMarkdown: () => {
      return localSegments
        .map((seg, idx) => {
          let body = seg.body.trim();
          if (seg.isEditable && editorRefs.current[idx]) {
            body = editorRefs.current[idx]!.getMarkdown().trim();
          }
          if (seg.headerLine) {
            return `${seg.headerLine}\n\n${body}`;
          }
          return body;
        })
        .join("\n\n")
        .trim();
    },
  }));

  const { hero } = stripHeroH1(blog.content);
  const cover = data.cover_title || hero || blog.title;
  const subtitle = data.cover_subtitle || blog.meta_description || "";
  const date = useMemo(
    () =>
      new Date(blog.created_at || "1970-01-01T00:00:00.000Z").toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
      }),
    [blog.created_at],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeSection, setActiveSection] = useState(0);

  useEffect(() => {
    if (mode !== "preview") return;
    const root = containerRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const idx = Number((e.target as HTMLElement).dataset.sectionIndex);
            if (!Number.isNaN(idx)) setActiveSection(idx);
          }
        });
      },
      { root, threshold: 0.4 },
    );
    root.querySelectorAll<HTMLElement>("[data-section-index]").forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [sections, mode]);

  // Seed title/desc contentEditable elements when entering edit mode.
  useLayoutEffect(() => {
    if (mode !== "edit") return;
    const h = titleRef.current;
    const p = descRef.current;
    if (!h || !p) return;
    const { hero } = stripHeroH1(blog.content);
    h.textContent = hero ?? blog.title;
    p.textContent = blog.meta_description ?? "";
  }, [blog, mode, titleRef, descRef]);


  if (mode === "raw") {
    return (
      <div className="h-full overflow-y-auto bg-surface-primary p-8">
        <pre
          className="whitespace-pre-wrap leading-relaxed text-[13px] text-text-secondary"
          style={{ fontFamily: "CohereMono, monospace" }}
        >
          {blog.content}
        </pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-y-auto"
      style={{ background: "linear-gradient(180deg, #f4f7fc 0%, #fafbfd 100%)" }}
    >
      {/* sticky chip — current section indicator */}
      <div className="sticky top-2 z-10 mx-auto flex max-w-[860px] items-center justify-end pr-2" aria-hidden>
        <span
          className="inline-flex items-center gap-2 rounded-full border bg-white/80 px-3 py-1 text-[10px] backdrop-blur"
          style={{ borderColor: "#d6dde8", color: "#44546a", ...MONO_LABEL }}
        >
          <span>
            {activeSection === 0
              ? "Cover"
              : activeSection === 1
                ? "Executive summary"
                : `Section ${String(Math.max(activeSection - 1, 1)).padStart(2, "0")} / ${String(Math.max(sections.length, 1)).padStart(2, "0")}`}
          </span>
          <span>·</span>
          <span>~{readingMinutes(blog.word_count)} min</span>
        </span>
      </div>

      {/* COVER */}
      <article
        data-section-index="0"
        className="relative mx-auto mt-6 mb-8 flex min-h-[78vh] max-w-[860px] flex-col justify-end overflow-hidden rounded-[16px] border bg-white px-10 py-12 shadow-sm sm:px-16 sm:py-16"
        style={{ borderColor: "#d6dde8", color: "#101828" }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-2"
          aria-hidden
          style={{ background: "linear-gradient(90deg, #1257c1 0%, #0a66c2 50%, #14b8a6 100%)" }}
        />
        <div
          className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full opacity-30"
          aria-hidden
          style={{ background: "radial-gradient(circle, #1257c1 0%, transparent 70%)" }}
        />

        <div className="relative">
          <p
            className="font-mono text-[10px] uppercase tracking-[0.32em]"
            style={{ color: "#1257c1" }}
          >
            Whitepaper{companyName ? ` · ${companyName}` : ""}
          </p>
          <h1
            ref={mode === "edit" ? titleRef : undefined}
            contentEditable={mode === "edit"}
            suppressContentEditableWarning={mode === "edit"}
            spellCheck={mode === "edit"}
            className={`mt-6 mb-4 outline-none ${mode === "edit" ? "focus:ring-2 focus:ring-brand-action/40 rounded px-1 -mx-1" : ""}`}
            style={{
              fontSize: "clamp(28px, 4.4vw, 44px)",
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -0.5,
              fontFamily: 'ui-sans-serif, "Helvetica Neue", Arial, sans-serif',
              color: "#101828",
            }}
          >
            {cover}
          </h1>
          {subtitle || mode === "edit" ? (
            <p
              ref={mode === "edit" ? descRef : undefined}
              contentEditable={mode === "edit"}
              suppressContentEditableWarning={mode === "edit"}
              spellCheck={mode === "edit"}
              className={`mt-2 max-w-3xl text-balance outline-none ${mode === "edit" ? "focus:ring-2 focus:ring-brand-action/40 rounded px-1 -mx-1 min-h-[1.5em]" : ""}`}
              style={{ fontSize: "clamp(14px, 1.3vw, 18px)", lineHeight: 1.55, color: "#44546a" }}
            >
              {subtitle}
            </p>
          ) : null}

          {brand ? (
            <div className="mt-8 flex w-full max-w-lg justify-start border-t border-[#d6dde8] pt-6" style={{ color: "#101828" }}>
              <StudioBrandMasthead brand={brand} borderColor="#d6dde8" />
            </div>
          ) : null}

          <div
            className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px] uppercase tracking-[0.18em]"
            style={{ color: "#44546a", ...MONO_LABEL }}
          >
            <span>Published · {date}</span>
            {data.industry ? <span>Industry · {data.industry}</span> : null}
            {data.technical_depth ? <span>Depth · {data.technical_depth}</span> : null}
            {data.audience ? <span>For · {data.audience}</span> : null}
          </div>
        </div>
      </article>

      {/* EXECUTIVE SUMMARY callout */}
      {data.executive_summary ? (
        <article
          data-section-index="1"
          className="relative mx-auto mb-8 max-w-[860px] rounded-[16px] border bg-white p-8 shadow-sm sm:p-10"
          style={{ borderColor: "#d6dde8", color: "#101828" }}
        >
          <div className="flex items-start gap-5">
            <div
              className="hidden h-1 w-1 shrink-0 rounded-full sm:block"
              aria-hidden
              style={{ background: "#1257c1", height: "auto", width: "4px", alignSelf: "stretch" }}
            />
            <div className="min-w-0">
              <p
                className="font-mono text-[10px] uppercase tracking-[0.32em]"
                style={{ color: "#1257c1" }}
              >
                Executive summary
              </p>
              <p
                className="mt-3"
                style={{
                  fontSize: 16,
                  lineHeight: 1.7,
                  color: "#101828",
                  fontFamily: 'ui-sans-serif, "Helvetica Neue", Arial, sans-serif',
                }}
              >
                {data.executive_summary}
              </p>
              {data.problem_statement ? (
                <div className="mt-5 rounded-md border border-[#1257c1]/15 bg-[#eef3fb] p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-[#1257c1]">
                    Problem statement
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[#101828]">
                    {data.problem_statement}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </article>
      ) : null}

      {/* SECTIONS */}
      {localSegments.map((s, idx) => {
        if (!s.isEditable) return null;
        const editableIndex = localSegments.filter((x, itemIdx) => x.isEditable && itemIdx < idx).length;
        
        return (
          <article
            key={idx}
            data-section-index={editableIndex + 2}
            className="relative mx-auto mb-8 max-w-[860px] rounded-[16px] border bg-white px-8 py-10 shadow-sm sm:px-12 sm:py-14"
            style={{ borderColor: "#d6dde8", color: "#101828" }}
          >
            <div className="mb-8 flex items-center gap-3">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold tabular-nums text-white"
                style={{ background: "#1257c1" }}
              >
                {String(editableIndex + 1).padStart(2, "0")}
              </span>
              <div>
                <p
                  className="font-mono text-[10px] uppercase tracking-[0.32em]"
                  style={{ color: "#1257c1" }}
                >
                  Section {String(editableIndex + 1).padStart(2, "0")}
                </p>
                <h2
                  className="mt-0.5"
                  style={{
                    fontSize: "clamp(20px, 2.2vw, 26px)",
                    fontWeight: 700,
                    lineHeight: 1.2,
                    letterSpacing: -0.2,
                    fontFamily: 'ui-sans-serif, "Helvetica Neue", Arial, sans-serif',
                    color: "#101828",
                  }}
                >
                  {s.title}
                </h2>
              </div>
            </div>

            <div
              className="editorial-body whitepaper-theme space-y-5"
              style={{
                color: "#1f2937",
                fontFamily: 'ui-sans-serif, "Helvetica Neue", Arial, sans-serif',
                fontSize: 15,
                lineHeight: 1.7,
              }}
            >
              {mode === "edit" ? (
                <TipTapBlogEditor
                  key={`whitepaper-tiptap-${editSessionKey}-${idx}`}
                  initialMarkdown={s.body}
                  ref={el => {
                    editorRefs.current[idx] = el;
                  }}
                  style={{
                    color: "#1f2937",
                    fontFamily: 'ui-sans-serif, "Helvetica Neue", Arial, sans-serif',
                    fontSize: 15,
                    lineHeight: 1.7,
                    minHeight: "150px",
                  }}
                />
              ) : (
                <LongFormMarkdown
                  markdown={s.body}
                  internalLinks={blog.internal_links ?? []}
                  ownSiteHost={ownSiteHost}
                  readerInk={WHITEPAPER_READER_INK}
                />
              )}
            </div>
          </article>
        );
      })}

      {/* RECOMMENDATIONS */}
      {data.recommendations?.length ? (
        <article
          data-section-index={sections.length + 2}
          className="relative mx-auto mb-8 max-w-[860px] rounded-[16px] border bg-white px-8 py-10 shadow-sm sm:px-12 sm:py-14"
          style={{ borderColor: "#d6dde8" }}
        >
          <p
            className="font-mono text-[10px] uppercase tracking-[0.32em]"
            style={{ color: "#1257c1" }}
          >
            Recommendations
          </p>
          <h2
            className="mt-3 mb-8"
            style={{
              fontSize: "clamp(22px, 2.4vw, 28px)",
              fontWeight: 700,
              fontFamily: 'ui-sans-serif, "Helvetica Neue", Arial, sans-serif',
              color: "#101828",
            }}
          >
            What to do next
          </h2>
          <ol className="space-y-4">
            {data.recommendations.map((r, i) => (
              <li
                key={i}
                className="flex gap-4 border-b border-[#d6dde8]/60 pb-4 last:border-b-0 last:pb-0"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: "#1257c1" }}
                >
                  {i + 1}
                </span>
                <p
                  className="text-[14px] leading-relaxed"
                  style={{ color: "#1f2937", fontFamily: 'ui-sans-serif, "Helvetica Neue", Arial, sans-serif' }}
                >
                  {r}
                </p>
              </li>
            ))}
          </ol>
        </article>
      ) : null}

      {/* REFERENCES */}
      {data.references?.length ? (
        <article
          className="relative mx-auto mb-8 max-w-[860px] rounded-[16px] border bg-white px-8 py-10 shadow-sm sm:px-12 sm:py-14"
          style={{ borderColor: "#d6dde8" }}
        >
          <p
            className="font-mono text-[10px] uppercase tracking-[0.32em]"
            style={{ color: "#1257c1" }}
          >
            References ({data.references.length})
          </p>
          <ol className="mt-4 space-y-1.5 text-[12px]" style={{ color: "#44546a" }}>
            {data.references.map((u, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono tabular-nums shrink-0">[{i + 1}]</span>
                <a
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:opacity-80 break-all"
                  style={{ color: "#1257c1" }}
                  title={u}
                >
                  {u}
                </a>
              </li>
            ))}
          </ol>
        </article>
      ) : null}
    </div>
  );
}

function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 220));
}


