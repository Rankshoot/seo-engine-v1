/**
 * Strapi v5 content type definitions for the Rankshoot blog.
 *
 * Collection type: "article"  (plural API ID: /api/articles)
 * Required fields match the Strapi schema expected by the public blog page.
 */

export interface StrapiArticleAttributes {
  title: string;
  slug: string;
  content: string;          // Rich text (markdown stored as plaintext blocks)
  excerpt: string;
  meta_description: string;
  target_keyword: string;
  seo_score: number | null;
  word_count: number | null;
  cover_image_url: string | null;
  published_at: string | null;
  source_blog_id: string;   // FK back to our internal blogs table
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface StrapiArticle {
  id: number;
  documentId: string;
  attributes?: StrapiArticleAttributes; // Strapi v4 shape (kept for compat)
  // Strapi v5 flattens attributes to root
  title?: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  meta_description?: string;
  target_keyword?: string;
  seo_score?: number | null;
  word_count?: number | null;
  cover_image_url?: string | null;
  source_blog_id?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
}

/** Normalised article — always flat regardless of Strapi version. */
export interface NormalisedArticle {
  id: number;
  documentId: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  meta_description: string;
  target_keyword: string;
  seo_score: number | null;
  word_count: number | null;
  cover_image_url: string | null;
  source_blog_id: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StrapiListResponse<T> {
  data: T[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

export interface StrapiSingleResponse<T> {
  data: T;
  meta: Record<string, unknown>;
}

export interface StrapiErrorResponse {
  data: null;
  error: {
    status: number;
    name: string;
    message: string;
    details?: unknown;
  };
}

export type StrapiPublishPayload = {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  meta_description: string;
  target_keyword: string;
  seo_score: number | null;
  word_count: number | null;
  cover_image_url: string | null;
  source_blog_id: string;
};
