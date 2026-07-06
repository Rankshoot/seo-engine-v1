/**
 * Thin wrapper around Jina Reader (https://jina.ai/reader).
 *
 * Why Jina Reader: free tier covers ~10M tokens/month, returns clean Markdown
 * with no extraction code on our side, and works by prepending `r.jina.ai/` to
 * any URL. Perfect for ingesting a handful of pages per project into the
 * Business Brief LLM.
 *
 * Set `JINA_API_KEY` in env for better rate limits (optional).
 */

import { recordJinaCall } from '@/lib/admin/logging/record-provider-call';

/**
 * Best-effort sitemap discovery. Handles two real-world shapes:
 *   1. Flat urlset  —  sitemap.xml lists every page directly.
 *   2. Sitemap index — sitemap.xml lists other sitemaps (blogs-sitemap.xml,
 *      news-and-media-sitemap.xml, etc.); each of THOSE lists the real pages.
 *
 * We recurse one level into child sitemaps (that's how Next.js, WordPress,
 * Wix, Framer, Webflow, and custom sites all lay it out today) and return
 * only URLs that look like real content pages — never `.xml` files,
 * never binary assets.
 */
export async function fetchSitemapUrls(domain: string, max = 500): Promise<string[]> {
  const base = normalizeDomain(domain);
  return crawlSitemaps(
    [`${base}/sitemap.xml`, `${base}/sitemap_index.xml`, `${base}/sitemap-index.xml`],
    max
  );
}

/**
 * Core sitemap crawler. Recurses one level into child sitemaps (sitemap-index
 * shape) and returns content-page URLs only.
 *
 * @param roots  Candidate sitemap URLs to crawl (already absolute).
 * @param max    Hard cap on returned URLs.
 * @param opts.stopAtFirstNonEmpty  When true (default) we stop after the first
 *   root that yields any URLs — used when probing alternative index locations
 *   (sitemap.xml vs sitemap_index.xml). Set false to accumulate across ALL
 *   roots — used when robots.txt lists several distinct sitemaps.
 */
export async function crawlSitemaps(
  roots: string[],
  max = 500,
  opts: {
    stopAtFirstNonEmpty?: boolean;
    /**
     * Optional collector for `<lastmod>` values: filled with url → ISO date
     * for every returned URL whose sitemap entry declared one. Lets callers
     * prefer recently-published/updated pages (e.g. newest blog posts) when
     * building internal-link pools, without changing the return shape.
     */
    collectLastmod?: Map<string, string>;
  } = {}
): Promise<string[]> {
  const stopAtFirstNonEmpty = opts.stopAtFirstNonEmpty ?? true;

  const seenSitemaps = new Set<string>();
  const seenUrls = new Set<string>();
  const out: string[] = [];

  const visit = async (url: string, depth: number): Promise<void> => {
    if (depth > 2) return;
    if (seenSitemaps.has(url)) return;
    seenSitemaps.add(url);

    let xml = '';
    try {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) return;
      xml = await res.text();
    } catch {
      return;
    }

    const locs = extractLocs(xml);
    if (opts.collectLastmod) {
      for (const [loc, lastmod] of extractLastmods(xml)) {
        if (!opts.collectLastmod.has(loc)) opts.collectLastmod.set(loc, lastmod);
      }
    }
    // Split each <loc> into: "this is another sitemap we should recurse into"
    // vs "this is a real page URL we should keep". Recognize nested sitemaps
    // by filename + content-type hint in the URL, not by the surrounding tag
    // (some generators flatten <sitemapindex>/<sitemap> vs <urlset>/<url>).
    const children: string[] = [];
    for (const loc of locs) {
      if (!isContentUrl(loc)) {
        // Could still be a child sitemap (.xml / .xml.gz), queue it.
        if (/\.xml(\.gz)?(\?|$)/i.test(loc)) children.push(loc);
        continue;
      }
      if (seenUrls.has(loc)) continue;
      seenUrls.add(loc);
      out.push(loc);
      if (out.length >= max) return;
    }

    // Cap fan-out so a huge e-commerce sitemap index (product/category/tag
    // sitemaps) doesn't pull thousands of non-blog pages. We prefer sitemaps
    // whose filename hints at blog/content.
    const prioritized = [
      ...children.filter(c => /blog|post|article|resource|insight|news|guide|learn|stor(y|ies)/i.test(c)),
      ...children.filter(c => !/blog|post|article|resource|insight|news|guide|learn|stor(y|ies)/i.test(c)),
    ].slice(0, 80);

    for (const child of prioritized) {
      if (out.length >= max) break;
      await visit(child, depth + 1);
    }
  };

  for (const root of roots) {
    if (out.length >= max) break;
    await visit(root, 0);
    if (stopAtFirstNonEmpty && out.length) break; // first sitemap that worked wins
  }

  return out.slice(0, max);
}

/**
 * Read a domain's robots.txt and return any `Sitemap:` URLs it declares.
 * This is the most reliable discovery path — many sites point robots.txt at a
 * non-standard sitemap location (e.g. /sitemap-index-1.xml, a CDN URL).
 */
export async function discoverSitemapsFromRobots(domain: string): Promise<string[]> {
  const base = normalizeDomain(domain);
  let txt = '';
  try {
    const res = await fetch(`${base}/robots.txt`, { method: 'GET' });
    if (!res.ok) return [];
    txt = await res.text();
  } catch {
    return [];
  }
  const out: string[] = [];
  const re = /^\s*sitemap:\s*(\S+)\s*$/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt))) {
    const url = m[1].trim();
    if (/^https?:\/\//i.test(url)) out.push(url);
  }
  return Array.from(new Set(out));
}

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const url = m[1].trim();
    if (url.startsWith('http')) out.push(url);
  }
  return out;
}

/**
 * Extract (loc, lastmod) pairs from a sitemap's `<url>`/`<sitemap>` blocks.
 * Only entries that actually declare a parseable `<lastmod>` are returned;
 * dates are normalized to ISO strings. Regex-based on purpose — matches the
 * rest of this file's zero-dependency sitemap handling.
 */
function extractLastmods(xml: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const blockRe = /<(?:url|sitemap)>([\s\S]*?)<\/(?:url|sitemap)>/gi;
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(xml))) {
    const inner = block[1];
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/i.exec(inner)?.[1]?.trim();
    const lastmodRaw = /<lastmod>\s*([^<]+?)\s*<\/lastmod>/i.exec(inner)?.[1]?.trim();
    if (!loc || !loc.startsWith('http') || !lastmodRaw) continue;
    const parsed = new Date(lastmodRaw);
    if (Number.isNaN(parsed.getTime())) continue;
    out.push([loc, parsed.toISOString()]);
  }
  return out;
}

/**
 * Shared "is this a real content page I should audit?" test. Reject sitemaps,
 * feeds, binary assets, and taxonomy pages (tags/categories/authors/pagination)
 * which almost never have unique rankable content.
 */
export function isContentUrl(url: string): boolean {
  if (!url || !/^https?:\/\//i.test(url)) return false;

  let path = '';
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return false;
  }

  // Never audit XML, feeds, or binary assets.
  if (/\.(xml|xml\.gz|pdf|jpe?g|png|gif|webp|svg|ico|mp4|mp3|wav|zip|tar|gz|css|js|json|txt|rss|atom)(\?|$)/i.test(path)) {
    return false;
  }
  if (/\/(sitemap|sitemap_index|feed|rss|atom)\b/i.test(path)) return false;
  // Taxonomy/pagination: these are listing pages, not content.
  if (/\/(tag|tags|category|categories|author|authors|page)\/[^/]+/i.test(path)) return false;
  if (/\/page\/\d+\/?$/i.test(path)) return false;

  return true;
}

/** Strip protocol + trailing slash so we can compose `${base}/path`. */
export function normalizeDomain(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Matches URLs that look like an *individual* blog post. Requires a slug
 * segment AFTER the blog prefix — `/blogs/workforce-forecasting/` passes,
 * `/blogs-sitemap.xml` and `/blogs` (the index) do not.
 */
const BLOG_PATH_REGEX =
  /\/(blog|blogs|resources|articles?|posts?|insights|news|stories|learn|guides?|tutorials?|help\/articles?)\/[^/?#]+/i;

/** Sitemap paths we'd expect on a site that publishes a blog. */
const BLOG_INDEX_PATHS = [
  '/blog',
  '/blogs',
  '/blog/',
  '/resources',
  '/articles',
  '/news',
  '/insights',
  '/learn',
];

/**
 * Given a user domain, pick the highest-signal URLs to scrape for the brief.
 * Always includes: homepage, marketing pages (about/product/pricing), the blog
 * index (so the LLM sees what the user has already published), and a few
 * recent blog posts. See AGENTS.md §"scrape blogs always".
 */
export async function pickBriefUrls(domain: string, limit = 10): Promise<string[]> {
  const base = normalizeDomain(domain);
  const marketing = [
    `${base}/`,
    `${base}/about`,
    `${base}/about-us`,
    `${base}/product`,
    `${base}/products`,
    `${base}/services`,
    `${base}/features`,
    `${base}/pricing`,
    `${base}/solutions`,
  ];
  const blogIndex = BLOG_INDEX_PATHS.map(p => `${base}${p}`);

  const sitemapUrls = (await fetchSitemapUrls(domain, 500)).filter(isContentUrl);
  const blogPosts = sitemapUrls.filter(u => BLOG_PATH_REGEX.test(u)).slice(0, 6);

  const ordered = [...marketing, ...blogIndex, ...blogPosts, ...sitemapUrls];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of ordered) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= limit) break;
  }
  return out;
}

/** Upper bound for blog-post URLs we keep per project (brief + Content Health). */
export const BLOG_URL_INVENTORY_MAX = 10_000;

/**
 * Return every blog-post URL we can find on the user's domain. Used by the
 * Content Health audit, which wants the full inventory (not just the handful
 * we'd scrape for the brief).
 */
export async function fetchBlogUrls(domain: string, max = BLOG_URL_INVENTORY_MAX): Promise<string[]> {
  const base = normalizeDomain(domain);
  // Pull enough raw sitemap URLs that mixed indexes (pages + products + posts)
  // don't exhaust the cap before we reach blog-specific sitemaps.
  const sitemapUrls = (await fetchSitemapUrls(domain, Math.min(50_000, Math.max(5_000, max * 5)))).filter(
    isContentUrl
  );

  // Primary pass: URLs that clearly live under a blog-style prefix.
  const primary = sitemapUrls.filter(u => BLOG_PATH_REGEX.test(u));

  // Fallback: if the site doesn't use a standard /blog/ prefix (Framer/Webflow
  // sites often expose posts at /p/slug or /posts/slug, and some CMSs put them
  // right at the root), keep URLs that look like article-slug pages based on
  // path shape — at least one path segment, dashed slug, not the root.
  const slugShape = /^\/[a-z0-9][a-z0-9-]{3,}(?:\/|$)/i;
  const isArticleish = (u: string) => {
    try {
      const path = new URL(u).pathname;
      if (!slugShape.test(path)) return false;
      // Exclude obvious marketing/utility routes.
      if (/^\/(about|contact|pricing|login|signup|sign-up|sign-in|careers|privacy|terms|legal|cookie|support|help|faq|team|demo|api)(\/|$)/i.test(path)) return false;
      return true;
    } catch {
      return false;
    }
  };
  const fallback = primary.length >= 3 ? [] : sitemapUrls.filter(isArticleish);

  const combined = [...primary, ...fallback];

  // Canonicalize host + dedupe.
  const host = (() => {
    try {
      return new URL(base).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();

  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of combined) {
    try {
      const h = new URL(u).hostname.replace(/^www\./, '');
      if (host && h !== host && !h.endsWith(`.${host}`)) continue;
    } catch {
      continue;
    }
    // Normalize trailing slash so /blogs/foo and /blogs/foo/ aren't audited twice.
    const normalized = u.replace(/\/+$/, '');
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Fetch a public URL as Markdown via Jina Reader (`r.jina.ai/...`).
 * Bypasses many WAF / bot blocks that return 403 to server-side fetch.
 */
export async function readUrlViaJinaReader(
  url: string,
  opts: { timeoutMs?: number } = {}
): Promise<{ ok: boolean; markdown: string; error?: string }> {
  const normalized = normalizeDomain(url.trim());
  const readerBase = 'https://r.jina.ai/';
  const readerUrl = readerBase + normalized;

  const timeoutMs = opts.timeoutMs ?? 25_000;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  let result: { ok: boolean; markdown: string; error?: string } = {
    ok: false,
    markdown: '',
    error: 'unknown',
  };

  try {
    const headers: Record<string, string> = {
      Accept: 'text/markdown,text/plain,*/*',
      'X-Return-Format': 'markdown',
      'X-Md-Heading-Style': 'atx',
    };
    const key = process.env.JINA_API_KEY?.trim();
    if (key) headers.Authorization = `Bearer ${key}`;

    const res = await fetch(readerUrl, { signal: controller.signal, headers });
    if (!res.ok) {
      result = { ok: false, markdown: '', error: `Jina Reader HTTP ${res.status}` };
      return result;
    }
    const markdown = (await res.text()).trim();
    if (!markdown || markdown.length < 40) {
      result = { ok: false, markdown: '', error: 'Jina Reader returned empty body' };
      return result;
    }
    result = { ok: true, markdown };
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result = {
      ok: false,
      markdown: '',
      error: msg.includes('abort') ? 'Jina Reader timeout' : msg,
    };
    return result;
  } finally {
    clearTimeout(id);
    recordJinaCall(url, result.ok, Date.now() - started, result.error);
  }
}
