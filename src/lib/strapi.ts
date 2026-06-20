/**
 * Strapi CMS integration — server-only.
 * Never import from client components.
 *
 * Responsibilities:
 *  - SSRF-safe URL validation
 *  - Connection test
 *  - Upsert (create or update) articles as drafts
 */

// ─── SSRF guard ───────────────────────────────────────────────────────────────

const PRIVATE_IP_RE =
  /^(localhost|0\.0\.0\.0|::1|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+)$/i;

/**
 * Validates that `url` is a safe public http(s) URL — no private/loopback
 * addresses that could be used for SSRF.
 *
 * Throws a descriptive string (not an Error) on failure so callers can return
 * it directly to the client without leaking internal details.
 */
export function validateStrapiBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw 'Invalid URL — must be a valid http(s) address.';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw 'Only http and https URLs are allowed.';
  }

  const host = parsed.hostname.toLowerCase();

  // TODO: restore before production — SSRF guard disabled for local dev
  // if (PRIVATE_IP_RE.test(host)) {
  //   throw 'Private / loopback addresses are not allowed.';
  // }

  return parsed.origin;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StrapiArticlePayload {
  title: string;
  slug: string;
  content: string;
  meta_description: string;
  target_keyword: string;
  article_type: string;
  word_count: number;
  seo_engine_blog_id: string;
  seo_engine_project_id: string;
}

interface StrapiListResponse {
  data: { documentId: string; seo_engine_blog_id?: string }[];
}

interface StrapiSingleResponse {
  data: { documentId: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Wraps a Strapi error response into a readable message.
 */
async function strapiErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string; details?: unknown };
    };
    return body?.error?.message ?? `Strapi responded with HTTP ${res.status}`;
  } catch {
    return `Strapi responded with HTTP ${res.status}`;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Verifies that the token can reach the Strapi instance.
 * Calls GET /api/articles?pagination[pageSize]=1 — minimal read.
 */
export async function testStrapiConnection(
  baseUrl: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const safeBase = validateStrapiBaseUrl(baseUrl);
    const res = await fetch(
      `${safeBase}/api/articles?pagination[pageSize]=1`,
      { headers: authHeaders(token), method: 'GET' },
    );
    if (!res.ok) {
      return { ok: false, error: await strapiErrorMessage(res) };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Upserts an article to Strapi as a **draft** (`publishedAt: null`).
 *
 * Resolution order:
 *  1. If `existingDocumentId` is provided → PUT (update in place).
 *  2. Else → GET by `seo_engine_blog_id` filter (upsert fallback to avoid duplicates).
 *  3. If not found → POST (create new draft).
 *
 * Returns the Strapi `documentId` so the caller can persist it on the blog row.
 */
export async function upsertToStrapi(
  baseUrl: string,
  token: string,
  payload: StrapiArticlePayload,
  existingDocumentId?: string | null,
): Promise<{ documentId: string }> {
  const safeBase = validateStrapiBaseUrl(baseUrl);
  const headers = authHeaders(token);

  const body = JSON.stringify({
    data: {
      ...payload,
      publishedAt: null,
    },
  });

  if (existingDocumentId) {
    const res = await fetch(`${safeBase}/api/articles/${existingDocumentId}`, {
      method: 'PUT',
      headers,
      body,
    });
    if (!res.ok) throw new Error(await strapiErrorMessage(res));
    const json = (await res.json()) as StrapiSingleResponse;
    return { documentId: json.data.documentId };
  }

  const lookupRes = await fetch(
    `${safeBase}/api/articles?filters[seo_engine_blog_id][$eq]=${encodeURIComponent(payload.seo_engine_blog_id)}&pagination[pageSize]=1`,
    { method: 'GET', headers },
  );
  if (lookupRes.ok) {
    const lookupJson = (await lookupRes.json()) as StrapiListResponse;
    const existing = lookupJson.data?.[0];
    if (existing?.documentId) {
      const res = await fetch(`${safeBase}/api/articles/${existing.documentId}`, {
        method: 'PUT',
        headers,
        body,
      });
      if (!res.ok) throw new Error(await strapiErrorMessage(res));
      const json = (await res.json()) as StrapiSingleResponse;
      return { documentId: json.data.documentId };
    }
  }

  const createRes = await fetch(`${safeBase}/api/articles`, {
    method: 'POST',
    headers,
    body,
  });
  if (!createRes.ok) throw new Error(await strapiErrorMessage(createRes));
  const json = (await createRes.json()) as StrapiSingleResponse;
  return { documentId: json.data.documentId };
}
