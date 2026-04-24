/**
 * Lightweight SEO-focused crawler. Fetches a single HTML page (no JS rendering)
 * and regex-extracts the handful of signals the DataForSEO pipeline needs to
 * build its ProjectContext: title, meta description, H1/H2/H3, nav/header text,
 * main paragraph copy, internal-link URL slugs, anchor texts, and the most
 * frequent 2–3-word phrases.
 *
 * Intentionally dependency-free (no cheerio / jsdom) — the output is always a
 * "best-effort snapshot" fed into a heuristic scorer, so imperfect HTML parsing
 * is fine. Size- and time-bounded so it can run inside a server action without
 * blocking the request path if the target is huge / slow / down.
 */

export interface WebsiteCrawlResult {
  /** Normalised input URL (https:// prepended if missing). */
  url: string;
  /** Effective URL after redirects (empty when the request failed). */
  finalUrl: string;
  /** HTTP status code (0 when fetch threw before getting a response). */
  status: number;
  title: string;
  metaDescription: string;
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
  };
  /** Text inside every `<nav>` / `<header>` block on the page. */
  navText: string[];
  /** Mid-length `<p>` blocks — used for phrase mining, not for display. */
  paragraphs: string[];
  /** Slugs extracted from same-host internal links (e.g. "hire-software-engineers"). */
  urlSlugs: string[];
  /** Raw anchor texts from the navigation / body (useful for detecting services). */
  linkTexts: string[];
  /** Top 2–3-word phrases across the page, frequency-ranked. */
  topPhrases: string[];
  /** Total words extracted from the visible text corpus (headings + paras + nav). */
  wordCount: number;
  /** Populated when the fetch failed or parsing short-circuited. */
  error?: string;
}

const MAX_BODY_BYTES = 500 * 1024; // 500 KB is ample for an SEO homepage crawl
const CRAWL_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; SEOEngineBot/1.0; +https://seo-engine.local)';

/** Make a WebsiteCrawlResult stub with empty defaults. */
function emptyResult(url: string, finalUrl = '', status = 0): WebsiteCrawlResult {
  return {
    url,
    finalUrl: finalUrl || url,
    status,
    title: '',
    metaDescription: '',
    headings: { h1: [], h2: [], h3: [] },
    navText: [],
    paragraphs: [],
    urlSlugs: [],
    linkTexts: [],
    topPhrases: [],
    wordCount: 0,
  };
}

export async function crawlWebsite(input: string): Promise<WebsiteCrawlResult> {
  const url = normalizeUrl(input);
  if (!url) return { ...emptyResult(input || ''), error: 'empty or invalid url' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CRAWL_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);

    const finalUrl = res.url || url;
    if (!res.ok) {
      return { ...emptyResult(url, finalUrl, res.status), error: `HTTP ${res.status}` };
    }

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct && !ct.includes('html') && !ct.includes('xml')) {
      return {
        ...emptyResult(url, finalUrl, res.status),
        error: `non-html content-type: ${ct}`,
      };
    }

    // Stream + cap the body so a 10MB page can't pin the server.
    const html = await readCapped(res, MAX_BODY_BYTES);
    return parseHtml(url, finalUrl, res.status, html);
  } catch (e) {
    clearTimeout(timer);
    return {
      ...emptyResult(url),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function normalizeUrl(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return '';
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withScheme).toString();
  } catch {
    return '';
  }
}

async function readCapped(res: Response, cap: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    return text.length > cap * 2 ? text.slice(0, cap * 2) : text;
  }
  const decoder = new TextDecoder('utf-8');
  let total = 0;
  let out = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (total >= cap) {
      try { await reader.cancel(); } catch { /* ignore */ }
      break;
    }
  }
  out += decoder.decode();
  return out;
}

function parseHtml(
  url: string,
  finalUrl: string,
  status: number,
  html: string
): WebsiteCrawlResult {
  const out = emptyResult(url, finalUrl, status);

  // Strip <script>, <style>, <noscript> so their text can't leak into analysis.
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const titleMatch = cleaned.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) out.title = decode(stripTags(titleMatch[1]));

  const metaMatch =
    cleaned.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
    cleaned.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i) ||
    cleaned.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i);
  if (metaMatch) out.metaDescription = decode(metaMatch[1]);

  out.headings.h1 = extractTagText(cleaned, 'h1', 10);
  out.headings.h2 = extractTagText(cleaned, 'h2', 30);
  out.headings.h3 = extractTagText(cleaned, 'h3', 50);

  for (const m of cleaned.matchAll(/<(nav|header)[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = decode(stripTags(m[2])).replace(/\s+/g, ' ').trim();
    if (text) out.navText.push(text.slice(0, 800));
    if (out.navText.length >= 6) break;
  }

  const slugSet = new Set<string>();
  const textSet = new Set<string>();
  let baseUrl: URL | null = null;
  try { baseUrl = new URL(finalUrl || url); } catch { /* ignore */ }

  for (const m of cleaned.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1];
    const text = decode(stripTags(m[2])).replace(/\s+/g, ' ').trim();
    if (text.length > 1 && text.length < 60) textSet.add(text);
    if (!baseUrl) continue;
    try {
      const abs = new URL(href, baseUrl);
      if (abs.hostname !== baseUrl.hostname) continue;
      for (const seg of abs.pathname.split('/').filter(Boolean)) {
        const clean = seg
          .toLowerCase()
          .replace(/\.\w+$/, '')
          .replace(/[-_]+/g, ' ')
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (!clean) continue;
        if (/^\d+$/.test(clean)) continue;
        if (clean.length < 3 || clean.length > 80) continue;
        slugSet.add(clean);
      }
    } catch { /* malformed href — ignore */ }
  }
  out.urlSlugs = [...slugSet].slice(0, 80);
  out.linkTexts = [...textSet].slice(0, 80);

  for (const m of cleaned.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = decode(stripTags(m[1])).replace(/\s+/g, ' ').trim();
    if (text.length >= 30 && text.length <= 500) out.paragraphs.push(text);
    if (out.paragraphs.length >= 60) break;
  }

  const corpus = [
    out.title,
    out.metaDescription,
    ...out.headings.h1,
    ...out.headings.h2,
    ...out.headings.h3,
    ...out.navText,
    ...out.linkTexts,
    ...out.paragraphs,
    ...out.urlSlugs,
  ]
    .join(' ')
    .toLowerCase();

  out.wordCount = corpus.split(/\s+/).filter(Boolean).length;
  out.topPhrases = extractTopPhrases(corpus, { ngrams: [2, 3], top: 40 });

  return out;
}

function extractTagText(html: string, tag: string, cap: number): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out: string[] = [];
  for (const m of html.matchAll(re)) {
    const text = decode(stripTags(m[1])).replace(/\s+/g, ' ').trim();
    if (text.length >= 2 && text.length <= 250) out.push(text);
    if (out.length >= cap) break;
  }
  return out;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ');
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => {
      const cp = Number(n);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : '';
    })
    .trim();
}

// Minimal English stopword list for phrase mining. Kept small on purpose —
// aggressive filtering drops useful low-content niche words like "IT".
const PHRASE_STOPWORDS = new Set([
  'the','a','an','and','or','of','for','to','in','on','is','are','was','were',
  'be','as','at','by','it','this','that','with','from','we','you','our','your',
  'their','his','her','has','have','had','will','can','may','not','but','if',
  'so','do','does','did','which','who','what','when','where','how','why','all',
  'any','some','more','most','other','new','also','about','into','over','under',
  'out','one','two','three','up','down','very','just','than','then','here',
  'there','they','them','i','me','my','no','yes','us','same','own',
]);

export function extractTopPhrases(
  text: string,
  opts: { ngrams: number[]; top: number }
): string[] {
  const words = text
    .replace(/[^a-z0-9\s]/gi, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [];

  const counts = new Map<string, number>();
  for (const n of opts.ngrams) {
    for (let i = 0; i <= words.length - n; i++) {
      const slice = words.slice(i, i + n);
      // Drop n-grams that lean entirely on short tokens or stopwords.
      if (slice.some(w => w.length < 3 && !/^[a-z]{2}$/.test(w))) continue;
      if (slice.every(w => PHRASE_STOPWORDS.has(w))) continue;
      if (slice.some(w => PHRASE_STOPWORDS.has(w) && slice.length === 2)) continue;
      const phrase = slice.join(' ');
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, opts.top)
    .map(([p]) => p);
}
