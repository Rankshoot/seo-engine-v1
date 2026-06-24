/**
 * User-configurable Strapi client.
 *
 * Unlike `client.ts` (which is hardcoded to Rankshoot's own Strapi), this
 * module accepts a user-provided { url, token } pair and publishes to the
 * user's own Strapi instance.  Used by the CMS integration feature.
 */

import type { StrapiPublishPayload, StrapiSingleResponse, StrapiArticle, StrapiListResponse } from "./types";

const DEFAULT_TIMEOUT_MS = 35_000;
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
      const isNetwork = err instanceof TypeError || (err instanceof Error && err.name === "AbortError") || (err instanceof StrapiUserClientError && err.status === 408);
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
  let cleanBaseUrl = baseUrl.replace(/\/$/, "");
  if (cleanBaseUrl.endsWith("/admin")) {
    cleanBaseUrl = cleanBaseUrl.slice(0, -6);
  }
  const url = `${cleanBaseUrl}/api${path}`;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body !== undefined ? JSON.stringify({ data: body }) : undefined,
      signal: controller.signal,
    }).catch(err => {
      if (err.name === "AbortError") {
        throw new StrapiUserClientError(
          408,
          `Request timed out after ${DEFAULT_TIMEOUT_MS / 1000}s. The Strapi server might be waking up or unreachable.`
        );
      }
      throw err;
    });

    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.toLowerCase().includes("application/json");
    let json: any = null;
    let parseError = false;

    if (isJson) {
      try {
        json = await res.json();
      } catch {
        parseError = true;
      }
    }

    if (!res.ok) {
      if (isJson && !parseError && json && typeof json === "object") {
        const errBody = json as { error?: { message?: string } };
        throw new StrapiUserClientError(
          res.status,
          errBody?.error?.message ?? `HTTP ${res.status}`
        );
      } else {
        const text = await res.text().catch(() => "");
        throw new StrapiUserClientError(
          res.status,
          `HTTP ${res.status}: ${text.slice(0, 100) || "Non-JSON response"}`
        );
      }
    }

    if (!isJson) {
      const text = await res.text().catch(() => "");
      throw new StrapiUserClientError(
        res.status,
        `Expected JSON response from Strapi, but received "${contentType}". Body: ${text.slice(0, 100) || "empty"}`
      );
    }

    if (parseError) {
      throw new StrapiUserClientError(
        res.status,
        "Failed to parse JSON response from Strapi"
      );
    }

    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

export function createUserStrapiClient(baseUrl: string, token: string, collectionName = "articles") {
  const collection = (collectionName || "articles").trim().toLowerCase();

  return {
    /** Verify credentials by hitting the configured collection endpoint */
    async testConnection(): Promise<{ ok: boolean; error?: string }> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      try {
        let cleanBaseUrl = baseUrl.replace(/\/$/, "");
        if (cleanBaseUrl.endsWith("/admin")) {
          cleanBaseUrl = cleanBaseUrl.slice(0, -6);
        }
        const res = await fetch(`${cleanBaseUrl}/api/${collection}?pagination[limit]=1`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (res.ok) return { ok: true };
        const j = await res.json().catch(() => ({})) as { error?: { message?: string } };
        return { ok: false, error: j?.error?.message ?? `HTTP ${res.status}` };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Connection failed" };
      } finally {
        clearTimeout(timer);
      }
    },

    /**
     * Publish or update an article in the user's Strapi.
     * Idempotent: finds existing by slug and updates, or creates.
     * Automatically attempts fallback payloads if user's Strapi schema lacks custom fields.
     */
    async publishArticle(payload: StrapiPublishPayload): Promise<{ documentId: string; slug: string }> {
      const { source_blog_id, ...fullPayload } = payload;
      
      let existing: StrapiListResponse<StrapiArticle> | null = null;
      try {
        existing = await withRetry(() =>
          request<StrapiListResponse<StrapiArticle>>(
            baseUrl, token, "GET", `/${collection}?filters[slug][$eq]=${payload.slug}`
          )
        );
      } catch (err) {
        // If GET fails with a 400, it means filtering by slug is not supported/configured.
        // We assume no existing article so we attempt creation.
        const is400 = err instanceof StrapiUserClientError && err.status === 400;
        if (!is400) throw err;
        console.warn("GET filters[slug] failed with 400, assuming no existing article.", err.strapiError);
      }

      const isUpdate = existing !== null && Array.isArray(existing.data) && existing.data.length > 0;
      const art = isUpdate && existing ? existing.data[0] : null;
      const idParam = art ? (art.documentId ?? String(art.id)) : null;

      // Helper to attempt the POST or PUT request
      const executeRequest = async (data: any) => {
        if (isUpdate && idParam) {
          return await request<StrapiSingleResponse<StrapiArticle>>(
            baseUrl, token, "PUT", `/${collection}/${idParam}`, data
          );
        } else {
          return await request<StrapiSingleResponse<StrapiArticle>>(
            baseUrl, token, "POST", `/${collection}`, data
          );
        }
      };

      // Payload variants in decreasing order of custom fields
      const payloads = [
        fullPayload, // Attempt 1: All fields (minus source_blog_id)
        {            // Attempt 2: Standard blog fields
          title:            payload.title,
          slug:             payload.slug,
          content:          payload.content,
          excerpt:          payload.excerpt,
          meta_description: payload.meta_description,
          cover_image_url:  payload.cover_image_url,
        },
        {            // Attempt 3: Bare minimum fields
          title:   payload.title,
          slug:    payload.slug,
          content: payload.content,
        }
      ];

      let lastErr: any = null;
      for (let i = 0; i < payloads.length; i++) {
        try {
          const res = await withRetry(() => executeRequest(payloads[i]));
          if (!res || !res.data) {
            throw new StrapiUserClientError(
              200,
              `Unexpected response structure from Strapi (missing "data" object)`
            );
          }
          return {
            documentId: res.data.documentId ?? String(res.data.id),
            slug: (res.data.attributes?.slug ?? res.data.slug) ?? payload.slug,
          };
        } catch (err: any) {
          lastErr = err;
          // Only fallback on 400 Bad Request (which indicates schema/validation error)
          const is400 = err instanceof StrapiUserClientError && err.status === 400;
          if (!is400 || i === payloads.length - 1) {
            throw err;
          }
          console.warn(`Publish attempt ${i + 1} failed with 400, trying fallback payload...`, err.strapiError);
        }
      }
      throw lastErr;
    },
  };
}
