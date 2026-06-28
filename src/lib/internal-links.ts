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
  return s;
}

/** Load every saved sitemap URL for a project. */
export async function loadProjectSitemapLinks(projectId: string): Promise<SitemapLinkRow[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('project_sitemap_urls')
      .select('url, path, kind, title')
      .eq('project_id', projectId)
      .limit(5000);
    if (error || !data) return [];
    return data as SitemapLinkRow[];
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
    // tie-break: blog pages first, then shorter paths (usually more canonical).
    if (a.row.kind !== b.row.kind) return a.row.kind === 'blog' ? -1 : 1;
    return a.row.path.length - b.row.path.length;
  });

  return scored.slice(0, limit).map(({ row }) => ({
    url: row.url,
    title: row.title || row.url,
    topic: row.kind === 'blog' ? 'blog post' : 'site page',
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
