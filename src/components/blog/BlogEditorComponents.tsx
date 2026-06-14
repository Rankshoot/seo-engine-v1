"use client";

import { memo, useLayoutEffect, type RefObject } from "react";
import type { Blog } from "@/lib/types";
import { stripHeroHeading } from "./BlogMarkdownComponents";

// ─── Memoized editor props equality ───────────────────────────────────────

function editArticleSeedPropsEqual(
  prev: { blog: Blog; ownSiteHost: string | null },
  next: { blog: Blog; ownSiteHost: string | null }
): boolean {
  if (prev.ownSiteHost !== next.ownSiteHost) return false;
  const pi = prev.blog.internal_links ?? [];
  const ni = next.blog.internal_links ?? [];
  if (pi.length !== ni.length) return false;
  for (let i = 0; i < pi.length; i++) if (pi[i] !== ni[i]) return false;
  return (
    prev.blog.id === next.blog.id &&
    prev.blog.content === next.blog.content &&
    prev.blog.meta_description === next.blog.meta_description &&
    prev.blog.title === next.blog.title
  );
}

// ─── Component ─────────────────────────────────────────────────────────────

interface MemoizedVisualBlogEditorsProps {
  blog: Blog;
  ownSiteHost: string | null;
  titleRef: RefObject<HTMLHeadingElement | null>;
  descRef: RefObject<HTMLParagraphElement | null>;
}

/**
 * Isolated from parent re-renders (e.g. AI modal) so React does not clear
 * contentEditable DOM. Uses a custom memo comparator that only re-seeds when
 * the blog content actually changes.
 */
export const MemoizedVisualBlogEditors = memo(
  function MemoizedVisualBlogEditors({ blog, ownSiteHost, titleRef, descRef }: MemoizedVisualBlogEditorsProps) {
    useLayoutEffect(() => {
      const h = titleRef.current;
      const p = descRef.current;
      if (!h || !p) return;
      const { heroTitle } = stripHeroHeading(blog);
      h.textContent = heroTitle;
      p.textContent = blog.meta_description ?? "";
    }, [blog, ownSiteHost, titleRef, descRef]);

    return (
      <header className="mb-10 pb-8 border-b border-border-subtle">
        <h1
          ref={titleRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          className="mb-4 outline-none text-text-primary"
          style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.5 }}
        />
        <p
          ref={descRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          className="outline-none text-text-tertiary"
          style={{ fontSize: 17, lineHeight: 1.7 }}
        />
      </header>
    );
  },
  editArticleSeedPropsEqual
);
