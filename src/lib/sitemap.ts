/**
 * Project sitemap service.
 *
 * Turns a project's domain (or an explicit sitemap URL the user entered) into a
 * deduped, classified inventory of content URLs. Reuses the battle-tested
 * sitemap parsing in `jina.ts` (handles flat urlsets, sitemap-index recursion,
 * gzip child sitemaps, and content/taxonomy filtering) and layers on:
 *
 *   1. robots.txt `Sitemap:` discovery (most reliable for non-standard layouts)
 *   2. blog-vs-page classification (biases internal-link ranking)
 *   3. slug-derived titles (sitemaps rarely carry <title>)
 *
 * Pure data layer — no auth, no DB. The server action persists the result.
 * Every entrypoint returns a `trace` so server actions can surface a
 * client-`console.log`-able audit per AGENTS.md.
 */

import {
  crawlSitemaps,
  discoverSitemapsFromRobots,
  fetchSitemapUrls,
  isContentUrl,
  normalizeDomain,
} from './jina';

/** Hard cap on URLs we store per project. Large enough for big blogs, bounded
 *  so a runaway e-commerce sitemap can't store hundreds of thousands of rows. */
export const SITEMAP_URL_STORE_MAX = 5_000;

/** Individual blog-post path shape (mirrors jina's BLOG_PATH_REGEX intent). */
const BLOG_PATH_REGEX =
  /\/(blog|blogs|resources|articles?|posts?|insights|news|stories|learn|guides?|tutorials?|help\/articles?)\/[^/?#]+/i;

export type SitemapUrlKind = 'blog' | 'page';

export interface SitemapUrlRecord {
  url: string;
  path: string;
  kind: SitemapUrlKind;
  title: string;
  /** ISO date from the sitemap's <lastmod>, when declared. Null when unknown. */
  lastmod: string | null;
}

export interface SitemapTraceEntry {
  step: string;
  ok: boolean;
  detail?: string;
}

export type SitemapFetchStatus = 'found' | 'empty' | 'failed';

export interface SitemapFetchResult {
  /** The sitemap URL we actually resolved/used (best guess when domain-probed). */
  sitemapUrl: string;
  status: SitemapFetchStatus;
  records: SitemapUrlRecord[];
  trace: SitemapTraceEntry[];
}

function classifyKind(url: string): SitemapUrlKind {
  return BLOG_PATH_REGEX.test(url) ? 'blog' : 'page';
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return '';
  }
}

/** Derive a readable title from the URL's last slug segment. */
export function titleFromUrl(url: string): string {
  const path = pathOf(url).replace(/\/+$/, '');
  const seg = path.split('/').filter(Boolean).pop() ?? '';
  if (!seg) {
    // Homepage / root.
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }
  const words = decodeURIComponent(seg)
    .replace(/\.[a-z0-9]+$/i, '') // strip extension
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!words) return seg;
  // Title-case lightly without being obnoxious about acronyms.
  return words.replace(/\b\w/g, c => c.toUpperCase());
}

function toRecords(urls: string[], domain: string, lastmodByUrl?: Map<string, string>): SitemapUrlRecord[] {
  const host = (() => {
    try {
      return new URL(normalizeDomain(domain)).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();

  const seen = new Set<string>();
  const out: SitemapUrlRecord[] = [];
  for (const u of urls) {
    if (!/^https?:\/\//i.test(u)) continue;
    // Same-site only — never store/link off-domain URLs.
    try {
      const h = new URL(u).hostname.replace(/^www\./, '');
      if (host && h !== host && !h.endsWith(`.${host}`)) continue;
    } catch {
      continue;
    }
    const normalized = u.replace(/\/+$/, '') || u;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push({
      url: u,
      path: pathOf(u),
      kind: classifyKind(u),
      title: titleFromUrl(u),
      lastmod: lastmodByUrl?.get(u) ?? null,
    });
    if (out.length >= SITEMAP_URL_STORE_MAX) break;
  }
  return out;
}

/**
 * Resolve the best sitemap URL for a domain: robots.txt first, then the common
 * conventional locations. Returns null when none respond with content.
 */
export async function discoverSitemapUrl(
  domain: string,
  trace: SitemapTraceEntry[] = []
): Promise<string | null> {
  const base = normalizeDomain(domain);

  const robotsSitemaps = await discoverSitemapsFromRobots(domain);
  trace.push({
    step: 'robots_txt',
    ok: robotsSitemaps.length > 0,
    detail: robotsSitemaps.length ? robotsSitemaps.slice(0, 3).join(', ') : 'no Sitemap: directive',
  });
  if (robotsSitemaps.length) return robotsSitemaps[0];

  // Probe the conventional locations; return the first that yields any URLs.
  for (const candidate of [`${base}/sitemap.xml`, `${base}/sitemap_index.xml`, `${base}/sitemap-index.xml`]) {
    const urls = await crawlSitemaps([candidate], 5);
    if (urls.length) {
      trace.push({ step: 'probe', ok: true, detail: candidate });
      return candidate;
    }
  }
  trace.push({ step: 'probe', ok: false, detail: 'no conventional sitemap responded' });
  return null;
}

/**
 * Fetch + classify a project's sitemap inventory.
 *
 * @param input.domain      Project domain (used for same-site filtering + probing).
 * @param input.sitemapUrl  Explicit sitemap URL (user-entered). When omitted we
 *                          auto-discover from the domain.
 */
export async function fetchProjectSitemap(input: {
  domain: string;
  sitemapUrl?: string | null;
}): Promise<SitemapFetchResult> {
  const trace: SitemapTraceEntry[] = [];
  const domain = input.domain;

  let sitemapUrl = (input.sitemapUrl ?? '').trim();
  let urls: string[] = [];
  // url → ISO <lastmod>, filled by the crawler. Lets internal-link ranking
  // prefer the most recently published/updated pages (newest blog posts).
  const lastmodByUrl = new Map<string, string>();

  if (sitemapUrl) {
    // User gave us a specific sitemap (or index). Accumulate across everything
    // it references so a user-supplied index pulls all its child sitemaps.
    urls = await crawlSitemaps([normalizeDomain(sitemapUrl)], SITEMAP_URL_STORE_MAX, {
      stopAtFirstNonEmpty: false,
      collectLastmod: lastmodByUrl,
    });
    trace.push({ step: 'fetch_explicit', ok: urls.length > 0, detail: `${urls.length} urls from ${sitemapUrl}` });
  } else {
    // Auto-discovery path.
    const discovered = await discoverSitemapUrl(domain, trace);
    if (discovered) {
      sitemapUrl = discovered;
      const robotsSitemaps = await discoverSitemapsFromRobots(domain);
      // If robots.txt listed several sitemaps, crawl them all; otherwise crawl
      // the single discovered root.
      const roots = robotsSitemaps.length ? robotsSitemaps : [discovered];
      urls = await crawlSitemaps(roots, SITEMAP_URL_STORE_MAX, {
        stopAtFirstNonEmpty: false,
        collectLastmod: lastmodByUrl,
      });
    } else {
      // Last-ditch: jina's domain-based probing (in case discovery missed it).
      urls = await fetchSitemapUrls(domain, SITEMAP_URL_STORE_MAX);
      if (urls.length) sitemapUrl = `${normalizeDomain(domain)}/sitemap.xml`;
    }
    trace.push({ step: 'fetch_auto', ok: urls.length > 0, detail: `${urls.length} urls` });
  }

  const records = toRecords(urls.filter(isContentUrl), domain, lastmodByUrl);
  trace.push({
    step: 'classify',
    ok: records.length > 0,
    detail: `${records.length} stored (${records.filter(r => r.kind === 'blog').length} blog)`,
  });

  const status: SitemapFetchStatus = records.length > 0 ? 'found' : sitemapUrl ? 'empty' : 'failed';

  return { sitemapUrl, status, records, trace };
}
