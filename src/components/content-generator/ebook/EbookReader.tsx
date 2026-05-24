"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  InlineMarkdownEditor,
  LongFormMarkdown,
  ReadOnlyArticle,
  StudioBrandMasthead,
  stripHeroH1,
  ViewModePill,
  type LongFormReaderInk,
  type PreviewMode,
} from "@/components/content-generator/shared";
import { cn } from "@/lib/cn";
import type { StudioBrand } from "@/lib/studio-brand";
import type { Blog, EbookContentData } from "@/lib/types";

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
  /** Title-only refs forwarded to the inline editor when in edit mode. */
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  descRef: React.RefObject<HTMLParagraphElement | null>;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  editSessionKey: number;
  /** Callbacks for the toolbar selectors (theme, font size). */
  theme: EbookTheme;
  onThemeChange: (next: EbookTheme) => void;
  fontScale: number;
  onFontScaleChange: (next: number) => void;
  /** Company + domain (+ favicon) for cover / chapter footers. */
  brand?: StudioBrand | null;
}

/**
 * Immersive book reader.
 *
 * The reader emulates a paged ebook: a typographic cover page,
 * dotted-line chapter list, and chapters stacked in scroll-snap blocks
 * so the reader can flick through one chapter at a time. Sepia + dark
 * themes mirror what real e-readers (Kindle, Apple Books, Readwise)
 * ship with.
 */
export function EbookReader({
  blog,
  ownSiteHost,
  mode,
  titleRef,
  descRef,
  bodyRef,
  editSessionKey,
  theme,
  fontScale,
  onFontScaleChange: _onFontScaleChange,
  brand = null,
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

  const chapters = useMemo(() => splitMarkdownByH2(blog.content), [blog.content]);
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

  // Track which chapter is in view so the chapter pill in the corner stays in sync.
  useEffect(() => {
    if (mode !== "preview") return;
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.chapterIndex);
            if (!Number.isNaN(idx)) setActiveChapter(idx);
          }
        });
      },
      { root, threshold: 0.4 },
    );
    root.querySelectorAll<HTMLElement>("[data-chapter-index]").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [chapters, mode]);

  if (mode === "edit") {
    return (
      <div
        ref={containerRef}
        className="h-full overflow-y-auto"
        style={{ background: palette.canvas, color: palette.text }}
      >
        <InlineMarkdownEditor
          blog={blog}
          ownSiteHost={ownSiteHost}
          sessionKey={editSessionKey}
          titleRef={titleRef}
          descRef={descRef}
          bodyRef={bodyRef}
          readerInk={readerInk}
          markdownToolbar
        />
      </div>
    );
  }

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

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-y-auto px-2 py-6 sm:px-8 sm:py-10"
      style={{
        background: palette.canvas,
        color: palette.text,
        /* `zoom` scales typography + layout together (px, Tailwind, markdown) — % font-size on root did not affect fixed px/clamp sizes. */
        zoom: fontScale,
        scrollbarGutter: "stable",
      }}
    >
      {/* Floating chapter chip — always visible, anchored top-right of viewport */}
      <div
        className="sticky top-2 z-10 mx-auto flex max-w-[820px] items-center justify-end pr-2"
        aria-hidden
      >
        <span
          className="inline-flex items-center gap-2 rounded-full border bg-surface-elevated/80 px-3 py-1 text-[10px] backdrop-blur"
          style={{
            borderColor: palette.border,
            color: palette.muted,
            ...MONO_LABEL,
          }}
        >
          <span>
            {activeChapter === 0
              ? "Cover"
              : activeChapter === 1
                ? "Contents"
                : `Chapter ${activeChapter - 1} / ${chapters.length}`}
          </span>
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
          className="relative mt-8 mb-4"
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
        {subtitle ? (
          <p
            className="relative mx-auto max-w-2xl text-balance"
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
          style={{
            borderColor: palette.border,
            color: palette.muted,
            ...MONO_LABEL,
          }}
        >
          <span>{blog.word_count.toLocaleString()} words</span>
          <span>·</span>
          <span>{chapters.length} chapter{chapters.length === 1 ? "" : "s"}</span>
        </div>
      </article>

      {/* TABLE OF CONTENTS PAGE */}
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
            {(data.table_of_contents?.length ? data.table_of_contents : chapters.map((c, i) => ({
              number: i + 1,
              title: c.title,
              summary: "",
              word_count: 0,
            }))).map(c => (
              <li
                key={c.number}
                className="flex items-start gap-4 border-b border-dotted py-3"
                style={{ borderColor: palette.border }}
              >
                <span
                  className="font-mono text-[12px] tabular-nums"
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
              </li>
            ))}
          </ol>
        </article>
      ) : null}

      {/* CHAPTER PAGES — title hero is stripped so the heading reads as a chapter, not the cover */}
      {chapters.map((chapter, i) => (
        <article
          key={i}
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
            <LongFormMarkdown
              markdown={chapter.body}
              internalLinks={blog.internal_links ?? []}
              ownSiteHost={ownSiteHost}
              readerInk={readerInk}
            />
          </div>

          <div
            className="mt-10 flex flex-col gap-6 border-t pt-4 text-[11px]"
            style={{ borderColor: palette.border, color: palette.muted, ...MONO_LABEL }}
          >
            {brand ? (
              <div className="flex justify-center">
                <div style={{ color: palette.muted }} className="max-w-md">
                  <StudioBrandMasthead brand={brand} size="sm" borderColor={palette.border} />
                </div>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
            <span>
              Page {String(i + 1).padStart(2, "0")} / {String(chapters.length).padStart(2, "0")}
            </span>
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

      {/* Replacement display fallback when no chapters were parsed (extremely short ebooks). */}
      {chapters.length === 0 ? (
        <div className="mx-auto max-w-[820px] rounded-[16px] border bg-surface-primary px-6 py-10" style={{ borderColor: palette.border }}>
          <ReadOnlyArticle blog={blog} ownSiteHost={ownSiteHost} readerInk={readerInk} />
        </div>
      ) : null}
    </div>
  );
}

/** Reading-minutes estimate using 220 WPM. */
function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 220));
}

/** Split markdown by `## Heading`, dropping the H1 cover. */
function splitMarkdownByH2(markdown: string): Array<{ title: string; body: string }> {
  const lines = markdown.split("\n");
  const out: Array<{ title: string; body: string }> = [];
  let current: { title: string; body: string } | null = null;
  for (const line of lines) {
    if (/^#\s+/.test(line)) continue;
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (current) out.push(current);
      current = { title: m[1].replace(/^Chapter\s+\d+\s*[\u2014-]\s*/i, "").trim(), body: "" };
    } else if (current) {
      current.body += `${line}\n`;
    }
  }
  if (current) out.push(current);
  return out.filter(c => c.body.trim().length > 0);
}
