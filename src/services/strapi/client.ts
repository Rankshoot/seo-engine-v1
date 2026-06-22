/**
 * Production-grade Strapi v5 REST API client.
 *
 * Features:
 *  - Automatic retries with exponential back-off (network / 5xx only)
 *  - Per-request timeout via AbortController
 *  - Full TypeScript generics
 *  - Zero external dependencies (native fetch)
 *  - Works in Node.js (Route Handlers / Server Actions) and browser
 */

import type {
  NormalisedArticle,
  StrapiArticle,
  StrapiListResponse,
  StrapiPublishPayload,
  StrapiSingleResponse,
} from "./types";

// ─── Config ──────────────────────────────────────────────────────────────────

const STRAPI_URL   = (process.env.STRAPI_URL   ?? "").replace(/\/$/, "");
const STRAPI_TOKEN = process.env.STRAPI_API_TOKEN ?? "";

const COLLECTION = "articles";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES        = 3;

// ─── Retry logic ──────────────────────────────────────────────────────────────

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delayMs = 500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isNetwork = err instanceof TypeError; // fetch network error
      const isStatusErr = err instanceof StrapiApiError && isRetryable(err.status);
      if (!isNetwork && !isStatusErr) throw err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delayMs * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

// ─── Error class ─────────────────────────────────────────────────────────────

export class StrapiApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly strapiError: string,
    public readonly details?: unknown
  ) {
    super(`Strapi ${status}: ${strapiError}`);
    this.name = "StrapiApiError";
  }
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function strapiRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  if (!STRAPI_URL) throw new Error("STRAPI_URL env var is not set");
  if (!STRAPI_TOKEN) throw new Error("STRAPI_API_TOKEN env var is not set");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${STRAPI_URL}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${STRAPI_TOKEN}`,
      },
      body: body !== undefined ? JSON.stringify({ data: body }) : undefined,
      signal: controller.signal,
    });

    const json = await res.json();

    if (!res.ok) {
      const errBody = json as { error?: { message?: string; details?: unknown } };
      throw new StrapiApiError(
        res.status,
        errBody?.error?.message ?? `HTTP ${res.status}`,
        errBody?.error?.details
      );
    }

    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Normalise (handle Strapi v4 + v5 shapes) ────────────────────────────────

function normalise(raw: StrapiArticle): NormalisedArticle {
  // Strapi v5 flattens attributes; v4 nests them
  const a = raw.attributes ?? raw;
  return {
    id:             raw.id,
    documentId:     raw.documentId,
    title:          a.title          ?? "",
    slug:           a.slug           ?? "",
    content:        a.content        ?? "",
    excerpt:        a.excerpt        ?? "",
    meta_description: a.meta_description ?? "",
    target_keyword: a.target_keyword ?? "",
    seo_score:      a.seo_score      ?? null,
    word_count:     a.word_count     ?? null,
    cover_image_url: a.cover_image_url ?? null,
    source_blog_id: a.source_blog_id ?? "",
    publishedAt:    a.publishedAt    ?? null,
    createdAt:      a.createdAt      ?? "",
    updatedAt:      a.updatedAt      ?? "",
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const strapiClient = {
  isConfigured(): boolean {
    return Boolean(STRAPI_URL && STRAPI_TOKEN);
  },

  /** List published articles, newest first. */
  async listArticles(opts?: {
    page?: number;
    pageSize?: number;
  }): Promise<{ data: NormalisedArticle[]; total: number; pageCount: number }> {
    const page     = opts?.page     ?? 1;
    const pageSize = opts?.pageSize ?? 12;
    const qs       = new URLSearchParams({
      "pagination[page]":     String(page),
      "pagination[pageSize]": String(pageSize),
      "sort":                 "publishedAt:desc",
      "publicationState":     "live",
    });

    const res = await withRetry(() =>
      strapiRequest<StrapiListResponse<StrapiArticle>>(
        "GET",
        `/${COLLECTION}?${qs}`
      )
    );

    return {
      data:      res.data.map(normalise),
      total:     res.meta.pagination.total,
      pageCount: res.meta.pagination.pageCount,
    };
  },

  /** Get a single article by slug. */
  async getArticleBySlug(slug: string): Promise<NormalisedArticle | null> {
    const qs = new URLSearchParams({
      "filters[slug][$eq]": slug,
      "publicationState":   "live",
    });

    const res = await withRetry(() =>
      strapiRequest<StrapiListResponse<StrapiArticle>>(
        "GET",
        `/${COLLECTION}?${qs}`
      )
    );

    return res.data.length > 0 ? normalise(res.data[0]) : null;
  },

  /**
   * Publish a blog post to Strapi.
   * If an article with the same `source_blog_id` already exists it is updated
   * (idempotent — safe to call on re-publish).
   */
  async publishArticle(payload: StrapiPublishPayload): Promise<NormalisedArticle> {
    // Check for existing article with this source_blog_id
    const qs = new URLSearchParams({
      "filters[source_blog_id][$eq]": payload.source_blog_id,
    });
    const existing = await withRetry(() =>
      strapiRequest<StrapiListResponse<StrapiArticle>>(
        "GET",
        `/${COLLECTION}?${qs}`
      )
    );

    if (existing.data.length > 0) {
      const article = existing.data[0];
      const idParam = article.documentId ?? String(article.id);
      const updated = await withRetry(() =>
        strapiRequest<StrapiSingleResponse<StrapiArticle>>(
          "PUT",
          `/${COLLECTION}/${idParam}`,
          payload
        )
      );
      return normalise(updated.data);
    }

    const created = await withRetry(() =>
      strapiRequest<StrapiSingleResponse<StrapiArticle>>(
        "POST",
        `/${COLLECTION}`,
        payload
      )
    );
    return normalise(created.data);
  },

  /** Delete an article by documentId. */
  async deleteArticle(documentId: string): Promise<void> {
    await withRetry(() =>
      strapiRequest("DELETE", `/${COLLECTION}/${documentId}`)
    );
  },
};
