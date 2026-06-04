/**
 * Helpers for normalizing generated blog markdown so the preview and the
 * downloaded file always match.
 *
 * Responsibilities:
 *   1. Drop dead/uncredible external links (HEAD/GET probe) so blogs never
 *      ship with `[anchor](https://broken.example/404)`.
 *   2. Cap rendered images at 2 (hero + one supporting visual) and strip the
 *      LLM's leftover `![...](IMAGE_PLACEHOLDER)` artifacts that would
 *      otherwise show up as broken-image icons.
 *   3. Produce a clean, slug-safe filename for downloads.
 *
 * Everything here is intentionally framework-agnostic — the same primitives
 * are shared by `blog-actions.ts` (server) and `export.ts` (client).
 */

/** Hard cap on rendered images per blog. Matches the product spec. */
export const MAX_IMAGES_PER_BLOG = 2;

/**
 * `react-markdown` does not render arbitrary HTML; `<a name="…"></a>` shows as
 * literal text. Strip empty fragment anchors (`name` / `id`, no `href`).
 */
export function stripEmptyFragmentAnchorTags(markdown: string): string {
  let out = markdown.replace(/<a\b[^>]*>\s*<\/a>/gi, full => {
    if (/\bhref\s*=/i.test(full)) return full;
    if (/\bname\s*=/i.test(full) || /\bid\s*=/i.test(full)) return '';
    return full;
  });
  out = out.replace(/<a\b(?![^>]*\bhref\s*=)(?=[^>]*\b(?:name|id)\s*=)[^>]+\/>/gi, '');
  return out;
}

/**
 * Domains we consider authoritative for SEO citations. We allow these
 * unconditionally even if they fail a probe — large news/research sites
 * occasionally block HEAD requests, but a Gartner / WEF / .gov citation is
 * almost always real.
 */
const CREDIBLE_DOMAINS = new Set([
  'gartner.com',
  'forrester.com',
  'mckinsey.com',
  'deloitte.com',
  'accenture.com',
  'bcg.com',
  'ey.com',
  'pwc.com',
  'kpmg.com',
  'ibm.com',
  'oracle.com',
  'salesforce.com',
  'microsoft.com',
  'google.com',
  'developers.google.com',
  'cloud.google.com',
  'aws.amazon.com',
  'docs.aws.amazon.com',
  'azure.microsoft.com',
  'docs.microsoft.com',
  'learn.microsoft.com',
  'developer.mozilla.org',
  'reactjs.org',
  'react.dev',
  'nextjs.org',
  'vuejs.org',
  'nodejs.org',
  'python.org',
  'docs.python.org',
  'kubernetes.io',
  'github.com',
  'stackoverflow.com',
  'statista.com',
  'forbes.com',
  'hbr.org',
  'wsj.com',
  'nytimes.com',
  'ft.com',
  'reuters.com',
  'bloomberg.com',
  'cnbc.com',
  'businessinsider.com',
  'techcrunch.com',
  'wired.com',
  'theverge.com',
  'arstechnica.com',
  'shrm.org',
  'linkedin.com',
  'business.linkedin.com',
  'weforum.org',
  'oecd.org',
  'worldbank.org',
  'imf.org',
  'who.int',
  'un.org',
  'gov.uk',
  'europa.eu',
  'ftc.gov',
  'sec.gov',
  'nist.gov',
  'nih.gov',
  'cdc.gov',
  'bls.gov',
  'census.gov',
]);

/**
 * Domains we explicitly ban — community/UGC sites where the LLM tends to
 * hallucinate non-existent threads/articles.
 */
const BLOCKED_DOMAINS = new Set([
  'medium.com',
  'reddit.com',
  'quora.com',
  'yahoo.com',
  'answers.yahoo.com',
  'wikihow.com',
]);

function getHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Normalize `project.domain` (often stored as `taggd.in`) or a full site URL to a
 * comparable hostname: lowercase, no `www.`. Required because `new URL('taggd.in')`
 * throws, which previously made every `https://…` link look "external" during
 * sanitization when the project domain had no protocol.
 */
export function normalizeSiteHost(domainOrUrl: string): string {
  const raw = (domainOrUrl || '').trim();
  if (!raw) return '';
  const hostOnly = raw
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .split('?')[0];
  try {
    return new URL(`https://${hostOnly}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return hostOnly.toLowerCase();
  }
}

/** True when `url` is absolute http(s) and its host matches the project site. */
export function urlMatchesProjectSite(url: string, projectDomainRaw: string): boolean {
  const own = normalizeSiteHost(projectDomainRaw);
  if (!own || !/^https?:\/\//i.test(url)) return false;
  const h = getHost(url);
  if (!h) return false;
  return h === own || h.endsWith(`.${own}`);
}

/** Move same-site URLs out of `external` for sidebar / UI (does not mutate DB). */
export function reclassifyBlogLinkSidebarLists(
  external: string[],
  internal: string[],
  projectDomainRaw: string | undefined | null
): { externalLinks: string[]; internalLinks: string[] } {
  const raw = (projectDomainRaw ?? '').trim();
  if (!raw) {
    return { externalLinks: [...external], internalLinks: [...internal] };
  }
  const internalOut = new Set(internal);
  const externalOut: string[] = [];
  for (const url of external) {
    if (urlMatchesProjectSite(url, raw)) internalOut.add(url);
    else externalOut.push(url);
  }
  return { externalLinks: externalOut, internalLinks: [...internalOut] };
}

/** A domain is credible if it's on the allow-list or ends in `.gov` / `.edu`. */
export function isCredibleDomain(url: string): boolean {
  const host = getHost(url);
  if (!host) return false;
  if (BLOCKED_DOMAINS.has(host)) return false;
  if (CREDIBLE_DOMAINS.has(host)) return true;
  if (/\.(gov|edu|ac\.[a-z]{2}|edu\.[a-z]{2}|gov\.[a-z]{2})$/.test(host)) return true;
  // Subdomain match against the allow-list (e.g. `developers.google.com`).
  for (const d of CREDIBLE_DOMAINS) {
    if (host === d || host.endsWith(`.${d}`)) return true;
  }
  return false;
}

const VALIDATION_CACHE = new Map<string, { valid: boolean; checkedAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function isHardReject(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; SEOEngineBot/1.0; +https://seo-engine.app/bot)',
        accept: 'text/html,*/*',
      },
    });
    clearTimeout(timeout);
    
    if (res.status === 404 || res.status === 410 || res.status >= 500) {
      return true;
    }
    
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) {
      const text = await res.text();
      const firstKb = text.slice(0, 4000).toLowerCase();
      const errorMarkers = [
        '404 not found',
        'page not found',
        'page cannot be found',
        '404 error',
        'error 404',
        'we can\'t find that page',
        'oops! page not found',
        'cannot find the page',
        'site under construction',
      ];
      if (errorMarkers.some(m => firstKb.includes(m))) {
        return true;
      }
    }
    return false;
  } catch {
    // Network/timeout failure is not a hard reject (could be transient)
    return false;
  }
}

/**
 * Probe a URL with a short timeout. We try HEAD first (cheap), then GET on
 * 405 because some CDNs don't allow HEAD. Anything outside 2xx/3xx is
 * considered broken. Network errors short-circuit to `false`.
 */
export async function validateExternalUrl(url: string, timeoutMs = 5000, deepCheck = true): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return false;

  const now = Date.now();
  const cached = VALIDATION_CACHE.get(url);
  if (cached && now - cached.checkedAt < CACHE_TTL_MS) {
    return cached.valid;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let ok = false;
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // A real-looking UA stops most bot blockers from returning 403.
        'user-agent':
          'Mozilla/5.0 (compatible; SEOEngineBot/1.0; +https://seo-engine.app/bot)',
        accept: '*/*',
      },
    });
    if (res.status === 405 || res.status === 403 || res.status === 501) {
      // Some servers block HEAD — retry with GET (no body read).
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent':
            'Mozilla/5.0 (compatible; SEOEngineBot/1.0; +https://seo-engine.app/bot)',
          accept: 'text/html,*/*',
        },
      });
    }
    
    ok = res.status >= 200 && res.status < 400;

    if (ok && deepCheck) {
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('text/html') && res.status === 200) {
        const bodyText = await res.text();
        const firstKb = bodyText.slice(0, 4000).toLowerCase();
        const errorMarkers = [
          '404 not found',
          'page not found',
          'page cannot be found',
          '404 error',
          'error 404',
          'we can\'t find that page',
          'oops! page not found',
          'cannot find the page',
          'site under construction',
        ];
        if (errorMarkers.some(m => firstKb.includes(m))) {
          ok = false;
        }
      }
    }
  } catch {
    ok = false;
  } finally {
    clearTimeout(timeout);
  }

  VALIDATION_CACHE.set(url, { valid: ok, checkedAt: now });
  return ok;
}

/**
 * Validate a list of URLs in parallel with a small concurrency cap. Returns
 * a Set of urls that passed validation.
 */
export async function validateExternalUrls(urls: string[]): Promise<Set<string>> {
  const unique = [...new Set(urls)];
  const results = await Promise.allSettled(
    unique.map(async (url) => {
      const credible = isCredibleDomain(url);
      const ok = await validateExternalUrl(url);
      
      if (ok) return [url, true] as const;
      
      if (credible) {
        const hardReject = await isHardReject(url);
        return [url, !hardReject] as const;
      }
      return [url, ok] as const;
    })
  );
  const live = new Set<string>();
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value[1]) live.add(r.value[0]);
  }
  return live;
}

/**
 * Validate a single image URL. `data:` URIs are trusted since they're
 * embedded inline (they can't 404). HTTP(s) images are HEAD-probed and we
 * additionally verify the response advertises an image content-type when
 * the server returns it.
 */
export async function validateImageUrl(url: string, timeoutMs = 5000): Promise<boolean> {
  if (url.startsWith('data:image/')) return true;
  if (!/^https?:\/\//i.test(url)) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (compatible; SEOEngineBot/1.0; +https://seo-engine.app/bot)',
        accept: 'image/*,*/*',
      },
    });
    if (res.status < 200 || res.status >= 400) return false;
    const ct = res.headers.get('content-type') ?? '';
    return ct === '' || ct.startsWith('image/');
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

interface SanitizeResult {
  content: string;
  externalLinks: string[];
  internalLinks: string[];
  removedLinks: string[];
}

interface SanitizeOpts {
  ownDomain?: string;
  maxImages?: number;
}

/**
 * Server-side sanitizer. Walks the markdown once and:
 *   1. Removes `![...](IMAGE_PLACEHOLDER)` artifacts the LLM left behind.
 *   2. Caps rendered images at `maxImages` (default 2). Extras are dropped
 *      from the markdown so the preview and the export agree.
 *   3. Validates external links and rewrites broken `[text](url)` to plain
 *      `text`, preserving the surrounding sentence.
 *   4. Returns a fresh `external_links` / `internal_links` array reflecting
 *      what's actually still in the content.
 */
export async function sanitizeBlogContent(
  markdown: string,
  opts: SanitizeOpts = {}
): Promise<SanitizeResult> {
  const ownHost = opts.ownDomain?.trim() ? normalizeSiteHost(opts.ownDomain) : null;
  const maxImages = opts.maxImages ?? MAX_IMAGES_PER_BLOG;

  // Phase 0 — empty `<a name|id>` tags (no href) leak as visible text in Markdown preview.
  let next = stripEmptyFragmentAnchorTags(markdown);

  // Phase 1 — strip placeholder images. These are LLM artifacts, never real.
  next = next.replace(
    /!\[[^\]]*\]\(\s*IMAGE_PLACEHOLDER\s*\)/gi,
    ''
  );

  // Phase 2 — collect every image and cap to `maxImages`. We keep the FIRST
  // N images encountered (which lines up with the hero-then-section order
  // already produced by `insertBlogImages`). The rest are removed.
  let imageCount = 0;
  next = next.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (full, _alt: string, url: string) => {
    const trimmed = url.trim();
    // `data:` URIs are valid by construction; `http(s)://` are kept now and
    // will be validated below. Anything else (empty, bare placeholder) is
    // dropped immediately.
    const looksValid =
      trimmed.startsWith('data:image/') || /^https?:\/\//i.test(trimmed);
    if (!looksValid) return '';
    if (imageCount >= maxImages) return '';
    imageCount += 1;
    return full;
  });

  // Phase 3 — validate any HTTP(s) images that survived. data: URLs skip the
  // network probe (`validateImageUrl` returns true immediately). Failed
  // HTTP images are removed entirely.
  const httpImageRegex = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
  const httpImageUrls: string[] = [];
  for (const m of next.matchAll(httpImageRegex)) httpImageUrls.push(m[2]);

  if (httpImageUrls.length) {
    const checks = await Promise.allSettled(
      httpImageUrls.map(u => validateImageUrl(u))
    );
    const dead = new Set<string>();
    httpImageUrls.forEach((u, i) => {
      const c = checks[i];
      if (c.status !== 'fulfilled' || !c.value) dead.add(u);
    });
    if (dead.size) {
      next = next.replace(
        /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g,
        (full, _alt: string, url: string) => (dead.has(url) ? '' : full)
      );
    }
  }

  // Phase 4 — collect every external and internal link and validate.
  // Broken links are rewritten to plain text so we don't leave dangling brackets.
  const linkRegex = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  const externalUrls: string[] = [];
  const internalUrls: string[] = [];

  const getInternalProbeUrl = (url: string): string | null => {
    if (!ownHost) return null;
    const trimmed = url.trim();
    if (trimmed.startsWith('#')) return null;
    if (/^https?:\/\//i.test(trimmed)) {
      const host = getHost(trimmed);
      if (host && (host === ownHost || host.endsWith(`.${ownHost}`))) {
        return trimmed;
      }
      return null;
    }
    if (trimmed.startsWith('/') || !trimmed.includes(':')) {
      const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
      return `https://${ownHost}${cleanPath}`;
    }
    return null;
  };

  for (const m of next.matchAll(linkRegex)) {
    const idx = m.index ?? 0;
    if (idx > 0 && next[idx - 1] === '!') continue;
    const url = m[2].trim();
    const internalProbe = getInternalProbeUrl(url);
    if (internalProbe) {
      internalUrls.push(url);
    } else if (/^https?:\/\//i.test(url)) {
      externalUrls.push(url);
    }
  }

  const liveExternals = await validateExternalUrls(externalUrls);
  const liveInternals = new Set<string>();

  if (internalUrls.length && ownHost) {
    const uniqueInternals = [...new Set(internalUrls)];
    const internalProbeResults = await Promise.allSettled(
      uniqueInternals.map(async (url) => {
        const probeUrl = getInternalProbeUrl(url)!;
        const ok = await validateExternalUrl(probeUrl);
        return [url, ok] as const;
      })
    );
    for (const r of internalProbeResults) {
      if (r.status === 'fulfilled' && r.value[1]) {
        liveInternals.add(r.value[0]);
      }
    }
  }

  const removed: string[] = [];

  next = next.replace(
    /(!?)\[([^\]]+)\]\(([^)\s]+)\)/g,
    (full, bang: string, anchor: string, url: string) => {
      if (bang === '!') return full;
      const trimmed = url.trim();
      const internalProbe = getInternalProbeUrl(trimmed);
      if (internalProbe) {
        if (liveInternals.has(trimmed)) return full;
        removed.push(trimmed);
        return anchor;
      }
      if (/^https?:\/\//i.test(trimmed)) {
        if (liveExternals.has(trimmed)) return full;
        removed.push(trimmed);
        return anchor;
      }
      return full;
    }
  );

  // Phase 5 — rebuild link arrays from the post-sanitization markdown so the
  // sidebar counts and the saved arrays agree with what's actually there.
  const externalLinks = new Set<string>();
  const internalLinks = new Set<string>();
  for (const m of next.matchAll(linkRegex)) {
    const idx = m.index ?? 0;
    if (idx > 0 && next[idx - 1] === '!') continue;
    const url = m[2].trim();
    if (/^https?:\/\//i.test(url)) {
      const host = getHost(url);
      if (host && ownHost && (host === ownHost || host.endsWith(`.${ownHost}`))) {
        internalLinks.add(url);
      } else {
        externalLinks.add(url);
      }
    } else if (url.startsWith('/')) {
      internalLinks.add(url);
    }
  }

  // Tidy stray blank lines a sanitization step may have introduced.
  next = next.replace(/\n{3,}/g, '\n\n').trim();

  return {
    content: next,
    externalLinks: [...externalLinks],
    internalLinks: [...internalLinks],
    removedLinks: removed,
  };
}

/** Word count for markdown bodies (matches blog-actions heuristic). */
export function countWordsInMarkdown(markdown: string): number {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/g, ' ')
    .replace(/[#>*_\-[\]()`~]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Generate a download-safe filename from a blog title or slug. Strips path
 * separators and shell-unsafe characters, collapses whitespace, and trims to
 * a sensible length so the OS save dialog renders cleanly.
 */
export function safeFilename(input: string, fallback = 'blog-post'): string {
  const cleaned = (input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .toLowerCase()
    .slice(0, 80);
  return cleaned || fallback;
}

/** Mapping from internal export format → file extension + MIME type. */
export const EXPORT_FILE_INFO = {
  markdown: { ext: 'md',   mime: 'text/markdown' },
  html:     { ext: 'html', mime: 'text/html' },
  txt:      { ext: 'txt',  mime: 'text/plain' },
  docx: {
    ext:  'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
} as const;
