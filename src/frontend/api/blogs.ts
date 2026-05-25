import type { BlogDeepAnalysisResult } from "@/lib/blog-deep-analysis";
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
    body: {
      selectedText: string;
      instruction: string;
      plainText?: string;
      htmlFragment?: string;
      links?: Array<{
        id?: string;
        anchorText: string;
        href: string;
        type?: "internal" | "external";
      }>;
      prefValidatedInternalUrl?: string;
      prefValidatedReplacementUrl?: string;
      prefValidatedReplacements?: Array<{ linkId: string; newHref: string }>;
    }
  ): Promise<{
    success: boolean;
    error?: string;
    rewritten?: string;
    action?: "replace_text" | "update_link" | "update_text_and_link" | "needs_url";
    linkUpdates?: Array<{
      oldHref: string;
      newHref: string;
      oldAnchorText: string;
      newAnchorText: string;
    }>;
    linkUpdatesDetail?: Array<{
      oldHref: string;
      newHref: string;
      oldAnchorText: string;
      newAnchorText: string;
      isValidated?: boolean;
      validationStatus?: number;
      validationReason?: string;
    }>;
    linkResolution?: { url?: string; status?: number; reason?: string; linkType?: "internal" | "external" };
    linkResolutions?: Array<{
      linkId: string;
      oldHref: string;
      newHref: string;
      type: "internal" | "external";
      status: number;
      reason: string;
    }>;
    trace?: Array<{ label: string; ok: boolean; ms?: number; detail?: string }>;
  }> {
    return apiPost(V1Routes.blogRewriteSelection(blogId), body);
  },

  resolveRewriteLinkCandidates(
    blogId: string,
    body: {
      selectedText: string;
      plainText?: string;
      htmlFragment?: string;
      links?: Array<{
        id?: string;
        anchorText: string;
        href: string;
        type?: "internal" | "external";
      }>;
      instruction?: string;
    }
  ): Promise<{
    success: boolean;
    error?: string;
    linkType?: "internal" | "external";
    selectedUrl?: string;
    candidates?: Array<{
      url: string;
      title: string;
      domain: string;
      reason: string;
      relevanceScore: number;
      credibilityScore: number;
      status: number;
    }>;
    replacements?: Array<{
      linkId: string;
      oldHref: string;
      oldAnchorText: string;
      newHref: string;
      newAnchorText: string;
      type: "internal" | "external";
      reason: string;
      status: number;
      relevanceScore: number;
    }>;
    candidatesByLinkId?: Record<
      string,
      Array<{
        url: string;
        title: string;
        domain: string;
        reason: string;
        relevanceScore: number;
        credibilityScore: number;
        status: number;
      }>
    >;
    resolverErrors?: Array<{ linkId: string; type: "internal" | "external"; message: string }>;
    trace?: Array<{ label: string; ok: boolean; ms?: number; detail?: string }>;
  }> {
    return apiPost(V1Routes.blogRewriteSelection(blogId), { ...body, intent: "resolve_link" });
  },

  regenerateImage(
    blogId: string,
    body: { imageAlt: string; contextBefore: string; contextAfter: string }
  ): Promise<{ success: boolean; error?: string; data?: { url: string; alt: string } }> {
    return apiPost(V1Routes.blog(blogId) + "/image", body);
  },

  getDeepAnalysis(blogId: string): Promise<{
    success: boolean;
    cached: boolean;
    data: BlogDeepAnalysisResult | null;
    updatedAt: string | null;
    targetKeyword: string | null;
  }> {
    return apiGet(V1Routes.blogDeepAnalysis(blogId));
  },

  runDeepAnalysis(
    blogId: string,
    body: { force?: boolean } = {}
  ): Promise<
    | {
        success: true;
        data: BlogDeepAnalysisResult;
        updatedAt: string;
        trace?: Array<{ stage: string; ok: boolean; detail?: string }>;
      }
    | { success: false; error: string }
  > {
    return apiPost(V1Routes.blogDeepAnalysis(blogId), body);
  },
};
