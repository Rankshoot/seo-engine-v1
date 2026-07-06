/**
 * Internal-link pool from the project's saved sitemap.
 *
 * The sitemap inventory (table `project_sitemap_urls`) can be large, so we never
 * feed it verbatim into a generation prompt. Instead we lexically rank the saved
 * URLs against the article topic (focus keyword + title + secondary keywords)
 * and return a small, capped, relevance-ranked subset. Ranking is deterministic
 * and zero-cost (no embeddings) — it mirrors the scoring already used by
 * `linkResolver.ts` for the post-generation rewriter.
 */

import { supabaseAdmin } from '@/lib/supabase';
import type { InternalLinkCandidate } from '@/lib/business-brief';

export interface SitemapLinkRow {
  url: string;
  path: string;
  kind: string;
  title: string;
  /** ISO <lastmod> from the sitemap, when declared. Drives the recency boost. */
  lastmod?: string | null;
}

/** True when the URL path looks like the site's Contact page. */
export function isContactPagePath(path: string): boolean {
  return /(^|\/)(contact(-us)?|contactus|get-in-touch|getintouch|reach-us|talk-to-us|book-a-(call|demo|meeting))(\/|$|\.)/i.test(
    path || ''
  );
}

const STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'are', 'how', 'what', 'why',
  'you', 'our', 'into', 'about', 'more', 'best', 'top', 'guide', 'blog', 'blogs', 'http',
  'https', 'www', 'com', 'html', 'php',
]);

function tokenize(text: string): string[] {
  return [
    ...new Set(
      (text || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter(w => w.length > 2 && !STOP.has(w))
    ),
  ];
}

/** Milliseconds in a day (recency-boost buckets). */
const DAY_MS = 86_400_000;

/**
 * Recency boost from the sitemap's <lastmod>: the freshest pages (typically
 * the latest blog posts) outrank equally-relevant older ones, so generated
 * articles interlink the site's NEWEST content instead of stale posts.
 * Bounded so recency never beats strong topical relevance (+3/+2 per token).
 */
function recencyBoost(lastmod: string | null | undefined, now = Date.now()): number {
  if (!lastmod) return 0;
  const t = Date.parse(lastmod);
  if (Number.isNaN(t) || t > now + DAY_MS) return 0;
  const ageDays = (now - t) / DAY_MS;
  if (ageDays <= 90) return 3;
  if (ageDays <= 365) return 2;
  if (ageDays <= 730) return 1;
  return 0;
}

function scoreRow(tokens: string[], row: SitemapLinkRow): number {
  let s = 0;
  const path = (row.path || '').toLowerCase();
  const title = (row.title || '').toLowerCase();
  for (const tok of tokens) {
    if (title.includes(tok)) s += 3;
    if (path.includes(tok)) s += 2;
  }
  // Bias towards real article pages over generic marketing/utility pages.
  if (row.kind === 'blog') s += 1;
  // Surface a few commercial pages (product / solution / pricing / demo) so the
  // article can link to one and end with a product-landing-page CTA, instead of
  // only ever linking to other blogs.
  if (/(product|pricing|solution|service|platform|features?|demo|book-a|get-started|sign-?up|contact)/.test(path)) s += 1;
  // Prefer the site's most recently published/updated pages.
  s += recencyBoost(row.lastmod);
  return s;
}

/** Load every saved sitemap URL for a project. */
export async function loadProjectSitemapLinks(projectId: string): Promise<SitemapLinkRow[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('project_sitemap_urls')
      .select('url, path, kind, title, lastmod')
      .eq('project_id', projectId)
      .limit(5000);
    if (!error && data) return data as SitemapLinkRow[];

    // lastmod migration not applied yet — retry without the column.
    if (error && /lastmod|schema cache|column/i.test(error.message)) {
      const { data: bare, error: bareErr } = await supabaseAdmin
        .from('project_sitemap_urls')
        .select('url, path, kind, title')
        .eq('project_id', projectId)
        .limit(5000);
      if (!bareErr && bare) return bare as SitemapLinkRow[];
    }
    return [];
  } catch {
    // Table may not exist yet (migration not run) — degrade silently.
    return [];
  }
}

export interface RankInput {
  focusKeyword?: string;
  title?: string;
  secondaryKeywords?: string[];
  /** URLs to exclude (e.g. the article's own URL). Compared loosely. */
  excludeUrls?: string[];
  limit?: number;
}

/** Rank pre-loaded sitemap rows against a topic and return link candidates. */
export function rankSitemapLinks(rows: SitemapLinkRow[], input: RankInput): InternalLinkCandidate[] {
  const limit = input.limit ?? 24;
  const tokens = tokenize(
    [input.focusKeyword, input.title, ...(input.secondaryKeywords ?? [])].filter(Boolean).join(' ')
  );

  const exclude = new Set(
    (input.excludeUrls ?? []).map(u => u.replace(/\/+$/, '').toLowerCase())
  );

  const scored = rows
    .filter(r => r.url && /^https?:\/\//i.test(r.url))
    .filter(r => !exclude.has(r.url.replace(/\/+$/, '').toLowerCase()))
    .map(r => ({ row: r, score: scoreRow(tokens, r) }));

  // When we have topic tokens, prefer scored matches but still backfill with
  // blog pages so generation always has a healthy internal-link pool. When we
  // have no tokens at all, fall back to blog-first ordering.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // tie-break 1: newer <lastmod> first — surfaces the latest blog posts.
    const aT = a.row.lastmod ? Date.parse(a.row.lastmod) : 0;
    const bT = b.row.lastmod ? Date.parse(b.row.lastmod) : 0;
    if (aT !== bT) return bT - aT;
    // tie-break 2: blog pages first, then shorter paths (usually more canonical).
    if (a.row.kind !== b.row.kind) return a.row.kind === 'blog' ? -1 : 1;
    return a.row.path.length - b.row.path.length;
  });

  const top = scored.slice(0, limit);

  // Guarantee the Contact page a seat in the pool (when the site has one):
  // the closing CTA should link to it, so it must always be available to the
  // writer even if it scored below purely-topical pages.
  if (!top.some(({ row }) => isContactPagePath(row.path))) {
    const contact = scored.find(({ row }) => isContactPagePath(row.path));
    if (contact) {
      if (top.length >= limit) top.pop();
      top.push(contact);
    }
  }

  return top.map(({ row }) => ({
    url: row.url,
    title: row.title || row.url,
    topic: isContactPagePath(row.path)
      ? 'contact page'
      : row.kind === 'blog'
        ? row.lastmod
          ? `blog post (updated ${row.lastmod.slice(0, 10)})`
          : 'blog post'
        : 'site page',
  }));
}

/** Convenience: load + rank in one call. Returns capped link candidates. */
export async function loadRankedSitemapInternalLinks(
  projectId: string,
  input: RankInput
): Promise<InternalLinkCandidate[]> {
  const rows = await loadProjectSitemapLinks(projectId);
  if (!rows.length) return [];
  return rankSitemapLinks(rows, input);
}
