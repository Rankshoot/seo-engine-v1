"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  LongFormMarkdown,
  ReadOnlyArticle,
  StudioBrandMasthead,
  stripHeroH1,
  ViewModePill,
  type LongFormReaderInk,
  type PreviewMode,
} from "@/components/content-generator/shared";
import { TipTapBlogEditor, type TipTapBlogEditorRef } from "@/components/content-generator/shared/TipTapBlogEditor";
import { cn } from "@/lib/cn";
import type { StudioBrand } from "@/lib/studio-brand";
import type { Blog, EbookContentData } from "@/lib/types";
import { VisualBlock } from "./VisualBlock";

export interface EbookSegment {
  title: string;
  headerLine: string | null;
  body: string;
  isEditable: boolean;
}

export function splitMarkdownIntoSegments(markdown: string): EbookSegment[] {
  const lines = markdown.split("\n");
  const out: EbookSegment[] = [];
  let current: EbookSegment | null = null;

  const finaliseSegment = (seg: EbookSegment) => {
    // Strip trailing --- separators (chapter dividers) and blank lines so
    // they don't render as a second <hr> beneath the footer border.
    seg.body = seg.body.replace(/(\n\s*---+\s*)+\s*$/, "").trimEnd();
  };

  for (const line of lines) {
    if (/^#\s+/.test(line)) continue; // skip H1 cover title

    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (current) {
        finaliseSegment(current);
        out.push(current);
      }
      const title = m[1].replace(/^Chapter\s+\d+\s*[—-]\s*/i, "").trim();
      current = {
        title,
        headerLine: line,
        body: "",
        isEditable: true,
      };
    } else {
      if (!current && line.trim() !== "") {
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
  if (current) {
    finaliseSegment(current);
    out.push(current);
  }
  return out.filter(c => c.body.trim().length > 0);
}

// ── Visual placeholder parsing ─────────────────────────────────────────────

type BodyPart =
  | { kind: "text"; text: string }
  | { kind: "visual"; attrs: Record<string, string> };

function parseBodyParts(body: string): BodyPart[] {
  const PLACEHOLDER_RE = /<!--\s*VISUAL_PLACEHOLDER\s+([\s\S]*?)-->/g;
  const parts: BodyPart[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = PLACEHOLDER_RE.exec(body)) !== null) {
    if (match.index > last) {
      parts.push({ kind: "text", text: body.slice(last, match.index) });
    }
    const attrs: Record<string, string> = {};
    const attrRe = /(\w[\w-]*)="([^"]*)"/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(match[1])) !== null) {
      attrs[am[1]] = am[2];
    }
    parts.push({ kind: "visual", attrs });
    last = match.index + match[0].length;
  }

  if (last < body.length) {
    parts.push({ kind: "text", text: body.slice(last) });
  }
  return parts;
}

// ── Theme ──────────────────────────────────────────────────────────────────

const MONO_LABEL = { fontFamily: "CohereMono, monospace", letterSpacing: "0.28px" } as const;

export type EbookTheme = "sepia" | "dark" | "system";

const THEME_BG: Record<EbookTheme, { canvas: string; page: string; text: string; muted: string; border: string }> = {
  sepia: {
    canvas: "#efe7d6",
    page: "#faf6ec",
    text: "#2c2418",
    muted: "#6b6253",
    border: "#d8cdb6",
  },
  dark: {
    canvas: "#0e0d10",
    page: "#1a1820",
    text: "#e6e2db",
    muted: "#9c9486",
    border: "#2a2630",
  },
  system: {
    canvas: "var(--surface-secondary)",
    page: "var(--surface-primary)",
    text: "var(--text-primary)",
    muted: "var(--text-tertiary)",
    border: "var(--border-subtle)",
  },
};

export interface EbookReaderProps {
  blog: Blog;
  ownSiteHost: string | null;
  mode: PreviewMode;
  /** Title/desc refs forwarded to the contentEditable header in edit mode. */
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  descRef: React.RefObject<HTMLParagraphElement | null>;
  /** TipTap editor ref — used by the parent page to call getMarkdown() on save. */
  tiptapRef: React.RefObject<TipTapBlogEditorRef | null>;
  editSessionKey: number;
  /** Callbacks for the toolbar selectors (theme, font size). */
  theme: EbookTheme;
  onThemeChange: (next: EbookTheme) => void;
  fontScale: number;
  onFontScaleChange: (next: number) => void;
  /** Company + domain (+ favicon) for cover / chapter footers. */
  brand?: StudioBrand | null;
  /** Exposed so the page can wire up InlineAiEditOverlay to detect selections. */
  editorContainerRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * Immersive book reader.
 *
 * Renders a paged ebook: cover, a UI-rendered ToC, and chapters in scroll
 * blocks. Visual placeholders inside chapter bodies are rendered as image
 * placeholder cards with a "Generate" affordance.
 */
export function EbookReader({
  blog,
  ownSiteHost,
  mode,
  titleRef,
  descRef,
  tiptapRef,
  editSessionKey,
  theme,
  fontScale,
  onFontScaleChange: _onFontScaleChange,
  brand = null,
  editorContainerRef,
}: EbookReaderProps) {
  const palette = THEME_BG[theme];
  const data = (blog.content_data ?? {}) as Partial<EbookContentData>;

  const readerInk = useMemo((): LongFormReaderInk => {
    const surfaceMuted = theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(44, 36, 24, 0.075)";
    return {
      primary: palette.text,
      secondary: palette.text,
      tertiary: palette.muted,
      border: palette.border,
      surfaceMuted,
    };
  }, [palette.text, palette.muted, palette.border, theme]);

  const localChapters = useMemo(() => {
    const all = splitMarkdownIntoSegments(blog.content);
    // The markdown ToC segment is redundant when structured ToC data exists.
    // Filtering it also prevents broken-link anchor clicks in that segment.
    if ((data.table_of_contents?.length ?? 0) > 0) {
      return all.filter(s => !/^(table of contents|what you.ll learn)$/i.test(s.title.trim()));
    }
    return all;
  }, [blog.content, data.table_of_contents]);

  const chapters = localChapters;

  const editorRefs = useRef<Record<number, TipTapBlogEditorRef | null>>({});

  useImperativeHandle(tiptapRef, () => ({
    getMarkdown: () => {
      return localChapters
        .map((chap, idx) => {
          let body = chap.body.trim();
          if (editorRefs.current[idx]) {
            body = editorRefs.current[idx]!.getMarkdown().trim();
          }
          if (chap.headerLine) {
            return `${chap.headerLine}\n\n${body}`;
          }
          return body;
        })
        .join("\n\n")
        .trim();
    },
    replaceSelection: (markdown: string) => {
      for (const edRef of Object.values(editorRefs.current)) {
        if (edRef && edRef.replaceSelection(markdown)) return true;
      }
      return false;
    },
  }));

  const { hero } = stripHeroH1(blog.content);
  const heroTitle = data.cover_title || hero || blog.title;
  const subtitle = data.cover_subtitle ?? "";
  const coverDate = useMemo(
    () =>
      new Date(blog.created_at || "1970-01-01T00:00:00.000Z").toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
      }),
    [blog.created_at],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeChapter, setActiveChapter] = useState(0);

  // Scroll-position-based chapter tracking — reliable for chapters of any
  // length, unlike IntersectionObserver with a fixed threshold that never
  // fires on full-page sections.
  useEffect(() => {
    if (mode !== "preview") return;
    const root = containerRef.current;
    if (!root) return;

    const update = () => {
      const elements = root.querySelectorAll<HTMLElement>("[data-chapter-index]");
      let best = 0;
      // "Active" = last element whose top edge is above the top quarter of the viewport.
      const threshold = root.scrollTop + root.clientHeight * 0.25;
      for (const el of elements) {
        if (el.offsetTop <= threshold) best = Number(el.dataset.chapterIndex);
        else break;
      }
      setActiveChapter(best);
    };

    root.addEventListener("scroll", update, { passive: true });
    update(); // initial paint
    return () => root.removeEventListener("scroll", update);
  }, [chapters, mode]);

  // Smooth-scroll the reader container to a given data-chapter-index.
  const scrollToChapter = useCallback((chapterDataIndex: number) => {
    const root = containerRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(`[data-chapter-index="${chapterDataIndex}"]`);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

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
      <div
        className="h-full overflow-y-auto p-8"
        style={{ background: palette.canvas, color: palette.text }}
      >
        <pre
          className="whitespace-pre-wrap leading-relaxed text-[13px]"
          style={{ fontFamily: "CohereMono, monospace" }}
        >
          {blog.content}
        </pre>
      </div>
    );
  }

  // Number of content chapters (everything in chapters array).
  // Used by the floating pill.
  const totalChapters = chapters.length;

  // Map active data-chapter-index → human label for the pill.
  function pillLabel(idx: number): string {
    if (idx === 0) return "Cover";
    if (idx === 1) return "Contents";
    const chapterNum = idx - 1; // chapter 1 = data-chapter-index 2
    if (chapterNum > totalChapters) return "End";
    return `Chapter ${chapterNum} / ${totalChapters}`;
  }

  return (
    <div
      ref={el => {
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        if (editorContainerRef) (editorContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }}
      className="relative h-full overflow-y-auto px-2 py-6 sm:px-8 sm:py-10"
      style={{
        background: palette.canvas,
        color: palette.text,
        zoom: fontScale,
        scrollbarGutter: "stable",
      }}
    >
      {/* Floating chapter pill */}
      <div
        className="sticky top-2 z-10 mx-auto flex max-w-[820px] items-center justify-end pr-2"
        aria-hidden
      >
        <span
          className="inline-flex items-center gap-2 rounded-full border bg-surface-elevated/80 px-3 py-1 text-[10px] backdrop-blur"
          style={{ borderColor: palette.border, color: palette.muted, ...MONO_LABEL }}
        >
          <span>{pillLabel(activeChapter)}</span>
          <span>·</span>
          <span>{readingMinutes(blog.word_count)} min read</span>
        </span>
      </div>

      {/* COVER PAGE */}
      <article
        data-chapter-index="0"
        className="relative mx-auto mt-4 mb-8 flex min-h-[78vh] max-w-[820px] flex-col items-center justify-center overflow-hidden rounded-[16px] border px-8 py-16 text-center shadow-(--shadow-sm)"
        style={{ background: palette.page, borderColor: palette.border }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            background: `radial-gradient(circle at 50% 0%, ${theme === "dark" ? "#1f1d28" : "#e7dec5"}, transparent 60%)`,
          }}
        />
        {brand ? (
          <div className="relative z-[1] mx-auto mb-8 flex w-full max-w-md justify-center px-2" style={{ color: palette.text }}>
            <StudioBrandMasthead brand={brand} borderColor={palette.border} />
          </div>
        ) : null}
        <p
          className="relative font-mono text-[10px] uppercase tracking-[0.32em]"
          style={{ color: palette.muted }}
        >
          Ebook · published {coverDate}
        </p>
        <h1
          ref={mode === "edit" ? titleRef : undefined}
          contentEditable={mode === "edit"}
          suppressContentEditableWarning={mode === "edit"}
          spellCheck={mode === "edit"}
          className={`relative mt-8 mb-4 outline-none ${mode === "edit" ? "focus:ring-2 focus:ring-brand-action/40 rounded px-1 -mx-1" : ""}`}
          style={{
            fontSize: "clamp(28px, 4.6vw, 44px)",
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: -0.5,
            fontFamily: 'Georgia, "Times New Roman", serif',
            color: palette.text,
          }}
        >
          {heroTitle}
        </h1>
        {subtitle || mode === "edit" ? (
          <p
            ref={mode === "edit" ? descRef : undefined}
            contentEditable={mode === "edit"}
            suppressContentEditableWarning={mode === "edit"}
            spellCheck={mode === "edit"}
            className={`relative mx-auto max-w-2xl text-balance outline-none ${mode === "edit" ? "focus:ring-2 focus:ring-brand-action/40 rounded px-1 -mx-1 min-h-[1.5em]" : ""}`}
            style={{ fontSize: "clamp(15px, 1.6vw, 19px)", lineHeight: 1.55, color: palette.muted }}
          >
            {subtitle}
          </p>
        ) : null}

        <div
          className="relative mt-16 flex flex-wrap items-center justify-center gap-3 text-[11px] uppercase tracking-[0.2em]"
          style={{ color: palette.muted, ...MONO_LABEL }}
        >
          {data.audience ? <span>For {data.audience}</span> : null}
          {data.audience && data.tone ? <span>·</span> : null}
          {data.tone ? <span>Tone · {data.tone}</span> : null}
        </div>

        <div
          className="relative mt-12 inline-flex items-center justify-center gap-3 rounded-full border px-4 py-1.5 text-[11px]"
          style={{ borderColor: palette.border, color: palette.muted, ...MONO_LABEL }}
        >
          <span>{blog.word_count.toLocaleString()} words</span>
          <span>·</span>
          <span>{chapters.length} chapter{chapters.length === 1 ? "" : "s"}</span>
        </div>
      </article>

      {/* TABLE OF CONTENTS PAGE — rendered from structured data, each item
          scrolls within the reader (no page navigation). */}
      {(data.table_of_contents?.length ?? 0) > 0 || chapters.length > 1 ? (
        <article
          data-chapter-index="1"
          className="relative mx-auto mb-8 max-w-[820px] rounded-[16px] border px-8 py-12 shadow-(--shadow-sm)"
          style={{ background: palette.page, borderColor: palette.border }}
        >
          <p
            className="font-mono text-[10px] uppercase tracking-[0.32em]"
            style={{ color: palette.muted }}
          >
            Table of contents
          </p>
          <h2
            className="mt-3 mb-8"
            style={{
              fontSize: 28,
              fontWeight: 700,
              fontFamily: 'Georgia, "Times New Roman", serif',
              color: palette.text,
            }}
          >
            What you&apos;ll learn
          </h2>
          <ol className="space-y-1">
            {(data.table_of_contents?.length
              ? data.table_of_contents
              : chapters.map((c, i) => ({
                  number: i + 1,
                  title: c.title,
                  summary: "",
                  word_count: 0,
                }))
            ).map(c => (
              <li key={c.number}>
                {/* Button scrolls within the reader — no new tab, no page reload. */}
                <button
                  type="button"
                  onClick={() => scrollToChapter(c.number + 1)}
                  className="w-full flex items-start gap-4 border-b border-dotted py-3 text-left transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-action/40 rounded-sm"
                  style={{ borderColor: palette.border }}
                >
                  <span
                    className="font-mono text-[12px] tabular-nums flex-shrink-0"
                    style={{ color: palette.muted, minWidth: "32px", ...MONO_LABEL }}
                  >
                    {String(c.number).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <p
                      className="text-[15px] font-semibold leading-snug"
                      style={{ color: palette.text }}
                    >
                      {c.title}
                    </p>
                    {c.summary ? (
                      <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: palette.muted }}>
                        {c.summary}
                      </p>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ol>
        </article>
      ) : null}

      {/* CHAPTER PAGES */}
      {chapters.map((chapter, i) => (
        <article
          key={i}
          // data-chapter-index: 0=cover, 1=ToC, 2=chapters[0], 3=chapters[1], …
          data-chapter-index={i + 2}
          className="relative mx-auto mb-8 max-w-[820px] rounded-[16px] border px-6 py-10 sm:px-12 sm:py-14 shadow-(--shadow-sm)"
          style={{ background: palette.page, borderColor: palette.border }}
        >
          <p
            className="font-mono text-[10px] uppercase tracking-[0.32em]"
            style={{ color: palette.muted }}
          >
            Chapter {String(i + 1).padStart(2, "0")}
          </p>
          <h2
            className="mt-3 mb-8"
            style={{
              fontSize: "clamp(22px, 2.4vw, 30px)",
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: -0.2,
              fontFamily: 'Georgia, "Times New Roman", serif',
              color: palette.text,
            }}
          >
            {chapter.title}
          </h2>

          <div
            className="editorial-body space-y-5"
            style={{
              color: palette.text,
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: "1.0625em",
              lineHeight: 1.78,
            }}
          >
            {mode === "edit" ? (
              <TipTapBlogEditor
                key={`ebook-tiptap-${editSessionKey}-${i}`}
                initialMarkdown={chapter.body}
                ref={el => { editorRefs.current[i] = el; }}
                className="min-h-0"
                style={{
                  color: palette.text,
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontSize: "1.0625em",
                  lineHeight: 1.78,
                  minHeight: "150px",
                }}
              />
            ) : (
              // Preview mode: split body at VISUAL_PLACEHOLDER comments and
              // render placeholder cards between markdown text segments.
              <ChapterBodyWithVisuals
                body={chapter.body}
                internalLinks={blog.internal_links ?? []}
                ownSiteHost={ownSiteHost}
                readerInk={readerInk}
                palette={palette}
                theme={theme}
              />
            )}
          </div>

          {/* Chapter footer — single top border only; trailing --- in the
              markdown body is stripped in splitMarkdownIntoSegments. */}
          <div
            className="mt-10 border-t pt-4 text-[11px]"
            style={{ borderColor: palette.border, color: palette.muted, ...MONO_LABEL }}
          >
            {brand ? (
              <div className="flex justify-center mb-4">
                <div style={{ color: palette.muted }} className="max-w-md">
                  <StudioBrandMasthead brand={brand} size="sm" borderColor={palette.border} />
                </div>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <span>Page {String(i + 1).padStart(2, "0")} / {String(chapters.length).padStart(2, "0")}</span>
              <span>{readingMinutes(chapter.body.split(/\s+/).length)} min</span>
            </div>
          </div>
        </article>
      ))}

      {/* End-of-book card */}
      <article
        data-chapter-index={chapters.length + 2}
        className="relative mx-auto mb-8 max-w-[820px] rounded-[16px] border px-8 py-12 text-center shadow-(--shadow-sm)"
        style={{ background: palette.page, borderColor: palette.border }}
      >
        <p
          className="font-mono text-[10px] uppercase tracking-[0.32em]"
          style={{ color: palette.muted }}
        >
          End of ebook
        </p>
        <h2
          className="mt-3 mb-3"
          style={{
            fontSize: 22,
            fontWeight: 700,
            fontFamily: 'Georgia, "Times New Roman", serif',
            color: palette.text,
          }}
        >
          Thanks for reading.
        </h2>
        {data.cta ? (
          <p style={{ fontSize: 15, color: palette.muted, lineHeight: 1.6 }}>{data.cta}</p>
        ) : null}
      </article>

      {/* Fallback for extremely short ebooks with no parseable chapters. */}
      {chapters.length === 0 ? (
        <div className="mx-auto max-w-[820px] rounded-[16px] border bg-surface-primary px-6 py-10" style={{ borderColor: palette.border }}>
          <ReadOnlyArticle blog={blog} ownSiteHost={ownSiteHost} readerInk={readerInk} />
        </div>
      ) : null}
    </div>
  );
}

// ── Chapter body renderer with visual placeholder support ──────────────────

function ChapterBodyWithVisuals({
  body,
  internalLinks,
  ownSiteHost,
  readerInk,
  palette,
  theme,
}: {
  body: string;
  internalLinks: string[];
  ownSiteHost: string | null;
  readerInk: LongFormReaderInk;
  palette: { page: string; text: string; muted: string; border: string };
  theme: EbookTheme;
}) {
  const parts = useMemo(() => parseBodyParts(body), [body]);

  return (
    <>
      {parts.map((part, idx) =>
        part.kind === "text" ? (
          part.text.trim() ? (
            <LongFormMarkdown
              key={idx}
              markdown={part.text}
              internalLinks={internalLinks}
              ownSiteHost={ownSiteHost}
              readerInk={readerInk}
            />
          ) : null
        ) : (
          // VisualBlock handles Generate button, loading, error, and rendering.
          <VisualBlock key={idx} attrs={part.attrs} palette={palette} theme={theme} />
        ),
      )}
    </>
  );
}

/** Reading-minutes estimate using 220 WPM. */
function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 220));
}
