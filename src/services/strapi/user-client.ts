/**
 * User-configurable Strapi client.
 *
 * Unlike `client.ts` (which is hardcoded to Rankshoot's own Strapi), this
 * module accepts a user-provided { url, token } pair and publishes to the
 * user's own Strapi instance.  Used by the CMS integration feature.
 */

import type { StrapiPublishPayload, StrapiSingleResponse, StrapiArticle, StrapiListResponse } from "./types";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES        = 3;

export class StrapiUserClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly strapiError: string
  ) {
    super(`Strapi ${status}: ${strapiError}`);
    this.name = "StrapiUserClientError";
  }
}

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
      const isNetwork  = err instanceof TypeError;
      const isStatusErr = err instanceof StrapiUserClientError && isRetryable(err.status);
      if (!isNetwork && !isStatusErr) throw err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delayMs * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

async function request<T>(
  baseUrl: string,
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const url = `${baseUrl.replace(/\/$/, "")}/api${path}`;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body !== undefined ? JSON.stringify({ data: body }) : undefined,
      signal: controller.signal,
    });

    const json = await res.json();

    if (!res.ok) {
      const errBody = json as { error?: { message?: string } };
      throw new StrapiUserClientError(
        res.status,
        errBody?.error?.message ?? `HTTP ${res.status}`
      );
    }

    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

const COLLECTION = "articles";

export function createUserStrapiClient(baseUrl: string, token: string) {
  return {
    /** Verify credentials by hitting /api/users/me */
    async testConnection(): Promise<{ ok: boolean; error?: string }> {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8_000);
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));
        if (res.ok) return { ok: true };
        const j = await res.json().catch(() => ({})) as { error?: { message?: string } };
        return { ok: false, error: j?.error?.message ?? `HTTP ${res.status}` };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Connection failed" };
      }
    },

    /**
     * Publish or update an article in the user's Strapi.
     * Idempotent: finds existing by source_blog_id and updates, or creates.
     */
    async publishArticle(payload: StrapiPublishPayload): Promise<{ documentId: string; slug: string }> {
      const qs = new URLSearchParams({
        "filters[source_blog_id][$eq]": payload.source_blog_id,
      });

      const existing = await withRetry(() =>
        request<StrapiListResponse<StrapiArticle>>(
          baseUrl, token, "GET", `/${COLLECTION}?${qs}`
        )
      );

      if (existing.data.length > 0) {
        const art = existing.data[0];
        const idParam = art.documentId ?? String(art.id);
        const updated = await withRetry(() =>
          request<StrapiSingleResponse<StrapiArticle>>(
            baseUrl, token, "PUT", `/${COLLECTION}/${idParam}`, payload
          )
        );
        return {
          documentId: updated.data.documentId ?? String(updated.data.id),
          slug: (updated.data.attributes?.slug ?? updated.data.slug) ?? payload.slug,
        };
      }

      const created = await withRetry(() =>
        request<StrapiSingleResponse<StrapiArticle>>(
          baseUrl, token, "POST", `/${COLLECTION}`, payload
        )
      );
      return {
        documentId: created.data.documentId ?? String(created.data.id),
        slug: (created.data.attributes?.slug ?? created.data.slug) ?? payload.slug,
      };
    },
  };
}
