"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Blog } from "@/lib/types";
import {
  internalSetForBlog,
  stripHeroHeading,
  buildMarkdownComponents,
  markdownUrlTransform,
} from "./BlogMarkdownComponents";

const MONO = { fontFamily: "CohereMono, monospace", letterSpacing: "0.28px" } as const;

// ─── Article meta row ──────────────────────────────────────────────────────

export function ArticleMetaRow({ blog }: { blog: Blog }) {
  const date = new Date(blog.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <div className="px-6 py-2.5 bg-surface-secondary border-b border-border-subtle">
      <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-3">
        {blog.article_type && (
          <span
            className="rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase border border-border-subtle bg-surface-primary text-text-secondary"
            style={MONO}
          >
            {blog.article_type}
          </span>
        )}
        {blog.target_keyword && (
          <span className="text-[11px] text-text-tertiary">
            Target: <span className="font-semibold text-text-secondary">{blog.target_keyword}</span>
          </span>
        )}
        <span className="text-border-subtle opacity-80">·</span>
        <span className="text-[11px] text-text-tertiary">{date}</span>
        <span className="text-border-subtle opacity-80">·</span>
        <span className="text-[11px] text-text-tertiary">{Math.max(1, Math.ceil(blog.word_count / 200))} min read</span>
        <span className="text-border-subtle opacity-80">·</span>
        <span className="text-[11px] text-text-tertiary">{blog.word_count.toLocaleString()} words</span>
      </div>
    </div>
  );
}

// ─── Read-only editorial preview ───────────────────────────────────────────

export function EditorialPreview({
  blog,
  ownSiteHost,
}: {
  blog: Blog;
  ownSiteHost: string | null;
}) {
  const internalSet = useMemo(() => internalSetForBlog(blog), [blog]);
  const { heroTitle, body } = useMemo(() => stripHeroHeading(blog), [blog]);
  const components = useMemo(
    () => buildMarkdownComponents(internalSet, ownSiteHost),
    [internalSet, ownSiteHost]
  );
  return (
    <>
      <ArticleMetaRow blog={blog} />
      <article className="mx-auto max-w-[860px] px-8 py-12">
        <header className="mb-10 pb-8 border-b border-border-subtle">
          <h1
            className="mb-4 text-text-primary"
            style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.5 }}
          >
            {heroTitle}
          </h1>
          {blog.meta_description && (
            <p className="text-text-tertiary" style={{ fontSize: 17, lineHeight: 1.7 }}>
              {blog.meta_description}
            </p>
          )}
        </header>
        <div className="editorial-body space-y-5 text-text-secondary" style={{ fontSize: 17, lineHeight: 1.78 }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={components}
            urlTransform={markdownUrlTransform}
          >
            {body}
          </ReactMarkdown>
        </div>
        <footer className="mt-14 pt-6 text-[11px] text-text-tertiary border-t border-border-subtle">
          — End of article —
        </footer>
      </article>
    </>
  );
}
