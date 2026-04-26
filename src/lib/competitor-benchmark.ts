/**
 * Competitor Benchmarking Engine — phase 5.
 *
 * Orchestrates:
 *   1. `discoverCompetitors` — rank real SEO competitors from Serper SERPs.
 *   2. `extractCompetitorContent` — Hybrid Scraper → structural snapshot of a page.
 *   3. `extractKeywordsFromContent` — Gemini extraction of primary / long-tail / questions.
 *   4. `benchmarkContentQuality` — averages + recommendations across scraped pages.
 *   5. `scoreOpportunity` — composite 0–100 opportunity score.
 *
 * All three heavy-lift vendors are already in use in this repo:
 *   • Serper — `src/lib/research.ts`
 *   • Hybrid Scraper — `src/services/hybridScraper.ts`
 *   • Gemini — `src/lib/gemini.ts`
 * We don't introduce new vendors here; we stitch the existing ones.
 */

import { hybridReadUrl } from '../services/hybridScraper';
import { geminiGenerate } from './gemini';
import type {
  BenchmarkAverages,
  CompetitorPageSnapshot,
  GapType,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Trace (mirrors `DataForSEOTraceEntry` pattern so the UI can console.log it).
// ─────────────────────────────────────────────────────────────────────────────

export interface BenchmarkTraceEntry {
  label: string;
  url?: string;
  ok: boolean;
  ms?: number;
  info?: Record<string, unknown>;
  error?: string;
}

function traceOk(trace: BenchmarkTraceEntry[], label: string, info: Record<string, unknown> = {}, url?: string) {
  trace.push({ label, ok: true, info, url });
}
function traceFail(trace: BenchmarkTraceEntry[], label: string, error: string, url?: string) {
  trace.push({ label, ok: false, error, url });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Competitor discovery (Serper SERP on seed keywords)
// ─────────────────────────────────────────────────────────────────────────────

const SERP_BOILERPLATE_DOMAINS = new Set([
  'google.com', 'youtube.com', 'facebook.com', 'instagram.com',
  'linkedin.com', 'wikipedia.org', 'en.wikipedia.org', 'twitter.com', 'x.com',
  'pinterest.com', 'tiktok.com', 'reddit.com', 'quora.com', 'medium.com',
  'amazon.com', 'ebay.com', 'bing.com', 'duckduckgo.com',
]);

export interface DiscoveredCompetitor {
  domain: string;
  rank_score: number;
  top_url: string;
  top_title: string;
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function normalizeDomain(raw: string): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

async function serperSearch(q: string, region: string, language: string): Promise<{ organic?: Array<{ title?: string; link?: string }> } | null> {
  const key = process.env.SERPER_API_KEY;
  if (!key) {
    console.warn('[serper] SERPER_API_KEY missing — skipping search');
    return null;
  }
  // Serper expects ISO country codes. `uk` is our internal shorthand; Google
  // officially uses `gb` so we normalise it before calling the API.
  const gl = (region || 'us').toLowerCase() === 'uk' ? 'gb' : (region || 'us').toLowerCase();
  const hl = (language || 'en').toLowerCase();
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q, gl, hl, num: 10 }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[serper] ${res.status} for q="${q}" gl=${gl} hl=${hl}: ${body.slice(0, 200)}`);
      return null;
    }
    return res.json();
  } catch (e) {
    console.warn(`[serper] network error for q="${q}":`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Rank domains by how often they show up in the top 10 SERP for our seed
 * keywords. `seedKnownDomains` lets the caller force-include competitors the
 * user already listed (we still want their benchmark even if they don't rank).
 */
export async function discoverCompetitors(
  seedKeywords: string[],
  opts: {
    region?: string;
    language?: string;
    ownDomain?: string;
    seedKnownDomains?: string[];
    maxSeeds?: number;
    maxCompetitors?: number;
    trace?: BenchmarkTraceEntry[];
  } = {}
): Promise<DiscoveredCompetitor[]> {
  const region = opts.region ?? 'us';
  const language = opts.language ?? 'en';
  const ownHost = normalizeDomain(opts.ownDomain ?? '');
  const maxSeeds = opts.maxSeeds ?? 6;
  const maxCompetitors = opts.maxCompetitors ?? 10;
  const trace = opts.trace;

  const domainCounts = new Map<string, { count: number; first: { url: string; title: string } }>();

  const seeds = [...new Set(seedKeywords.map(s => (s || '').trim()).filter(Boolean))].slice(0, maxSeeds);

  for (const seed of seeds) {
    const started = Date.now();
    const res = await serperSearch(seed, region, language);
    const organic = res?.organic ?? [];
    if (!organic.length) {
      if (trace) traceFail(trace, `serper_search: ${seed}`, 'no organic results');
      continue;
    }

    for (const row of organic.slice(0, 10)) {
      const link = typeof row.link === 'string' ? row.link : '';
      const title = typeof row.title === 'string' ? row.title : '';
      const host = safeHostname(link);
      if (!host) continue;
      if (SERP_BOILERPLATE_DOMAINS.has(host)) continue;
      if (ownHost && (host === ownHost || host.endsWith(`.${ownHost}`))) continue;

      const existing = domainCounts.get(host);
      if (existing) {
        existing.count += 1;
      } else {
        domainCounts.set(host, { count: 1, first: { url: link, title } });
      }
    }

    if (trace)
      traceOk(trace, `serper_search: ${seed}`, {
        organic_count: organic.length,
        ms: Date.now() - started,
      });

    // Be polite to Serper.
    await new Promise(r => setTimeout(r, 200));
  }

  // Force-include domains the user already added as project competitors.
  for (const d of opts.seedKnownDomains ?? []) {
    const host = normalizeDomain(d);
    if (!host || domainCounts.has(host)) continue;
    domainCounts.set(host, { count: 1, first: { url: `https://${host}`, title: host } });
  }

  const ranked = [...domainCounts.entries()]
    .map(([domain, v]) => ({
      domain,
      rank_score: v.count,
      top_url: v.first.url,
      top_title: v.first.title,
    }))
    .sort((a, b) => b.rank_score - a.rank_score)
    .slice(0, maxCompetitors);

  return ranked;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Page scraping + structural extraction (Jina Reader → markdown)
// ─────────────────────────────────────────────────────────────────────────────

/** Find blog/article URLs for a given domain via Serper (site: search). */
export async function findCompetitorPages(
  domain: string,
  niche: string,
  opts: { region?: string; language?: string; max?: number; trace?: BenchmarkTraceEntry[] } = {}
): Promise<Array<{ url: string; title: string }>> {
  const region = opts.region ?? 'us';
  const language = opts.language ?? 'en';
  const max = opts.max ?? 3;
  const trace = opts.trace;

  const query = `site:${domain} ${niche}`;
  const started = Date.now();
  const res = await serperSearch(query, region, language);
  const organic = (res?.organic ?? []) as Array<{ title?: string; link?: string }>;

  const pages = organic
    .map(r => ({ url: typeof r.link === 'string' ? r.link : '', title: typeof r.title === 'string' ? r.title : '' }))
    .filter(p => p.url && safeHostname(p.url).endsWith(normalizeDomain(domain)))
    .slice(0, max);

  if (trace)
    traceOk(trace, `serper_site: ${domain}`, {
      pages: pages.length,
      ms: Date.now() - started,
    });

  return pages;
}

/**
 * Scrape one URL via Jina, then parse the returned markdown for structural
 * signals (H1/H2/H3, word count, images, link counts, FAQ presence).
 * Fails soft — the caller gets an "ok: false" trace entry and no page row.
 */
export async function extractCompetitorContent(
  url: string,
  opts: { trace?: BenchmarkTraceEntry[] } = {}
): Promise<{ snapshot: CompetitorPageSnapshot | null; markdown: string }> {
  const started = Date.now();
  const page = await hybridReadUrl(url, { timeoutMs: 25_000 });
  if (!page.ok || !page.markdown) {
    if (opts.trace) traceFail(opts.trace, 'jina_read', page.error ?? 'empty', url);
    return { snapshot: null, markdown: '' };
  }

  const md = page.markdown;
  const host = safeHostname(url);

  // Markdown headings. Jina returns real markdown, so `#` counts map cleanly.
  const h1 = (md.match(/^#\s.+$/gm) ?? [])[0] ?? '';
  const h2_count = (md.match(/^##\s.+$/gm) ?? []).length;
  const h3_count = (md.match(/^###\s.+$/gm) ?? []).length;

  // Plain word count (strip markdown noise so we don't double-count URLs etc.).
  const plain = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/[#>*_`~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const word_count = plain ? plain.split(/\s+/).length : 0;

  const image_count = (md.match(/!\[[^\]]*\]\([^)]+\)/g) ?? []).length;

  // Links: split internal vs external by comparing hostname.
  const linkRe = /\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g;
  let internal_link_count = 0;
  let external_link_count = 0;
  for (const m of md.matchAll(linkRe)) {
    const linkHost = safeHostname(m[1]);
    if (!linkHost) continue;
    if (host && (linkHost === host || linkHost.endsWith(`.${host}`) || host.endsWith(`.${linkHost}`))) {
      internal_link_count += 1;
    } else {
      external_link_count += 1;
    }
  }

  // Heuristic FAQ presence. Matches "FAQ" / "Frequently Asked Questions" /
  // anything with ≥3 H2/H3 headings ending with a question mark.
  const questionHeadings = (md.match(/^#{2,3}\s.+\?\s*$/gm) ?? []).length;
  const has_faq =
    /faq|frequently asked questions/i.test(md) ||
    questionHeadings >= 3;

  const titleMatch = md.match(/(?:^|\n)Title:\s*(.+)\n/i);
  const metaMatch = md.match(/(?:^|\n)(?:Description|Meta-Description):\s*(.+)\n/i);

  const snapshot: CompetitorPageSnapshot = {
    url: page.resolvedUrl ?? url,
    title: (titleMatch?.[1] ?? h1.replace(/^#+\s*/, '')).slice(0, 300),
    h1: h1.replace(/^#+\s*/, ''),
    h2_count,
    h3_count,
    word_count,
    image_count,
    internal_link_count,
    external_link_count,
    has_faq,
    meta_description: metaMatch?.[1]?.trim() ?? undefined,
  };

  if (opts.trace)
    traceOk(opts.trace, 'jina_read', {
      ms: Date.now() - started,
      chars: md.length,
      words: word_count,
    }, url);

  return { snapshot, markdown: md };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Keyword extraction (Gemini)
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractedKeywords {
  primary: string[];
  longtail: string[];
  questions: string[];
}

const EMPTY_KEYWORDS: ExtractedKeywords = { primary: [], longtail: [], questions: [] };

/**
 * Ask Gemini to pull 6–12 primary keywords, up to 15 long-tails, and up to
 * 10 natural-language questions from a competitor page. Truncates markdown
 * to ~8k chars to stay inside the 8192-token output limit.
 */
export async function extractKeywordsFromContent(
  markdown: string,
  opts: { niche?: string; title?: string; trace?: BenchmarkTraceEntry[] } = {}
): Promise<ExtractedKeywords> {
  const body = (markdown || '').slice(0, 8000);
  if (!body.trim()) return EMPTY_KEYWORDS;

  const prompt = `You are an SEO keyword researcher. Analyze this competitor page and extract the keywords it is clearly trying to rank for.

${opts.niche ? `Our industry niche: ${opts.niche}` : ''}
${opts.title ? `Page title: ${opts.title}` : ''}

Return ONLY this JSON shape (no prose, no code fences):
{
  "primary": ["3-4 word primary keywords, 6-12 total"],
  "longtail": ["specific long-tail phrases, 4+ words, up to 15"],
  "questions": ["natural-language questions the page answers, up to 10"]
}

Rules:
- No duplicates. No brand names. No stopword-only phrases.
- Keep everything lowercase.
- Strip hashtags, emoji, quote marks.

PAGE CONTENT:
${body}`;

  let text = '';
  try {
    text = await geminiGenerate(prompt, 2);
  } catch (e) {
    if (opts.trace) traceFail(opts.trace, 'gemini_extract_keywords', e instanceof Error ? e.message : String(e));
    return EMPTY_KEYWORDS;
  }

  const parsed = safeJson(text);
  if (!parsed) {
    if (opts.trace) traceFail(opts.trace, 'gemini_extract_keywords', 'parse failed');
    return EMPTY_KEYWORDS;
  }

  const dedupe = (arr: unknown, max: number): string[] => {
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const v of arr) {
      if (typeof v !== 'string') continue;
      const clean = v.trim().toLowerCase().replace(/\s+/g, ' ').replace(/["“”'`]/g, '');
      if (clean.length < 3 || clean.length > 120) continue;
      if (seen.has(clean)) continue;
      seen.add(clean);
      out.push(clean);
      if (out.length >= max) break;
    }
    return out;
  };

  if (opts.trace) traceOk(opts.trace, 'gemini_extract_keywords', { chars: body.length });

  return {
    primary: dedupe(parsed.primary, 12),
    longtail: dedupe(parsed.longtail, 15),
    questions: dedupe(parsed.questions, 10),
  };
}

function safeJson(text: string): { primary?: unknown; longtail?: unknown; questions?: unknown } | null {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const brace = trimmed.match(/\{[\s\S]*\}/);
    if (brace) {
      try {
        return JSON.parse(brace[0]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Content benchmarking (averages + plain-English recommendations)
// ─────────────────────────────────────────────────────────────────────────────

export function benchmarkContentQuality(pages: CompetitorPageSnapshot[]): BenchmarkAverages {
  if (!pages.length) {
    return {
      avg_word_count: 0,
      avg_h2: 0,
      avg_h3: 0,
      avg_images: 0,
      avg_internal_links: 0,
      avg_external_links: 0,
      faq_pages_pct: 0,
      pages_analyzed: 0,
      recommendations: [],
    };
  }

  const n = pages.length;
  const sum = <K extends keyof CompetitorPageSnapshot>(k: K) =>
    pages.reduce((t, p) => t + (Number(p[k]) || 0), 0);

  const avg_word_count = Math.round(sum('word_count') / n);
  const avg_h2 = Math.round((sum('h2_count') / n) * 10) / 10;
  const avg_h3 = Math.round((sum('h3_count') / n) * 10) / 10;
  const avg_images = Math.round((sum('image_count') / n) * 10) / 10;
  const avg_internal_links = Math.round((sum('internal_link_count') / n) * 10) / 10;
  const avg_external_links = Math.round((sum('external_link_count') / n) * 10) / 10;
  const faq_pages_pct = Math.round((pages.filter(p => p.has_faq).length / n) * 100);

  const recommendations: string[] = [];
  if (avg_word_count >= 500) {
    const target = Math.max(Math.round(avg_word_count * 1.1), avg_word_count + 200);
    recommendations.push(`Aim for at least ${target} words — competitors average ${avg_word_count}.`);
  }
  if (avg_h2 >= 2) {
    recommendations.push(`Use ~${Math.max(Math.ceil(avg_h2), 3)} H2 sections so the page is RAG-friendly (competitors: avg ${avg_h2}).`);
  }
  if (avg_h3 >= 1) {
    recommendations.push(`Add ${Math.max(Math.ceil(avg_h3), 3)} H3 sub-sections under each H2 (competitors: avg ${avg_h3}).`);
  }
  if (avg_images >= 2) {
    recommendations.push(`Include at least ${Math.max(Math.ceil(avg_images), 3)} images/diagrams — competitors: avg ${avg_images}.`);
  }
  if (avg_internal_links >= 2) {
    recommendations.push(`Add ${Math.max(Math.ceil(avg_internal_links), 3)}+ internal links to related pages.`);
  }
  if (avg_external_links >= 2) {
    recommendations.push(`Cite ${Math.max(Math.ceil(avg_external_links), 3)}+ external authorities for E-E-A-T.`);
  }
  if (faq_pages_pct >= 40) {
    recommendations.push(`${faq_pages_pct}% of competitor pages include an FAQ — add one with FAQPage JSON-LD.`);
  }

  return {
    avg_word_count,
    avg_h2,
    avg_h3,
    avg_images,
    avg_internal_links,
    avg_external_links,
    faq_pages_pct,
    pages_analyzed: n,
    recommendations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Opportunity scoring (0–100)
// ─────────────────────────────────────────────────────────────────────────────

export interface OpportunityInput {
  /** Monthly search volume from DataForSEO. 0 = unknown. */
  volume: number;
  /** Keyword difficulty 0–100. 0 = unknown. */
  kd: number;
  /** Raw trend percent (signed). */
  trend_pct: number;
  /**
   * 0–100: how weak the strongest competitor content is.
   * Higher = easier to beat. Caller can derive this from benchmark averages
   * (short pages, few sections, no FAQ → high weakness).
   */
  competitor_weakness: number;
  gap_type: GapType;
}

/**
 * score =
 *   0.30 · volume component
 *   0.20 · inverse-difficulty
 *   0.25 · competitor weakness
 *   0.15 · trend growth
 *   0.10 · gap severity
 * Returns an integer 0–100.
 */
export function scoreOpportunity(input: OpportunityInput): number {
  // Volume — log-scale vs 10k/mo.
  const vol = input.volume > 0 ? Math.min(Math.log10(input.volume + 1) / Math.log10(10_000), 1) : 0;
  const volumeComp = vol * 100;

  // Inverse difficulty. When KD unknown (0) use a neutral 50.
  const invDiff = input.kd > 0 ? Math.max(0, 100 - input.kd) : 50;

  // Competitor weakness (clamped 0–100).
  const weakness = Math.max(0, Math.min(100, input.competitor_weakness));

  // Trend growth: +50% → full score, −50% → zero.
  const trendComp = Math.max(0, Math.min(100, 50 + input.trend_pct));

  // Gap severity weight.
  const gapBonus = input.gap_type === 'missing' ? 100 : input.gap_type === 'untapped' ? 80 : 50;

  const raw =
    0.30 * volumeComp +
    0.20 * invDiff +
    0.25 * weakness +
    0.15 * trendComp +
    0.10 * gapBonus;

  return Math.round(Math.max(0, Math.min(100, raw)));
}

/**
 * Translate a single competitor page's content signals into a 0–100
 * "weakness" score for use in `scoreOpportunity`. Thin pages with no FAQ
 * and few links score high; comprehensive pages score low.
 */
export function competitorWeaknessFromSnapshot(snap: CompetitorPageSnapshot): number {
  let score = 0;
  // Short pages are easy to out-write.
  if (snap.word_count < 600) score += 40;
  else if (snap.word_count < 1200) score += 25;
  else if (snap.word_count < 2000) score += 10;

  // Thin structure.
  if (snap.h2_count < 3) score += 15;
  if (snap.h3_count < 3) score += 10;

  // Missing enrichment.
  if (snap.image_count < 2) score += 10;
  if (snap.external_link_count < 2) score += 10;
  if (!snap.has_faq) score += 15;

  return Math.min(100, score);
}

/**
 * Classify a gap row given the user's existing keyword set:
 *   • missing  — user doesn't have the keyword at all
 *   • weak     — user has it but hasn't approved it yet
 *   • untapped — user approved it but the competitor still out-ranks (caller
 *                decides; we default to `missing` when unsure)
 */
export function classifyGap(
  keyword: string,
  userKeywordIndex: Map<string, { status: string }>,
): GapType {
  const hit = userKeywordIndex.get(keyword.toLowerCase());
  if (!hit) return 'missing';
  if (hit.status === 'approved') return 'untapped';
  return 'weak';
}
