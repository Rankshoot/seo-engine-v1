import type { Blog, BlogSeoIssueKey, BlogStatus } from "@/lib/types";
import { apiGet, apiPatch, apiPost } from "./http";
import { V1Routes } from "./routes";

export const blogsApi = {
  getById(blogId: string): Promise<{ success: boolean; error?: string; data: Blog | null }> {
    return apiGet(V1Routes.blog(blogId));
  },

  /**
   * Returns the latest "Enhanced" version of this blog, or `data: null` when
   * none exists. Used by the blog viewer to restore the Before / After toggle
   * after a hard reload / history navigation.
   */
  getEnhanced(blogId: string): Promise<{ success: boolean; error?: string; data: Blog | null }> {
    return apiGet(V1Routes.blogEnhanced(blogId));
  },

  addToArticlesLibrary(
    blogId: string
  ): Promise<
    | { success: true; alreadySaved: boolean }
    | { success: false; error: string; alreadySaved: boolean }
  > {
    return apiPost(V1Routes.blogArticlesLibrary(blogId), {});
  },

  generate(body: {
    entryId: string;
    wordCount?: number;
    writerNotes?: string;
  }): Promise<{ success: true; data: Blog } | { success: false; error: string }> {
    return apiPost(V1Routes.blogsGenerate, body);
  },

  updateContent(
    blogId: string,
    body: { content: string; title?: string; metaDescription?: string }
  ): Promise<{ success: boolean; error?: string; data: Blog | null }> {
    return apiPatch(V1Routes.blogContent(blogId), body);
  },

  updateStatus(
    blogId: string,
    status: BlogStatus
  ): Promise<{ success: boolean; error?: string; data?: Blog | null }> {
    return apiPatch(V1Routes.blogStatus(blogId), { status });
  },

  fixSeo(
    blogId: string,
    issueKey: BlogSeoIssueKey
  ): Promise<{ success: boolean; error?: string; data: Blog | null }> {
    return apiPost(V1Routes.blogFixSeo(blogId), { issueKey });
  },

  rewriteSelection(
    blogId: string,
    body: { selectedText: string; instruction: string }
  ): Promise<{
    success: boolean;
    error?: string;
    rewritten?: string;
    trace?: Array<{ label: string; ok: boolean; ms?: number; detail?: string }>;
  }> {
    return apiPost(V1Routes.blogRewriteSelection(blogId), body);
  },

  regenerateImage(
    blogId: string,
    body: { imageAlt: string; contextBefore: string; contextAfter: string }
  ): Promise<{ success: boolean; error?: string; data?: { url: string; alt: string } }> {
    return apiPost(V1Routes.blog(blogId) + "/image", body);
  },
};
