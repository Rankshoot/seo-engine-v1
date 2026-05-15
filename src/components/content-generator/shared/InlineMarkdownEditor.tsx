"use client";

import { memo, useLayoutEffect, useRef, type RefObject } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";
import { LongFormMarkdown, stripHeroH1, type LongFormReaderInk } from "./LongFormMarkdown";
import { MarkdownFormatToolbar } from "./MarkdownFormatToolbar";
import type { Blog } from "@/lib/types";

/**
 * Read-only editorial preview for long-form content.
 *
 * Renders the same typography contract as the blog viewer (36px H1, 17px body,
 * generous spacing) so ebook + whitepaper canvases match the design system.
 */
export function ReadOnlyArticle({
  blog,
  ownSiteHost,
  className,
  readerInk = null,
}: {
  blog: Blog;
  ownSiteHost: string | null;
  className?: string;
  readerInk?: LongFormReaderInk | null;
}) {
  const { hero, body } = stripHeroH1(blog.content);

  return (
    <article className={`mx-auto max-w-[820px] px-8 py-12 ${className ?? ""}`}>
      <header
        className={cn("mb-10 pb-8 border-b", !readerInk && "border-border-subtle")}
        style={readerInk ? { borderColor: readerInk.border } : undefined}
      >
        <h1
          className={cn("mb-4", !readerInk && "text-text-primary")}
          style={{
            fontSize: 36,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: -0.5,
            ...(readerInk ? { color: readerInk.primary } : {}),
          }}
        >
          {hero ?? blog.title}
        </h1>
        {blog.meta_description ? (
          <p
            className={cn(!readerInk && "text-text-tertiary")}
            style={{
              fontSize: 17,
              lineHeight: 1.7,
              ...(readerInk ? { color: readerInk.tertiary } : {}),
            }}
          >
            {blog.meta_description}
          </p>
        ) : null}
      </header>
      <LongFormMarkdown
        markdown={body}
        internalLinks={blog.internal_links ?? []}
        ownSiteHost={ownSiteHost}
        readerInk={readerInk}
      />
      <footer
        className={cn("mt-14 pt-6 text-[11px] border-t", !readerInk && "text-text-tertiary border-border-subtle")}
        style={readerInk ? { color: readerInk.tertiary, borderColor: readerInk.border } : undefined}
      >
        — End of {blog.article_type ? blog.article_type.toLowerCase() : "article"} —
      </footer>
    </article>
  );
}

/**
 * ContentEditable visual editor for long-form (ebook / whitepaper).
 *
 * Imperatively seeds the title, meta description, and body markdown into
 * `contentEditable` divs once per session so React doesn't re-render the
 * editable DOM out from under the user mid-edit. Same approach the blog
 * viewer uses for its `MemoizedVisualBlogEditors` — proven and stable.
 */
export const InlineMarkdownEditor = memo(
  function InlineMarkdownEditor({
    blog,
    ownSiteHost,
    sessionKey,
    titleRef,
    descRef,
    bodyRef,
    className,
    readerInk = null,
    markdownToolbar = false,
  }: {
    blog: Blog;
    ownSiteHost: string | null;
    /** Bumped by the parent to force a re-seed without remounting children. */
    sessionKey: number;
    titleRef: RefObject<HTMLHeadingElement | null>;
    descRef: RefObject<HTMLParagraphElement | null>;
    bodyRef: RefObject<HTMLDivElement | null>;
    className?: string;
    readerInk?: LongFormReaderInk | null;
    /** Bold / italic / lists / links for the visual markdown body (contentEditable). */
    markdownToolbar?: boolean;
  }) {
    useLayoutEffect(() => {
      const h = titleRef.current;
      const p = descRef.current;
      const bodyEl = bodyRef.current;
      if (!h || !p || !bodyEl) return;
      const { hero, body } = stripHeroH1(blog.content);
      h.textContent = hero ?? blog.title;
      p.textContent = blog.meta_description ?? "";
      bodyEl.innerHTML = renderToStaticMarkup(
        <LongFormMarkdown
          markdown={body}
          internalLinks={blog.internal_links ?? []}
          ownSiteHost={ownSiteHost}
          readerInk={readerInk}
        />,
      );
      // sessionKey participates in deps so the parent can force a fresh seed
      // (e.g. after switching between Before/After or canceling an edit).
    }, [blog, ownSiteHost, readerInk, titleRef, descRef, bodyRef, sessionKey]);

    return (
      <article className={`mx-auto max-w-[820px] px-8 py-12 ${className ?? ""}`}>
        <header
          className={cn("mb-10 pb-8 border-b", !readerInk && "border-border-subtle")}
          style={readerInk ? { borderColor: readerInk.border } : undefined}
        >
          <h1
            ref={titleRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck
            className={cn("mb-4 outline-none", !readerInk && "text-text-primary")}
            style={{
              fontSize: 36,
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: -0.5,
              ...(readerInk ? { color: readerInk.primary } : {}),
            }}
          />
          <p
            ref={descRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck
            className={cn("outline-none", !readerInk && "text-text-tertiary")}
            style={{
              fontSize: 17,
              lineHeight: 1.7,
              ...(readerInk ? { color: readerInk.tertiary } : {}),
            }}
          />
        </header>
        {markdownToolbar ? <MarkdownFormatToolbar editorRef={bodyRef} className="mb-3" /> : null}
        <div
          ref={bodyRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          className={cn("editorial-body min-h-[50vh] space-y-5 outline-none", !readerInk && "text-text-secondary")}
          style={{
            fontSize: 17,
            lineHeight: 1.78,
            ...(readerInk ? { color: readerInk.secondary } : {}),
          }}
        />
        <footer
          className={cn("mt-14 pt-6 text-[11px] border-t", !readerInk && "text-text-tertiary border-border-subtle")}
          style={readerInk ? { color: readerInk.tertiary, borderColor: readerInk.border } : undefined}
        >
          — Save edits to update the SEO score, links, and word count —
        </footer>
      </article>
    );
  },
  (prev, next) =>
    prev.blog.id === next.blog.id &&
    prev.blog.content === next.blog.content &&
    prev.blog.meta_description === next.blog.meta_description &&
    prev.blog.title === next.blog.title &&
    prev.ownSiteHost === next.ownSiteHost &&
    prev.sessionKey === next.sessionKey &&
    prev.readerInk === next.readerInk &&
    prev.markdownToolbar === next.markdownToolbar,
);

// Re-exported for convenience by the readers.
export { ReactMarkdown, remarkGfm };
