/**
 * Content Health auditor.
 *
 * For each blog URL on the user's own site:
 *   1. HEAD-check the URL. If it 404s, 410s, or redirects to the homepage we
 *      skip the LLM and write a single "page is broken" audit row — no LLM
 *      tokens wasted analyzing something that doesn't exist.
 *   2. Scrape the page via Jina Reader (markdown).
 *   3. Extract structural signals deterministically (word count, heading count,
 *      internal link count, FAQ presence, schema hints).
 *   4. Ask Gemini to diagnose issues, grouped by category (technical / seo /
 *      content / keyword_demand / ux). The prompt is phrased for non-technical
 *      users: every issue has a plain-language `why_it_matters` and a concrete
 *      `fix`. We treat the blog standalone — we do NOT compare it to the
 *      business brief (per product feedback) except for the light touch of
 *      suggesting internal links to peer URLs.
 *   5. (Optional) `fetchKeywordVitals` — Ahrefs overview when configured, else
 *      DataForSEO `keyword_overview/live` — for the primary keyword on the card.
 *      Optional Ahrefs URL metrics (organic keywords, anchors, internal inlinks,
 *      crawled-pages precheck) run only when `AHREFS_API_KEY` is set — see `ahrefs.ts`.
 *   6. Compute a deterministic 0–100 health score blending structural signals
 *      + LLM quality score. Persist everything in `blog_audits`.
 */

import { AUDIT_SCRAPE_STORAGE_CAP } from './audit-scrape-storage';
import { criticalityFromScore } from './audit-criticality';
import type { BusinessBrief } from './business-brief';
import { hybridReadUrl, type ScrapedPageMarkdown as JinaPage } from '@/services/hybridScraper';
import { fetchKeywordVitals, type KeywordVitals } from './dataforseo';
import {
  ahrefsAnchors,
  ahrefsCrawledPages,
  ahrefsPagesByInternalLinks,
  ahrefsUrlOrganicKeywords,
  isAhrefsConfigured,
  type AhrefsUrlKeyword,
} from './ahrefs';

export type AuditSeverity = 'low' | 'medium' | 'high';
export type AuditImpact = 'low' | 'medium' | 'high';
export type IssueCategory = 'technical' | 'seo' | 'content' | 'keyword_demand' | 'ux';

import { z } from 'zod';
import { aiGenerateStructured } from '@/services/ai/providers';

export interface BlogIssue {
  /** Plain-language label (<=6 words). No jargon. */
  label: string;
  /** Which bucket this issue belongs to. */
  category: IssueCategory;
  severity: AuditSeverity;
  /** One sentence, plain English, what the problem looks like on the page. */
  detail: string;
  /** Why this matters for ranking/traffic — phrased for a non-technical owner. */
  why_it_matters: string;
  /** Concrete action they can take today. */
  fix: string;
  /** How much moving this would realistically lift ranking/traffic. */
  impact: AuditImpact;
}

export interface KeywordDemand {
  keyword: string;
  /** Google monthly search volume in the project's region. */
  volume: number;
  /** Signed monthly trend pct (e.g. +14, -8). */
  trend_pct: number;
  /** Last 12 months for a sparkline. */
  monthly_searches: { month: string; volume: number }[];
  /** High-level verdict the UI can render as a pill. */
  verdict: 'trending' | 'stable' | 'declining' | 'niche' | 'unknown';
}

export interface BlogAuditAnalysis {
  /** One-sentence summary of what this blog is about and who it targets. */
  summary: string;
  primary_keyword: string;
  secondary_keywords: string[];
  issues: BlogIssue[];
  /** Gaps within the post itself (missing sub-topics), NOT a brief-diff. */
  content_gaps: string[];
  internal_link_opportunities: Array<{ target_url: string; reason: string }>;
  suggested_funnel_stage?: 'TOFU' | 'MOFU' | 'BOFU' | '';
  /** Blog quality score 0–100 assigned by the LLM. */
  llm_quality_score?: number;
  /** Live keyword demand data from DataForSEO, if credentials were available. */
  keyword_demand?: KeywordDemand | null;
  /** Non-technical, single-paragraph verdict: is this blog under-performing, and why? */
  plain_language_verdict?: string;
  /** Type of page detected (helps the UI decide tone). */
  page_status: 'ok' | 'broken' | 'redirected' | 'empty';
  /**
   * Deterministic checklist vs Rankit blog quality rules (GEO + on-page SEO).
   * Computed server-side from the live scrape — not from the LLM.
   */
  quality_rubric?: QualityRubricRow[];
  /** Present when Ahrefs returned data for this URL (requires AHREFS_API_KEY). */
  ahrefs_signals?: {
    url_rating: number | null;
    http_code: number | null;
    organic_keywords_top: Array<{
      keyword: string;
      position: number | null;
      volume: number;
      traffic: number | null;
    }>;
    top_anchors: Array<{ anchor: string; refdomains: number }>;
    inbound_internal_links_to_url: number | null;
  } | null;
  /**
   * Analyze content page only — preserved across re-runs of `auditExternalBlogUrl`
   * (merged server-side). Not produced by the LLM.
   */
  analyze_page_meta?: {
    /** Set to true by auditExternalBlogUrl so history queries can find these rows. */
    sourced_from_analyze_page?: boolean;
    /** Set when the user queued the audit from Discover pages → Site audit pipeline. */
    sourced_from_discover_pages?: boolean;
    calendar_scheduled?: boolean;
    calendar_scheduled_at?: string;
    calendar_scheduled_date?: string;
  };
}

/** One row in the Content Health "rules" checklist. */
export interface QualityRubricRow {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface BlogAuditRecord {
  url: string;
  title: string;
  word_count: number;
  scraped_chars: number;
  health_score: number;
  severity: AuditSeverity;
  primary_keyword: string;
  analysis: BlogAuditAnalysis;
  error?: string;
  /** Raw markdown from `hybridReadUrl` (Jina / fallback), capped for DB storage — inspect before LLM diagnosis. */
  scraped_markdown?: string;
}

export { AUDIT_SCRAPE_STORAGE_CAP } from './audit-scrape-storage';

export function capAuditScrapeForStorage(markdown: string): string {
  if (markdown.length <= AUDIT_SCRAPE_STORAGE_CAP) return markdown;
  return `${markdown.slice(0, AUDIT_SCRAPE_STORAGE_CAP)}\n\n… [truncated at ${AUDIT_SCRAPE_STORAGE_CAP.toLocaleString()} characters for storage]`;
}

export interface AuditBlogInput {
  url: string;
  brief: BusinessBrief | null;
  /** Other blog URLs on this domain — used to suggest internal links. */
  sitePeerUrls: string[];
  /** Project region, used for localized search-volume data. */
  region?: string;
  language?: string;
  projectId?: string;
}

/** Paid / vendor steps inside `auditBlogUrl` — returned to the client for debugging. */
export type ContentAuditVendorTrace = {
  provider: 'ahrefs' | 'dataforseo' | 'gemini' | 'jina';
  step: string;
  ok: boolean;
  detail?: string;
  ms?: number;
};

export type AuditBlogUrlResult = {
  record: BlogAuditRecord;
  trace: ContentAuditVendorTrace[];
};

interface StructuralSignals {
  title: string;
  word_count: number;
  heading_count: number;
  h2_count: number;
  h3_count: number;
  faq_section: boolean;
  internal_link_count: number;
  external_link_count: number;
  answer_first: boolean;
  has_schema_hints: boolean;
  first_paragraph: string;
  url_rating: number | null;
  refdomains: number | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Public entry point — audit ONE URL end-to-end.

export async function auditBlogUrl(input: AuditBlogInput): Promise<AuditBlogUrlResult> {
  const trace: ContentAuditVendorTrace[] = [];
  const { url, brief, sitePeerUrls, region = 'us', language = 'en' } = input;

  // 1. Pre-flight — dead URLs skip scrape + LLM spend.
  const ahrefsT0 = Date.now();
  const ahrefsCrawl: any = null;
  trace.push({
    provider: 'ahrefs',
    step: 'site-explorer/crawled-pages',
    // Optional vendor: skip is success — Jina preflight still runs when Ahrefs has no row.
    ok: true,
    detail: 'skipped — disabled endpoint',
    ms: Date.now() - ahrefsT0,
  });

  const pre = await preflight(url);
  if (pre.status === 'broken') return { record: brokenUrlRecord(url, pre.reason), trace };
  if (pre.status === 'redirected' && pre.finalUrl && pre.finalUrl !== url) {
    return { record: redirectToHomepageRecord(url, pre.finalUrl), trace };
  }

  // 2. Live body + Ahrefs context (ranking + inbound links + authority).
  const scrapeT0 = Date.now();
  const page = await hybridReadUrl(url, { timeoutMs: 25_000 });
  trace.push({
    provider: 'jina',
    step: 'hybrid-read-url',
    ok: page.ok,
    detail: page.ok ? `${page.markdown.length} chars` : page.error,
    ms: Date.now() - scrapeT0,
  });

  const ahrefsBatchT0 = Date.now();
  const urlKeywords: AhrefsUrlKeyword[] = [];
  const anchors: any[] = [];
  const internalLinksInbound: any[] = [];
  trace.push({
    provider: 'ahrefs',
    step: 'organic-keywords+anchors+internal-inbound',
    ok: true,
    detail: 'skipped — disabled endpoint',
    ms: Date.now() - ahrefsBatchT0,
  });

  if (!page.ok || page.markdown.trim().length < 160) {
    const partial =
      page.markdown?.trim().length > 0 ? capAuditScrapeForStorage(page.markdown) : undefined;
    return {
      record: {
        ...thinOrUnreadableRecord(url, page.error ?? 'Could not read enough text from this page.'),
        scraped_chars: page.markdown?.length ?? 0,
        scraped_markdown: partial,
      },
      trace,
    };
  }

  const signals = extractSignals(page);
  signals.url_rating = ahrefsCrawl?.url_rating ?? null;
  signals.refdomains = anchors.reduce((s, a) => s + a.refdomains, 0);

  const inboundPeerLinks = internalLinksInbound[0]?.links_to_target ?? 0;

  const ahrefs_signals: NonNullable<BlogAuditAnalysis['ahrefs_signals']> = {
    url_rating: ahrefsCrawl?.url_rating ?? null,
    http_code: ahrefsCrawl?.http_code ?? null,
    organic_keywords_top: urlKeywords.slice(0, 8).map(k => ({
      keyword: k.keyword,
      position: k.position ?? null,
      volume: k.volume,
      traffic: k.traffic ?? null,
    })),
    top_anchors: anchors.slice(0, 8).map(a => ({ anchor: a.anchor, refdomains: a.refdomains })),
    inbound_internal_links_to_url: inboundPeerLinks,
  };

  let analysis = await diagnoseWithGemini({
    url,
    page,
    signals,
    brief,
    sitePeerUrls,
    ahrefs_signals: isAhrefsConfigured() ? ahrefs_signals : null,
    projectId: input.projectId,
  });
  trace.push({
    provider: 'gemini',
    step: 'diagnose-audit',
    ok: !(
      analysis.issues.length === 0 &&
      (analysis.summary.startsWith('GEMINI_API_KEY') || analysis.summary.startsWith('LLM diagnosis failed'))
    ),
    detail: analysis.summary.startsWith('GEMINI_API_KEY')
      ? 'skipped — GEMINI_API_KEY unset'
      : analysis.summary.startsWith('LLM diagnosis failed')
        ? analysis.summary.slice(0, 120)
        : 'ok',
  });

  const geminiSkipped =
    analysis.issues.length === 0 &&
    (analysis.summary.startsWith('GEMINI_API_KEY') || analysis.summary.startsWith('LLM diagnosis failed'));

  if (geminiSkipped) {
    const ah = ahrefsOnlyAnalysis(url, urlKeywords);
    analysis = {
      ...ah,
      plain_language_verdict: analysis.summary,
      page_status: 'ok',
      ahrefs_signals: isAhrefsConfigured() ? ahrefs_signals : null,
    };
  } else {
    analysis = { ...analysis, ahrefs_signals: isAhrefsConfigured() ? ahrefs_signals : null };
  }

  const ahrefsPrimary = urlKeywords[0]?.keyword?.trim().toLowerCase() ?? '';
  if (!analysis.primary_keyword?.trim() && ahrefsPrimary) {
    analysis = { ...analysis, primary_keyword: ahrefsPrimary };
  }

  const kwLookup = analysis.primary_keyword.trim();
  const dfsT0 = Date.now();
  let vitalsMap: Map<string, KeywordVitals>;
  try {
    vitalsMap = await fetchKeywordVitals(kwLookup ? [kwLookup] : [], region, language);
    trace.push({
      provider: 'dataforseo',
      step: 'keyword_overview/live',
      ok: true,
      detail: kwLookup ? `lookup="${kwLookup}"` : 'no primary keyword',
      ms: Date.now() - dfsT0,
    });
  } catch (e) {
    trace.push({
      provider: 'dataforseo',
      step: 'keyword_overview/live',
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
      ms: Date.now() - dfsT0,
    });
    vitalsMap = new Map();
  }
  const vitals = kwLookup ? vitalsMap.get(kwLookup.toLowerCase()) : undefined;
  const demand = vitalsToKeywordDemand(vitals);

  const quality_rubric = buildQualityRubric(signals, page.markdown, inboundPeerLinks);

  if (!geminiSkipped && urlKeywords.length === 0) {
    const dup = analysis.issues.some(i => i.label === 'Not ranking for any keyword');
    if (!dup) {
      analysis = {
        ...analysis,
        issues: [
          ...analysis.issues,
          {
            label: 'No tracked ranking keywords yet',
            category: 'seo',
            severity: 'medium',
            detail:
              'Rank tracking shows no keywords sending traffic to this URL yet (the page may be new, not indexed, or still building authority).',
            why_it_matters:
              'That limits measurable organic traffic for now, even if the on-page article reads well.',
            fix: 'Request indexing, strengthen internal links from higher-traffic posts, and recheck rankings after a few weeks.',
            impact: 'medium',
          },
        ],
      };
    }
  }

  analysis = {
    ...analysis,
    keyword_demand: demand,
    quality_rubric,
    plain_language_verdict:
      analysis.plain_language_verdict || synthesizeVerdict(signals, { ...analysis, keyword_demand: demand }),
  };

  const { healthScore, severity } = computeHealthScore(signals, analysis);

  return {
    record: {
      url,
      title: signals.title || analysis.primary_keyword || url,
      word_count: signals.word_count,
      scraped_chars: page.markdown.length,
      health_score: healthScore,
      severity,
      primary_keyword: analysis.primary_keyword,
      analysis: { ...analysis, page_status: 'ok' },
      scraped_markdown: capAuditScrapeForStorage(page.markdown),
    },
    trace,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Pre-flight — cheap HEAD/GET to catch 404s before we pay for LLM tokens.

async function preflight(url: string): Promise<
  | { status: 'ok' }
  | { status: 'broken'; reason: string }
  | { status: 'redirected'; finalUrl: string }
> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        // Some CMSs block bot UAs; a generic browser UA gets us through most.
        'User-Agent':
          'Mozilla/5.0 (compatible; SEOEngineAudit/1.0; +https://example.com/bot)',
      },
      signal: AbortSignal.timeout(12_000),
    });
    // Explicit "gone" statuses — no point scraping.
    if (res.status === 404 || res.status === 410) {
      return { status: 'broken', reason: `The page returns HTTP ${res.status}.` };
    }
    if (res.status >= 500) {
      return { status: 'broken', reason: `Your server returned HTTP ${res.status}.` };
    }
    if (res.redirected && res.url && res.url !== url) {
      return { status: 'redirected', finalUrl: res.url };
    }
    return { status: 'ok' };
  } catch (e) {
    // Timeouts and network errors look like "broken" to a user too.
    return {
      status: 'broken',
      reason: `We couldn't reach this page. ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function brokenUrlRecord(url: string, reason: string): BlogAuditRecord {
  return {
    url,
    title: '(page not reachable)',
    word_count: 0,
    scraped_chars: 0,
    health_score: 0,
    severity: 'high',
    primary_keyword: '',
    analysis: {
      summary:
        'This URL is listed in your sitemap but the page itself is not reachable. Visitors and Google hit a dead end here.',
      primary_keyword: '',
      secondary_keywords: [],
      issues: [
        {
          label: 'Page is not reachable',
          category: 'technical',
          severity: 'high',
          detail: reason,
          why_it_matters:
            'Google de-indexes pages it cannot fetch, and any backlinks or internal links pointing here leak authority into a void. Visitors clicking from Google also bounce straight back — that damages your overall site trust score.',
          fix:
            'Either restore the page content from a backup, or set up a 301 redirect from this URL to the closest still-live article. Then remove the dead URL from your sitemap so it stops getting re-crawled.',
          impact: 'high',
        },
      ],
      content_gaps: [],
      internal_link_opportunities: [],
      suggested_funnel_stage: '',
      llm_quality_score: 0,
      keyword_demand: null,
      plain_language_verdict:
        'This page is dead. Before anything else, redirect it or restore the content — every other SEO fix is wasted effort on a URL Google can\'t reach.',
      page_status: 'broken',
    },
    error: reason,
  };
}

function redirectToHomepageRecord(url: string, finalUrl: string): BlogAuditRecord {
  return {
    url,
    title: '(redirects to homepage)',
    word_count: 0,
    scraped_chars: 0,
    health_score: 10,
    severity: 'high',
    primary_keyword: '',
    analysis: {
      summary:
        'This blog URL now redirects straight to your homepage. Google treats that as a soft-404 and strips whatever ranking the original post had.',
      primary_keyword: '',
      secondary_keywords: [],
      issues: [
        {
          label: 'Redirects to homepage',
          category: 'technical',
          severity: 'high',
          detail: `${url} now sends visitors to ${finalUrl}.`,
          why_it_matters:
            'Redirecting a deleted article to the homepage is the biggest authority leak in SEO. Google drops the old rankings because the homepage isn\'t "about" the same topic, and the backlinks pointing at the original article stop helping you.',
          fix:
            'Instead of redirecting to the homepage, either (a) restore the original article so the backlinks and rankings return, or (b) 301-redirect this URL to the closest topical blog post on the same theme.',
          impact: 'high',
        },
      ],
      content_gaps: [],
      internal_link_opportunities: [],
      suggested_funnel_stage: '',
      llm_quality_score: 10,
      keyword_demand: null,
      plain_language_verdict:
        'Someone removed this article and pointed it at the homepage. Fix the redirect target first — the rest of the audit can\'t help a page that no longer exists.',
      page_status: 'redirected',
    },
  };
}

function thinOrUnreadableRecord(url: string, reason: string): BlogAuditRecord {
  return {
    url,
    title: '(could not read page)',
    word_count: 0,
    scraped_chars: 0,
    health_score: 12,
    severity: 'high',
    primary_keyword: '',
    analysis: {
      summary:
        'We could not extract enough readable article text from this URL. It may block scrapers, require JavaScript in a way our reader cannot handle, or return very little body content.',
      primary_keyword: '',
      secondary_keywords: [],
      issues: [
        {
          label: 'Page body not readable',
          category: 'technical',
          severity: 'high',
          detail: reason,
          why_it_matters:
            'If our reader cannot see the article, the audit cannot score real word count, headings, or links — and search crawlers may struggle too.',
          fix: 'Check that the URL returns public HTML with visible article text, not an empty shell or hard bot block.',
          impact: 'high',
        },
      ],
      content_gaps: [],
      internal_link_opportunities: [],
      suggested_funnel_stage: '',
      llm_quality_score: undefined,
      keyword_demand: null,
      plain_language_verdict:
        'Fix fetchability first — once the live article text is readable, re-run the audit for a full content score.',
      page_status: 'empty',
      quality_rubric: [],
    },
    error: reason,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Structural extraction (deterministic, no LLM)

function extractSignals(page: JinaPage): StructuralSignals {
  const md = page.markdown;
  const title = extractTitle(md);
  const words = wordCount(md);

  const headings = md.match(/^#{1,6}\s+.+$/gm) ?? [];
  const h2 = md.match(/^##\s+.+$/gm) ?? [];
  const h3 = md.match(/^###\s+.+$/gm) ?? [];
  const faqSection = /^##+\s*(faqs?|frequently asked questions)\b/im.test(md);

  const pageHost = safeHost(page.url);
  const linkRe = /\[[^\]]+\]\((https?:\/\/[^)]+)\)/g;
  let m: RegExpExecArray | null;
  let internalCount = 0;
  let externalCount = 0;
  while ((m = linkRe.exec(md))) {
    const h = safeHost(m[1]);
    if (pageHost && h && (h === pageHost || h.endsWith(`.${pageHost}`))) internalCount++;
    else externalCount++;
  }

  const firstParagraph =
    md
      .split('\n\n')
      .map(b => b.trim())
      .find(b => b && !b.startsWith('#') && !b.startsWith('!') && !b.startsWith('>')) ?? '';

  const answerFirst =
    firstParagraph.length > 60 &&
    firstParagraph.length <= 420 &&
    hasSharedNoun(firstParagraph, title);

  const hasSchemaHints = /<script[^>]*type=["']application\/ld\+json["']/i.test(md);

  return {
    title,
    word_count: words,
    heading_count: headings.length,
    h2_count: h2.length,
    h3_count: h3.length,
    faq_section: faqSection,
    internal_link_count: internalCount,
    external_link_count: externalCount,
    answer_first: answerFirst,
    has_schema_hints: hasSchemaHints,
    first_paragraph: firstParagraph.slice(0, 500),
    url_rating: null,
    refdomains: null,
  };
}

function extractTitle(md: string): string {
  const h1 = md.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].replace(/\*+/g, '').trim();
  const titleLine = md.match(/^Title:\s*(.+)$/m);
  if (titleLine) return titleLine[1].trim();
  return '';
}

function wordCount(md: string): number {
  return md.split(/\s+/).filter(Boolean).length;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function hasSharedNoun(a: string, b: string): boolean {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'how', 'what', 'why', 'a', 'an', 'of', 'to', 'in', 'on', 'is', 'are',
  ]);
  const tokens = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 3 && !stop.has(t));
  const setA = new Set(tokens(a));
  for (const t of tokens(b)) if (setA.has(t)) return true;
  return false;
}

function firstBodyPlainText(md: string): string {
  const body = md.replace(/^---[\s\S]*?---\n?/m, '').trim();
  const blocks = body.split(/\n\n+/);
  for (const raw of blocks) {
    const b = raw.trim();
    if (!b || b.startsWith('#') || b.startsWith('![') || b.startsWith('>')) continue;
    return b.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`>#]/g, ' ');
  }
  return '';
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Best-effort: Article + FAQPage JSON-LD blocks in the markdown/HTML snapshot. */
function jsonLdArticleFaqInMarkdown(md: string): { article: boolean; faq: boolean } {
  let article = false;
  let faq = false;
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const inner = m[1];
    if (/"@type"\s*:\s*"\s*Article\s*"/i.test(inner) || /"@type"\s*:\s*\[[^\]]*"Article"/i.test(inner)) article = true;
    if (/"@type"\s*:\s*"\s*FAQPage\s*"/i.test(inner) || /"@type"\s*:\s*\[[^\]]*"FAQPage"/i.test(inner)) faq = true;
    if (/"@graph"\s*:\s*\[/i.test(inner)) {
      if (/Article/i.test(inner)) article = true;
      if (/FAQPage/i.test(inner)) faq = true;
    }
  }
  if (!article && /"Article"/i.test(md) && /@type/i.test(md)) article = true;
  if (!faq && /"FAQPage"/i.test(md) && /@type/i.test(md)) faq = true;
  return { article, faq };
}

function vitalsToKeywordDemand(vitals: KeywordVitals | undefined): KeywordDemand | null {
  if (!vitals) return null;
  const vol = vitals.volume;
  const tp = vitals.trend_pct;
  let verdict: KeywordDemand['verdict'] = 'unknown';
  if (vol === 0) verdict = 'unknown';
  else if (vol < 40) verdict = 'niche';
  else if (tp >= 8) verdict = 'trending';
  else if (tp <= -12) verdict = 'declining';
  else verdict = 'stable';
  return {
    keyword: vitals.keyword,
    volume: vol,
    trend_pct: tp,
    monthly_searches: vitals.monthly_searches ?? [],
    verdict,
  };
}

function buildQualityRubric(
  signals: StructuralSignals,
  markdown: string,
  inboundPeerLinks: number
): QualityRubricRow[] {
  const firstBlock = firstBodyPlainText(markdown);
  const first80 = firstBlock.split(/\s+/).filter(Boolean).slice(0, 80).join(' ');
  const w80 = countWords(first80);
  let intro: 'pass' | 'warn' | 'fail' = 'fail';
  if (w80 >= 55 && (signals.answer_first || firstBlock.length >= 280)) intro = 'pass';
  else if (w80 >= 38) intro = 'warn';

  let sections: 'pass' | 'warn' | 'fail' = 'fail';
  if (signals.h2_count >= 4 && signals.h3_count >= 2) sections = 'pass';
  else if (signals.h2_count >= 2) sections = 'warn';

  const { article, faq } = jsonLdArticleFaqInMarkdown(markdown);
  const hasFaqHeading = signals.faq_section;
  let schemaRow: 'pass' | 'warn' | 'fail' = 'fail';
  if (article && faq) schemaRow = 'pass';
  else if (article || faq || signals.has_schema_hints) schemaRow = 'warn';

  let faqRow: 'pass' | 'warn' | 'fail' = 'fail';
  if (hasFaqHeading && faq) faqRow = 'pass';
  else if (hasFaqHeading || faq) faqRow = 'warn';

  let externalRow: 'pass' | 'warn' | 'fail' = 'fail';
  if (signals.external_link_count >= 2) externalRow = 'pass';
  else if (signals.external_link_count === 1) externalRow = 'warn';

  let internalRow: 'pass' | 'warn' | 'fail' = 'fail';
  if (signals.internal_link_count >= 2) internalRow = 'pass';
  else if (signals.internal_link_count === 1 || inboundPeerLinks >= 2) internalRow = 'warn';

  let depth: 'pass' | 'warn' | 'fail' = 'fail';
  if (signals.word_count >= 1400) depth = 'pass';
  else if (signals.word_count >= 700) depth = 'warn';

  return [
    {
      id: 'direct_answer_first_80w',
      label: 'Direct answer in first ~80 words (GEO)',
      status: intro,
      detail:
        intro === 'pass'
          ? `First ~80 words look substantive (${w80} words in opening block).`
          : intro === 'warn'
            ? `Opening block is only ~${w80} words or weakly tied to the topic — strengthen the upfront answer.`
            : 'Opening is too thin or missing a clear direct answer in the first screenful.',
    },
    {
      id: 'modular_h2_h3',
      label: 'Modular H2 / H3 structure',
      status: sections,
      detail:
        sections === 'pass'
          ? `${signals.h2_count} H2s, ${signals.h3_count} H3s — good hierarchy.`
          : sections === 'warn'
            ? `${signals.h2_count} H2s, ${signals.h3_count} H3s — add more subheads to break up the article.`
            : 'Very few subheads — readers and AI summaries both struggle.',
    },
    {
      id: 'faq_and_schema',
      label: 'FAQ content + Article / FAQPage JSON-LD',
      status: schemaRow === 'pass' && faqRow !== 'fail' ? 'pass' : schemaRow === 'fail' && faqRow === 'fail' ? 'fail' : 'warn',
      detail:
        schemaRow === 'pass' && faqRow !== 'fail'
          ? 'FAQ-style coverage and Article + FAQPage structured data detected.'
          : `Article schema: ${article ? 'yes' : 'no'} · FAQPage schema: ${faq ? 'yes' : 'no'} · FAQ heading section: ${hasFaqHeading ? 'yes' : 'no'}.`,
    },
    {
      id: 'external_citations',
      label: 'Outbound citations (credible external links)',
      status: externalRow,
      detail:
        externalRow === 'pass'
          ? `${signals.external_link_count} external links in the body — good for trust and GEO citations.`
          : externalRow === 'warn'
            ? 'Only one external citation — add at least one more reputable source.'
            : 'No external links to sources — add 2+ citations to authoritative pages.',
    },
    {
      id: 'internal_links',
      label: 'Internal links to related posts (2–4 target)',
      status: internalRow,
      detail: (() => {
        if (internalRow === 'pass') {
          const tail = inboundPeerLinks
            ? ` We also see ${inboundPeerLinks} inbound internal link(s) from your domain.`
            : '';
          return `${signals.internal_link_count} in-article internal link(s).${tail}`;
        }
        if (internalRow === 'warn') {
          if (inboundPeerLinks >= 2 && signals.internal_link_count === 0) {
            return 'Other pages link here, but the article body shows no internal links out — add 2+ contextual links to peers.';
          }
          return 'Only one internal link in the body — aim for at least two.';
        }
        return 'No internal links in the article body — weave in 2–4 links to related posts.';
      })(),
    },
    {
      id: 'content_depth',
      label: 'Content depth (word count)',
      status: depth,
      detail:
        depth === 'pass'
          ? `~${signals.word_count.toLocaleString()} words — sufficient depth for most topics.`
          : depth === 'warn'
            ? `~${signals.word_count.toLocaleString()} words — acceptable but thin for competitive queries.`
            : `~${signals.word_count.toLocaleString()} words — likely too thin to compete.`,
    },
  ];
}

function structuralScoreFromRubric(rows: QualityRubricRow[]): number {
  if (!rows.length) return 55;
  const w: Record<QualityRubricRow['status'], number> = { pass: 1, warn: 0.58, fail: 0.28 };
  const sum = rows.reduce((s, r) => s + w[r.status], 0);
  return Math.round((sum / rows.length) * 100);
}

// ────────────────────────────────────────────────────────────────────────────
// LLM diagnosis (blog standalone)

interface DiagnoseInput {
  url: string;
  page: JinaPage;
  signals: StructuralSignals;
  brief: BusinessBrief | null;
  sitePeerUrls: string[];
  ahrefs_signals: BlogAuditAnalysis['ahrefs_signals'];
  projectId?: string;
}

const AuditAnalysisSchema = z.object({
  summary: z.string(),
  primary_keyword: z.string(),
  secondary_keywords: z.array(z.string()),
  issues: z.array(z.object({
    label: z.string(),
    category: z.enum(['technical', 'seo', 'content', 'keyword_demand', 'ux']),
    severity: z.enum(['low', 'medium', 'high']),
    detail: z.string(),
    why_it_matters: z.string(),
    fix: z.string(),
    impact: z.enum(['low', 'medium', 'high']),
  })),
  content_gaps: z.array(z.string()),
  internal_link_opportunities: z.array(z.object({
    target_url: z.string(),
    reason: z.string(),
  })),
  suggested_funnel_stage: z.enum(['TOFU', 'MOFU', 'BOFU', '']),
  llm_quality_score: z.number(),
  plain_language_verdict: z.string(),
});

async function diagnoseWithGemini(input: DiagnoseInput): Promise<BlogAuditAnalysis> {
  const { url, page, signals, brief, sitePeerUrls, ahrefs_signals, projectId } = input;

  const head = page.markdown.slice(0, 18_000);
  const tail =
    page.markdown.length > 28_000 ? page.markdown.slice(-Math.min(8_000, page.markdown.length)) : '';
  const peerSample = sitePeerUrls.filter(u => u !== url).slice(0, 30);

  const ahrefsBlock =
    ahrefs_signals && ahrefs_signals.organic_keywords_top.length
      ? `AHREFS URL SIGNALS (trust these counts — do not invent backlinks):
- URL rating (Ahrefs): ${ahrefs_signals.url_rating ?? 'n/a'}
- HTTP code (last crawl): ${ahrefs_signals.http_code ?? 'n/a'}
- Top keywords this URL ranks for: ${ahrefs_signals.organic_keywords_top
          .map(k => `"${k.keyword}" pos~${k.position ?? '?'} vol~${k.volume}`)
          .join('; ')}
- Top inbound anchor texts (sample): ${ahrefs_signals.top_anchors.map(a => `"${a.anchor}" (${a.refdomains} refdomains)`).join('; ') || 'n/a'}
- Inbound internal links from this site to this URL: ${ahrefs_signals.inbound_internal_links_to_url ?? 0}
`
      : ahrefs_signals
        ? `AHREFS: URL rating ${ahrefs_signals.url_rating ?? 'n/a'}; no ranking keywords returned for this exact URL.`
        : '(Ahrefs not configured — no off-page signals.)';

  const briefContextLite = brief
    ? `SITE CONTEXT (for light grounding only — do NOT penalize this blog for "not matching" the brief): ${brief.summary}`
    : '';

  const prompt = `You are a senior SEO + GEO auditor for Rankit. Audit the blog post below on its own merits — do NOT compare it to a business brief or other pages. Decide WHY this specific blog may not be getting traffic.

Rankit-generated blogs target these quality bars (use them when judging issues and when picking llm_quality_score):
- A direct, useful answer in the first ~80 words (AI Overviews / GEO).
- Modular H2/H3 sections (clear hierarchy, RAG-friendly).
- FAQ section and BOTH Article + FAQPage JSON-LD where applicable.
- At least 2 real outbound citations (external links to reputable sources).
- At least 2–4 natural internal links to related posts on the same site when peers exist.

Your answer must be understandable to a non-technical business owner (e.g. the company founder). Avoid jargon. When you must use an SEO term, explain it in one half-sentence inside "why_it_matters".

BLOG URL: ${url}

STRUCTURAL SIGNALS (already computed, trust these, do not recount):
- title: ${signals.title || '(missing)'}
- word_count: ${signals.word_count}
- h2_count: ${signals.h2_count}
- h3_count: ${signals.h3_count}
- faq_section_present: ${signals.faq_section}
- internal_link_count: ${signals.internal_link_count}
- external_link_count: ${signals.external_link_count}
- answer_first_intro_likely: ${signals.answer_first}
- schema_ld_hint_found: ${signals.has_schema_hints}

${ahrefsBlock}

${briefContextLite}

PEER BLOG URLS ON THE SAME SITE (use ONLY these verbatim when suggesting internal_link_opportunities — never invent URLs):
${peerSample.map(u => `- ${u}`).join('\n') || '(none)'}

BLOG POST BODY (first ~18k chars of markdown, plus tail excerpt for long pages):
---
${head}
---
${tail ? `\n--- TAIL EXCERPT (last ~\${Math.round(tail.length / 1000)}k chars) ---\n\${tail}\n` : ''}

Produce ONLY this JSON (no prose, no markdown fences, no commentary):

{
  "summary": "one-sentence summary of what this post is about and who it's for",
  "primary_keyword": "best guess of the single keyword this post is trying to rank for (2–5 words, lowercase)",
  "secondary_keywords": ["up to 6 supporting keywords you can see in H2s / body"],
  "issues": [
    {
      "label": "short plain-language label, <=6 words, no jargon",
      "category": "technical" | "seo" | "content" | "keyword_demand" | "ux",
      "severity": "low" | "medium" | "high",
      "detail": "one sentence, plain English, what's wrong on the page",
      "why_it_matters": "one sentence a non-technical founder would understand, explaining why this hurts traffic",
      "fix": "one-sentence concrete action the user can take today",
      "impact": "low" | "medium" | "high"
    }
  ],
  "content_gaps": ["up to 6 subtopics or sections MISSING FROM THIS POST that would make it more useful to the reader (NOT 'things your other blogs already cover')"],
  "internal_link_opportunities": [
    { "target_url": "one of the PEER URLs above verbatim", "reason": "one sentence explaining why this link strengthens the post" }
  ],
  "suggested_funnel_stage": "TOFU" | "MOFU" | "BOFU" | "",
  "llm_quality_score": 0,
  "plain_language_verdict": "One paragraph (2–4 sentences) a business owner can read in 10 seconds: is this blog under-performing, and what is the single biggest thing to fix first?"
}

CATEGORY GUIDE:
- "technical": page-level/site-level plumbing — slow load, missing schema, broken links inside the post, missing canonical, missing meta description, title tag issues.
- "seo": on-page optimization — keyword absent from title/H1/first 100 words, no H2 structure, weak internal linking, thin anchor text, duplicate/cannibalized topic (only if obvious from body).
- "content": writing quality — thin content, no answer-first intro, missing FAQ, no examples, no data/stats, weak conclusion, outdated info.
- "keyword_demand": the keyword itself is a bad bet — very low volume, seasonal-only, or covers intent Google wants to answer with a tool (calculator/map) rather than an article.
- "ux": reader experience — walls of text, no subheads, no images implied, no lists, no takeaways box.

RULES:
- Set "llm_quality_score" to an integer 0–100 (not the placeholder 0): holistic SEO+GEO quality vs the Rankit bars in the intro. 90+ = meets or nearly meets all bars; 70–89 = solid with gaps; 50–69 = several misses; below 50 = thin or structurally weak. Use 0 only if the body is empty or unusable.
- Maximum 8 issues. Order by severity desc then impact desc.
- "high" severity = likely blocks ranking or AI Overview citation today. "medium" = dents CTR/engagement. "low" = polish.
- Each fix must be specific to THIS post (reference the actual topic or heading when possible). No generic "write better content".
- Never invent issues unsupported by the signals or body text above.
- For "why_it_matters": use plain English. No words like "SERP", "canonicalize", "E-E-A-T", "SEO juice" without a 4-word inline explanation.
- "content_gaps" must be subtopics missing from this POST — not things your other blogs cover.

Return ONLY the JSON object.`;

  try {
    const result = await aiGenerateStructured("content-audit", prompt, AuditAnalysisSchema, {
      temperature: 0.2,
      userId: null,
      projectId,
    });
    return coerceAnalysis(result, sitePeerUrls);
  } catch (e) {
    return emptyAnalysis(
      `LLM diagnosis failed: \${e instanceof Error ? e.message : String(e)}`
    );
  }
}

function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const brace = cleaned.match(/\{[\s\S]*\}/);
    if (!brace) return null;
    try {
      return JSON.parse(brace[0]);
    } catch {
      return null;
    }
  }
}

function coerceAnalysis(
  raw: Record<string, unknown>,
  sitePeerUrls: string[]
): BlogAuditAnalysis {
  const peerSet = new Set(sitePeerUrls);

  const rawIssues = Array.isArray(raw.issues) ? (raw.issues as Array<Record<string, unknown>>) : [];
  const issues: BlogIssue[] = rawIssues
    .slice(0, 10)
    .map(i => ({
      label: strOrEmpty(i.label).slice(0, 80),
      category: normalizeCategory(i.category),
      severity: normalizeSeverity(i.severity),
      detail: strOrEmpty(i.detail),
      why_it_matters: strOrEmpty(i.why_it_matters),
      fix: strOrEmpty(i.fix),
      impact: normalizeImpact(i.impact),
    }))
    .filter(i => i.label && (i.detail || i.fix));

  const rawLinks = Array.isArray(raw.internal_link_opportunities)
    ? (raw.internal_link_opportunities as Array<Record<string, unknown>>)
    : [];
  const internal = rawLinks
    .slice(0, 10)
    .map(l => ({
      target_url: strOrEmpty(l.target_url),
      reason: strOrEmpty(l.reason),
    }))
    .filter(l => peerSet.has(l.target_url));

  return {
    summary: strOrEmpty(raw.summary),
    primary_keyword: strOrEmpty(raw.primary_keyword).toLowerCase(),
    secondary_keywords: arrStr(raw.secondary_keywords, 8),
    issues,
    content_gaps: arrStr(raw.content_gaps, 10),
    internal_link_opportunities: internal,
    suggested_funnel_stage: normalizeFunnel(raw.suggested_funnel_stage),
    llm_quality_score: clampNum(raw.llm_quality_score, 0, 100),
    keyword_demand: null,
    plain_language_verdict: strOrEmpty(raw.plain_language_verdict),
    page_status: 'ok',
  };
}

function normalizeSeverity(v: unknown): AuditSeverity {
  const s = typeof v === 'string' ? v.toLowerCase() : '';
  return s === 'high' ? 'high' : s === 'low' ? 'low' : 'medium';
}
function normalizeImpact(v: unknown): AuditImpact {
  const s = typeof v === 'string' ? v.toLowerCase() : '';
  return s === 'high' ? 'high' : s === 'low' ? 'low' : 'medium';
}
function normalizeCategory(v: unknown): IssueCategory {
  const s = typeof v === 'string' ? v.toLowerCase() : '';
  if (s === 'technical' || s === 'seo' || s === 'content' || s === 'keyword_demand' || s === 'ux') {
    return s;
  }
  return 'content';
}
function normalizeFunnel(v: unknown): BlogAuditAnalysis['suggested_funnel_stage'] {
  const s = typeof v === 'string' ? v.toUpperCase() : '';
  return s === 'TOFU' || s === 'MOFU' || s === 'BOFU' ? s : '';
}
function strOrEmpty(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
function arrStr(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, max);
}
function clampNum(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== 'number' || Number.isNaN(v)) return undefined;
  return Math.max(min, Math.min(max, Math.round(v)));
}
function emptyAnalysis(reason: string): BlogAuditAnalysis {
  return {
    summary: reason,
    primary_keyword: '',
    secondary_keywords: [],
    issues: [],
    content_gaps: [],
    internal_link_opportunities: [],
    suggested_funnel_stage: '',
    llm_quality_score: undefined,
    keyword_demand: null,
    plain_language_verdict: '',
    page_status: 'ok',
    quality_rubric: [],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Scoring + verdict synthesis

function computeHealthScore(
  signals: StructuralSignals,
  analysis: BlogAuditAnalysis
): { healthScore: number; severity: AuditSeverity } {
  const rubric = analysis.quality_rubric ?? [];
  const structural = structuralScoreFromRubric(rubric);
  const llm = analysis.llm_quality_score;

  let blended =
    typeof llm === 'number' && !Number.isNaN(llm)
      ? Math.round(llm * 0.48 + structural * 0.52)
      : structural;

  if (signals.url_rating != null && signals.url_rating < 8) blended -= 4;
  if (signals.refdomains != null && signals.refdomains > 0 && signals.refdomains < 4) blended -= 3;

  const demand = analysis.keyword_demand;
  if (demand) {
    if (demand.volume === 0) blended -= 6;
    else if (demand.volume < 50) blended -= 3;
    if (demand.verdict === 'declining') blended -= 5;
    if (demand.verdict === 'trending') blended += 3;
  }

  const highIssues = analysis.issues.filter(i => i.severity === 'high').length;
  blended -= Math.min(18, highIssues * 6);

  const healthScore = Math.max(0, Math.min(100, blended));
  const severity = criticalityFromScore(healthScore, analysis.page_status) as AuditSeverity;

  return {
    healthScore,
    severity,
  };
}

function synthesizeVerdict(signals: StructuralSignals, analysis: BlogAuditAnalysis): string {
  const highest = analysis.issues.find(i => i.severity === 'high') ?? analysis.issues[0];
  const demand = analysis.keyword_demand;

  const parts: string[] = [];
  if (demand) {
    if (demand.volume === 0) {
      parts.push('Keyword data shows zero monthly searches for this phrase — consider retargeting a related keyword with demand.');
    } else if (demand.trend_pct <= -25) {
      parts.push(`Searches for this keyword are down ${Math.abs(demand.trend_pct)}% — demand itself is fading.`);
    } else if (demand.volume > 500 && demand.trend_pct >= 0) {
      parts.push(`Keyword demand is healthy (${demand.volume.toLocaleString()}/mo, trend ${demand.trend_pct >= 0 ? '+' : ''}${demand.trend_pct}%). Fix on-page issues to capture it.`);
    }
  }
  if (highest) {
    parts.push(`Biggest fix: ${highest.label.toLowerCase()} — ${highest.fix}`);
  }
  return parts.join(' ') || 'No critical issues were flagged. Re-check after internal links and anchors improve.';
}

function ahrefsOnlyAnalysis(url: string, kws: AhrefsUrlKeyword[]): BlogAuditAnalysis {
  const primary = kws[0];
  const issues: BlogIssue[] = [];

  if (!primary) {
    issues.push({
      label: 'Not ranking for any keyword',
      category: 'seo',
      severity: 'high',
      detail: 'Rank data shows no keywords driving traffic to this URL.',
      why_it_matters: 'If the page has no ranking keywords, it cannot earn organic traffic.',
      fix: 'Align the page to a focus keyword with demand and add internal links from related posts.',
      impact: 'high',
    });
  } else {
    if (primary.position && primary.position > 20) {
      issues.push({
        label: 'Ranking too low to get clicks',
        category: 'seo',
        severity: 'medium',
        detail: `Top keyword "${primary.keyword}" ranks around position ${primary.position}.`,
        why_it_matters: 'Positions beyond page 2 get negligible clicks; the page needs on-page and internal link boosts.',
        fix: 'Tighten title/H1 to the target keyword and add 2–3 internal links from relevant posts.',
        impact: 'medium',
      });
    }
    if (primary.volume && primary.volume < 50) {
      issues.push({
        label: 'Low-demand keyword',
        category: 'keyword_demand',
        severity: 'medium',
        detail: `"${primary.keyword}" has low monthly searches.`,
        why_it_matters: 'Even with good rankings, low demand caps traffic.',
        fix: 'Retarget to a related term with higher volume and intent fit.',
        impact: 'medium',
      });
    }
  }

  const keywordDemand: KeywordDemand | undefined = primary
    ? {
        keyword: primary.keyword,
        volume: primary.volume,
        trend_pct: 0,
        monthly_searches: [],
        verdict: (primary.volume === 0
          ? 'unknown'
          : primary.volume < 30
            ? 'niche'
            : 'stable') as KeywordDemand['verdict'],
      }
    : undefined;

  return {
    summary: primary ? `Ranks for "${primary.keyword}"` : 'No ranking keywords found',
    primary_keyword: primary?.keyword ?? '',
    secondary_keywords: kws.slice(1, 6).map(k => k.keyword),
    issues,
    content_gaps: [],
    internal_link_opportunities: [],
    suggested_funnel_stage: '',
    llm_quality_score: undefined,
    keyword_demand: keywordDemand,
    plain_language_verdict: '',
    page_status: 'ok',
    quality_rubric: [],
  };
}
