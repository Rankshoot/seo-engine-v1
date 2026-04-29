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
 *   5. (Optional) Ask DataForSEO what the primary keyword's current monthly
 *      search volume + 12-month trend are, so the user can see "is this
 *      keyword still worth targeting?" at a glance.
 *   6. Compute a deterministic 0–100 health score blending structural signals
 *      + LLM quality score. Persist everything in `blog_audits`.
 */

// Hybrid scraper kept for potential fallback, currently unused in Ahrefs-first path.
import type { BusinessBrief } from './business-brief';
import {
  ahrefsAnchors,
  ahrefsCrawledPages,
  ahrefsPagesByInternalLinks,
  ahrefsUrlOrganicKeywords,
  type AhrefsCrawledPage,
  type AhrefsUrlKeyword,
} from './ahrefs';

export type AuditSeverity = 'low' | 'medium' | 'high';
export type AuditImpact = 'low' | 'medium' | 'high';
export type IssueCategory = 'technical' | 'seo' | 'content' | 'keyword_demand' | 'ux';

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
}

export interface AuditBlogInput {
  url: string;
  brief: BusinessBrief | null;
  /** Other blog URLs on this domain — used to suggest internal links. */
  sitePeerUrls: string[];
  /** Project region, used for localized search-volume data. */
  region?: string;
  language?: string;
}

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

export async function auditBlogUrl(input: AuditBlogInput): Promise<BlogAuditRecord> {
  const { url, brief, sitePeerUrls, region = 'us', language = 'en' } = input;

  // 1. Pre-flight via Ahrefs crawl (preferred). Only fall back to a real fetch
  //    when Ahrefs has no record for this URL.
  const ahrefsCrawl = await ahrefsCrawledPages(url);
  if (ahrefsCrawl) {
    if (ahrefsCrawl.http_code && (ahrefsCrawl.http_code === 404 || ahrefsCrawl.http_code === 410)) {
      return brokenUrlRecord(url, `Ahrefs crawl shows HTTP ${ahrefsCrawl.http_code}.`);
    }
    if (ahrefsCrawl.redirects_to_target && ahrefsCrawl.redirects_to_target > 0) {
      return redirectToHomepageRecord(url, url);
    }
  } else {
    // Fallback: lightweight fetch to avoid blind spots if Ahrefs hasn't crawled it yet.
    const pre = await preflight(url);
    if (pre.status === 'broken') return brokenUrlRecord(url, pre.reason);
    if (pre.status === 'redirected' && pre.finalUrl && pre.finalUrl !== url) {
      return redirectToHomepageRecord(url, pre.finalUrl);
    }
  }

  // 2. Ahrefs signals — ranking, anchors, internal links. No body scrape unless
  //    we truly need it.
  const [urlKeywords, anchors, internalLinks] = await Promise.all([
    ahrefsUrlOrganicKeywords(url, region, 40),
    ahrefsAnchors(url, 25),
    ahrefsPagesByInternalLinks(url, 1),
  ]);

  const signals: StructuralSignals = {
    title: '',
    word_count: 0,
    heading_count: 0,
    h2_count: 0,
    h3_count: 0,
    faq_section: false,
    internal_link_count: internalLinks[0]?.links_to_target ?? 0,
    external_link_count: 0, // approximated via anchors? anchors cover inbound; outgoing unavailable without scrape
    answer_first: false,
    has_schema_hints: false,
    first_paragraph: '',
    url_rating: ahrefsCrawl?.url_rating ?? null,
    refdomains: anchors.reduce((s, a) => s + a.refdomains, 0),
  };

  const analysis = ahrefsOnlyAnalysis(url, urlKeywords);

  // Optional: if you still want content-level checks, fall back to a scrape.
  // Currently disabled to honor "use Ahrefs instead of fetch/scrape".

  const { healthScore, severity } = scoreFromSignals(signals, analysis);

  return {
    url,
    title: analysis.primary_keyword ? `${analysis.primary_keyword} (Ahrefs)` : url,
    word_count: signals.word_count,
    scraped_chars: 0,
    health_score: healthScore,
    severity,
    primary_keyword: analysis.primary_keyword,
    analysis: { ...analysis, page_status: 'ok' },
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

// ────────────────────────────────────────────────────────────────────────────
// LLM diagnosis (blog standalone)

interface DiagnoseInput {
  url: string;
  page: JinaPage;
  signals: StructuralSignals;
  brief: BusinessBrief | null;
  sitePeerUrls: string[];
}

async function diagnoseWithGemini(input: DiagnoseInput): Promise<BlogAuditAnalysis> {
  const { url, page, signals, brief, sitePeerUrls } = input;

  if (!GEMINI_API_KEY) {
    return emptyAnalysis('GEMINI_API_KEY missing; skipping LLM diagnosis.');
  }

  const head = page.markdown.slice(0, 12_000);
  const peerSample = sitePeerUrls.filter(u => u !== url).slice(0, 30);

  // We keep business context MINIMAL — only the company name / niche — because
  // the audit is meant to diagnose THIS blog on its own merits. We do not want
  // "doesn't match your business brief" as an issue type.
  const briefContextLite = brief
    ? `SITE CONTEXT (for light grounding only — do NOT penalize this blog for "not matching" the brief): ${brief.summary}`
    : '';

  const prompt = `You are a senior SEO + GEO auditor. Audit the blog post below on its own merits — do NOT compare it to a business brief or other pages. Decide WHY this specific blog may not be getting traffic.

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

${briefContextLite}

PEER BLOG URLS ON THE SAME SITE (use ONLY these verbatim when suggesting internal_link_opportunities — never invent URLs):
${peerSample.map(u => `- ${u}`).join('\n') || '(none)'}

BLOG POST BODY (first ~12k chars of markdown):
---
${head}
---

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
- Maximum 8 issues. Order by severity desc then impact desc.
- "high" severity = likely blocks ranking or AI Overview citation today. "medium" = dents CTR/engagement. "low" = polish.
- Each fix must be specific to THIS post (reference the actual topic or heading when possible). No generic "write better content".
- Never invent issues unsupported by the signals or body text above.
- For "why_it_matters": use plain English. No words like "SERP", "canonicalize", "E-E-A-T", "SEO juice" without a 4-word inline explanation.
- "content_gaps" must be subtopics missing from this POST — not things your other blogs cover.

Return ONLY the JSON object.`;

  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 3072,
          responseMimeType: 'application/json',
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 180)}`);
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned empty text');
    const parsed = safeParseJson(text);
    if (!parsed) throw new Error('Gemini returned unparseable JSON');
    return coerceAnalysis(parsed, sitePeerUrls);
  } catch (e) {
    return emptyAnalysis(
      `LLM diagnosis failed: ${e instanceof Error ? e.message : String(e)}`
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
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Scoring + verdict synthesis

function scoreFromSignals(
  signals: StructuralSignals,
  analysis: BlogAuditAnalysis
): { healthScore: number; severity: AuditSeverity } {
  let score = 100;

  // Authority proxies
  if (signals.url_rating != null && signals.url_rating < 10) score -= 10;
  if (signals.refdomains != null && signals.refdomains < 5) score -= 8;

  // Internal links
  if (signals.internal_link_count === 0) score -= 15;
  else if (signals.internal_link_count < 2) score -= 8;

  // Keyword demand / coverage
  const demand = analysis.keyword_demand;
  if (demand) {
    if (demand.volume === 0) score -= 15;
    else if (demand.volume < 50) score -= 8;
    if (demand.trend_pct <= -25) score -= 10;
    else if (demand.trend_pct <= -10) score -= 5;
  }

  // Ranking presence
  if (!analysis.primary_keyword) score -= 15;

  const severity: AuditSeverity = analysis.issues.some(i => i.severity === 'high')
    ? 'high'
    : analysis.issues.some(i => i.severity === 'medium')
      ? 'medium'
      : 'low';

  return {
    healthScore: Math.max(0, Math.min(100, score)),
    severity,
  };
}

function synthesizeVerdict(signals: StructuralSignals, analysis: BlogAuditAnalysis): string {
  const highest = analysis.issues.find(i => i.severity === 'high') ?? analysis.issues[0];
  const demand = analysis.keyword_demand;

  const parts: string[] = [];
  if (demand) {
    if (demand.volume === 0) {
      parts.push('Ahrefs shows zero monthly searches for this phrase — consider retargeting a related keyword with demand.');
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
      detail: 'Ahrefs shows no keywords driving traffic to this URL.',
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

  const keywordDemand = primary
    ? {
        keyword: primary.keyword,
        volume: primary.volume,
        trend_pct: 0,
        monthly_searches: [],
        verdict: primary.volume === 0 ? 'unknown' : primary.volume < 30 ? 'niche' : 'stable',
      }
    : undefined;

  return {
    summary: primary ? `Ahrefs: ranks for "${primary.keyword}"` : 'Ahrefs: no ranking keywords found',
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
  };
}
