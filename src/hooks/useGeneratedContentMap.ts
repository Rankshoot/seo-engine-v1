"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { contentGeneratorApi } from "@/frontend/api/content-generator";
import { qk, DEFAULT_QUERY_OPTIONS } from "@/lib/query";

/** Canonical content-type strings that all map to the "blog" bucket. */
const BLOG_ALIASES = new Set([
  "blog",
  "blog article",
  "blog_article",
  "blog post",
  "blog_post",
]);

/**
 * Normalise a keyword for use as a map key:
 *   - trim
 *   - lowercase
 *   - collapse multiple spaces into one
 */
export function normalizeKeyword(s: string): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Normalise a content-type string to one of the four canonical buckets:
 *   "blog" | "ebook" | "whitepaper" | "linkedin"
 */
export function normalizeContentType(s: string): string {
  const t = (s ?? "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (BLOG_ALIASES.has(t)) return "blog";
  if (t === "ebook" || t === "e-book" || t === "e book") return "ebook";
  if (t === "whitepaper" || t === "white paper") return "whitepaper";
  if (t === "linkedin" || t === "linkedin post") return "linkedin";
  if (t === "landing page" || t === "landing_page") return "landing_page";
  return "blog";
}

/**
 * Build the composite lookup key used to cross-reference Content History
 * records against Keyword Discovery and Content Calendar rows.
 *
 * Key format:  `<normalizedKeyword>::<normalizedContentType>`
 *
 * Using "::" as a separator because neither field will ever contain "::".
 */
export function generatedContentKey(keyword: string, contentType: string): string {
  return `${normalizeKeyword(keyword)}::${normalizeContentType(contentType)}`;
}

export interface GeneratedEntry {
  /** UUID of the blog row (used to navigate to /projects/:id/blogs/:blogId). */
  id: string;
  contentType: string;
}

/**
 * Fetches the unified Content Studio history for a project and returns a
 * Map keyed by `generatedContentKey(keyword, contentType)` → GeneratedEntry.
 *
 * This is the single source of truth for "has this keyword+type been generated?"
 * and is used by both Keyword Discovery and Content Calendar to decide whether
 * to render "View" / "View Blog" instead of "Generate".
 */
export function useGeneratedContentMap(projectId: string): {
  generatedMap: Map<string, GeneratedEntry>;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: qk.contentStudioHistory(projectId),
    queryFn: () => contentGeneratorApi.studioHistory(projectId),
    enabled: !!projectId,
    ...DEFAULT_QUERY_OPTIONS,
  });

  const generatedMap = useMemo<Map<string, GeneratedEntry>>(() => {
    const rows = data?.success ? data.data : [];
    const map = new Map<string, GeneratedEntry>();
    for (const row of rows) {
      if (!row.target_keyword) continue;
      const key = generatedContentKey(row.target_keyword, row.content_type ?? row.article_type);
      if (!map.has(key)) {
        map.set(key, { id: row.id, contentType: row.content_type ?? "blog" });
      }
    }
    return map;
  }, [data]);

  return { generatedMap, isLoading };
}
