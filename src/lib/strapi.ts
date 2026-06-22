/**
 * Strapi REST client — server-only.
 * Never import this from client components.
 *
 * Each client project connects ONE Strapi instance by providing:
 *   - baseUrl  e.g. "https://cms.taggd.in"
 *   - token    API token (Content-API, read-write)
 *
 * The Article collection must have these fields set up in Strapi:
 *   seo_engine_blog_id (Short Text, Unique)
 *   title, slug, body (Long Text), meta_description (Long Text)
 *   focus_keyword (Short Text), article_type (Enumeration: blog|ebook|whitepaper)
 *   tags (JSON), seo_score (Integer), author (Short Text), source_url (Short Text)
 *   internal_links (JSON, optional), external_links (JSON, optional)
 */

import type { Blog } from '@/lib/types';

export type StrapiAllowedType = 'blog' | 'ebook' | 'whitepaper';

export const STRAPI_ALLOWED_TYPES: StrapiAllowedType[] = ['blog', 'ebook', 'whitepaper'];

export interface StrapiUpsertResult {
  documentId: string;
  strapiAdminUrl: string;
}

/** Build the Article payload from a Blog row. publishedAt is always null (draft). */
export function mapBlogToStrapiArticle(blog: Blog): Record<string, unknown> {
  const b = blog as unknown as Record<string, unknown>;
  return {
    seo_engine_blog_id: blog.id,
    title:              blog.title,
    slug:               blog.slug || blog.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    body:               blog.content,
    meta_description:   blog.meta_description ?? '',
    focus_keyword:      blog.target_keyword ?? '',
    article_type:       blog.content_type ?? 'blog',
    seo_score:          b['seo_score'] != null ? b['seo_score'] : null,
    author:             b['author'] ?? null,
    source_url:         blog.source_url ?? null,
    tags:               Array.isArray(b['tags']) ? b['tags'] : [],
    ...(blog.internal_links?.length ? { internal_links: blog.internal_links } : {}),
    ...(blog.external_links?.length ? { external_links: blog.external_links } : {}),
    publishedAt:        null,
  };
}

/** Find an existing Article by seo_engine_blog_id. Returns documentId or null. */
async function findArticle(baseUrl: string, token: string, blogId: string): Promise<string | null> {
  const url = `${baseUrl}/api/articles?filters[seo_engine_blog_id][$eq]=${encodeURIComponent(blogId)}&fields[0]=id`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json() as { data?: { documentId?: string; id?: string }[] };
  const first = json.data?.[0];
  if (!first) return null;
  return first.documentId ?? String(first.id) ?? null;
}

/**
 * Create or update a Strapi Article from a Blog row.
 * Returns { documentId, strapiAdminUrl } on success, throws on failure.
 */
export async function upsertArticle(
  baseUrl: string,
  token: string,
  blog: Blog,
): Promise<StrapiUpsertResult> {
  const clean = baseUrl.replace(/\/$/, '');
  const payload = { data: mapBlogToStrapiArticle(blog) };

  const existingDocId = await findArticle(clean, token, blog.id);

  let response: Response;
  if (existingDocId) {
    response = await fetch(`${clean}/api/articles/${existingDocId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } else {
    response = await fetch(`${clean}/api/articles`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  }

  if (!response.ok) {
    let detail = '';
    try { detail = JSON.stringify(await response.json()); } catch { /* ignore */ }
    throw new Error(`Strapi ${existingDocId ? 'PUT' : 'POST'} failed: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`);
  }

  const result = await response.json() as { data?: { documentId?: string; id?: string } };
  const docId = result.data?.documentId ?? existingDocId ?? String(result.data?.id ?? '');

  return {
    documentId: docId,
    strapiAdminUrl: `${clean}/admin/content-manager/collection-types/api::article.article/${docId}`,
  };
}

/**
 * Lightweight connectivity test — fetches max 1 article.
 * Returns { ok: true } or { ok: false, error: string }.
 */
export async function testStrapiConnection(
  baseUrl: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const clean = baseUrl.replace(/\/$/, '');
    const res = await fetch(`${clean}/api/articles?pagination[limit]=1&fields[0]=id`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { ok: false, error: `Strapi returned ${res.status} ${res.statusText}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
