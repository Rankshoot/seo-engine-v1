/**
 * Content Audit Studio — production-grade blog audit pipeline.
 *
 * Flow:
 *   1. Preflight — cheap HTTP check to catch dead URLs early.
 *   2. Scrape    — Jina Reader → clean markdown (free, ~10M tokens/month).
 *   3. Signals   — deterministic extraction of structural SEO signals.
 *   4. Keyword   — primary keyword identification + DataForSEO/Ahrefs vitals.
 *   5. Competitors — top SERP URLs scraped via Jina (DataForSEO SERP if available).
 *   6. AI Analysis — single structured call: 6 scores + issues + revamp brief.
 *   7. Score     — deterministic override/blend where signals are reliable.
 *   8. Persist   — upsert to blog_audits table.
 */

import { z } from 'zod';
import { hybridReadUrl } from '@/services/hybridScraper';
import { readUrlViaJinaReader } from '@/lib/jina';
import { aiGenerateStructured } from '@/services/ai/providers';
import {
  fetchKeywordVitals,
  fetchGoogleOrganicSerpTopUrls,
} from '@/lib/dataforseo';
import type { KeywordVitals } from '@/lib/dataforseo';
import { locationCodeFromTargetRegion } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface ContentAuditScores {
  overall: number;
  seo: number;
  geo: number;
  aeo: number;
  content_quality: number;
  keyword_relevance: number;
  freshness: number;
}

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IssueCategory = 'seo' | 'geo' | 'aeo' | 'content' | 'keyword' | 'technical' | 'freshness';

export interface ContentAuditIssue {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  detail: string;
  impact: string;
  fix: string;
}

export interface CompetitorInsight {
  url: string;
  title: string;
  word_count: number;
  h2_count: number;
  has_faq: boolean;
  has_schema: boolean;
  rank: number;
  content_snippet: string;
  advantages: string[];
}

export interface RevampBrief {
  target_keyword: string;
  suggested_title: string;
  suggested_meta: string;
  content_angle: string;
  key_sections: string[];
  missing_topics: string[];
  competitor_gaps: string[];
  recommended_word_count: number;
  schema_types: string[];
  faq_questions: string[];
}

export interface QualityRubricRow {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface ContentAuditKeywordData {
  keyword: string;
  volume: number;
  trend_pct: number;
  verdict: 'trending' | 'stable' | 'declining' | 'niche' | 'unknown';
  monthly_searches: { month: string; volume: number }[];
}

export interface ContentAuditReport {
  version: 3;
  url: string;
  title: string;
  word_count: number;
  publish_date_detected: string | null;
  primary_keyword: string;
  secondary_keywords: string[];
  scores: ContentAuditScores;
  issues: ContentAuditIssue[];
  competitor_insights: CompetitorInsight[];
  revamp_brief: RevampBrief;
  quality_rubric: QualityRubricRow[];
  keyword_data: ContentAuditKeywordData | null;
  page_status: 'ok' | 'broken' | 'redirected' | 'empty';
  plain_language_verdict: string;
  summary: string;
  analyzed_at: string;
}

export interface PersistedContentAudit {
  id?: string;
  url: string;
  title: string;
  primary_keyword: string;
  word_count: number;
  health_score: number;
  severity: 'low' | 'medium' | 'high';
  analysis: ContentAuditReport;
  scraped_markdown?: string;
  updated_at?: string;
  error?: string;
}

export interface AuditStudioInput {
  url: string;
  projectId: string;
  projectDomain?: string;
  region?: string;
  language?: string;
  /** Pre-supplied content (from file upload). Skips scraping when provided. */
  uploadedContent?: string;
  /** Display title when content is uploaded rather than scraped */
  uploadedTitle?: string;
}

export interface AuditStudioResult {
  record: PersistedContentAudit;
  trace: { step: string; ok: boolean; detail?: string; ms?: number }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw HTML signal extraction
// ─────────────────────────────────────────────────────────────────────────────

interface RawHtmlSignals {
  title: string | null;
  metaDescription: string | null;
  hasSchema: boolean;
  schemaTypes: string[];
  publishDate: string | null;
}

async function fetchRawHtmlSignals(url: string): Promise<RawHtmlSignals> {
  const empty: RawHtmlSignals = {
    title: null, metaDescription: null, hasSchema: false, schemaTypes: [], publishDate: null,
  };
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RankshootBot/1.0)' },
    });
    clearTimeout(tid);
    if (!res.ok) return empty;
    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : null;

    const metaMatch =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,500})["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']{1,500})["'][^>]+name=["']description["']/i);
    const metaDescription = metaMatch ? metaMatch[1].trim() : null;

    const schemaMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    const hasSchema = schemaMatches.length > 0;
    const schemaTypes: string[] = [];
    for (const m of schemaMatches) {
      try {
        const parsed = JSON.parse(m[1]) as Record<string, unknown>;
        if (parsed['@type']) schemaTypes.push(String(parsed['@type']));
      } catch { /* malformed JSON-LD */ }
    }

    // Detect publish date from meta tags
    const publishDateMatch =
      html.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|datePublished|og:article:published_time)["'][^>]+content=["']([^"']{1,50})["']/i) ??
      html.match(/<time[^>]+datetime=["']([^"']{1,50})["']/i);
    const publishDate = publishDateMatch ? publishDateMatch[1].trim() : null;

    return { title, metaDescription, hasSchema, schemaTypes, publishDate };
  } catch {
    return empty;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Structural signal extraction
// ─────────────────────────────────────────────────────────────────────────────

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
  has_question_headings: boolean;
  publish_date: string | null;
}

function extractSignals(markdown: string, url: string, rawHtml: RawHtmlSignals): StructuralSignals {
  const title = extractTitle(markdown) || rawHtml.title || '';
  const wordCount = markdown.split(/\s+/).filter(Boolean).length;

  const headings = markdown.match(/^#{1,6}\s+.+$/gm) ?? [];
  const h2 = markdown.match(/^##\s+.+$/gm) ?? [];
  const h3 = markdown.match(/^###\s+.+$/gm) ?? [];
  const faqSection = /^##+\s*(faqs?|frequently asked questions)\b/im.test(markdown);
  const questionHeadings = headings.filter(h => /\?/.test(h)).length >= 2;

  const pageHost = safeHost(url);
  const linkRe = /\[[^\]]+\]\((https?:\/\/[^)]+)\)/g;
  let m: RegExpExecArray | null;
  let internal = 0;
  let external = 0;
  while ((m = linkRe.exec(markdown))) {
    const h = safeHost(m[1]);
    if (pageHost && h && (h === pageHost || h.endsWith(`.${pageHost}`))) internal++;
    else external++;
  }

  const firstPara = markdown.split('\n\n')
    .map(b => b.trim())
    .find(b => b && !b.startsWith('#') && !b.startsWith('!') && !b.startsWith('>')) ?? '';

  const answerFirst = firstPara.length > 60 && firstPara.length <= 420 && hasSharedNoun(firstPara, title);

  const hasSchemaHints =
    rawHtml.hasSchema ||
    /<script[^>]*type=["']application\/ld\+json["']/i.test(markdown) ||
    /"@type"\s*:\s*["'](Article|FAQPage|BlogPosting)/.test(markdown);

  // Detect publish date from markdown content
  const yearInContent = markdown.match(/\b(20\d{2})\b/g) ?? [];
  const latestYear = yearInContent.reduce((max, y) => Math.max(max, parseInt(y)), 0);
  const publishDate = rawHtml.publishDate || (latestYear >= 2020 ? `${latestYear}` : null);

  return {
    title, word_count: wordCount, heading_count: headings.length,
    h2_count: h2.length, h3_count: h3.length, faq_section: faqSection,
    internal_link_count: internal, external_link_count: external,
    answer_first: answerFirst, has_schema_hints: hasSchemaHints,
    first_paragraph: firstPara.slice(0, 500), has_question_headings: questionHeadings,
    publish_date: publishDate,
  };
}

function extractTitle(md: string): string {
  const h1 = md.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].replace(/\*+/g, '').trim();
  return '';
}

function safeHost(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}

function hasSharedNoun(a: string, b: string): boolean {
  const stop = new Set(['the', 'and', 'for', 'with', 'how', 'what', 'why', 'a', 'an', 'of', 'to', 'in', 'on', 'is', 'are']);
  const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 3 && !stop.has(t));
  const setA = new Set(tokens(a));
  for (const t of tokens(b)) if (setA.has(t)) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Competitor scraping
// ─────────────────────────────────────────────────────────────────────────────

interface ScrapedCompetitor {
  url: string;
  rank: number;
  markdown: string;
  title: string;
  word_count: number;
  h2_count: number;
  has_faq: boolean;
  has_schema: boolean;
}

async function scrapeTopCompetitors(
  keyword: string,
  excludeHost: string | null,
  locationCode: number,
): Promise<ScrapedCompetitor[]> {
  if (!keyword.trim()) return [];

  let serpUrls: { url: string; position: number; title: string }[] = [];
  try {
    const { urls } = await fetchGoogleOrganicSerpTopUrls(keyword, {
      locationCode,
      limit: 6,
      excludeHosts: excludeHost ? [excludeHost] : [],
    });
    serpUrls = urls.slice(0, 5).map(u => ({ url: u.url, position: u.position, title: u.title }));
  } catch {
    return [];
  }

  if (!serpUrls.length) return [];

  const results: ScrapedCompetitor[] = [];
  // Scrape top 3 in parallel via Jina (free)
  const toScrape = serpUrls.slice(0, 3);
  const scraped = await Promise.allSettled(
    toScrape.map(u => readUrlViaJinaReader(u.url, { timeoutMs: 20_000 }))
  );

  for (let i = 0; i < toScrape.length; i++) {
    const r = scraped[i];
    const meta = toScrape[i];
    if (r.status !== 'fulfilled' || !r.value.ok) continue;
    const md = r.value.markdown;
    if (md.length < 200) continue;

    const wordCount = md.split(/\s+/).filter(Boolean).length;
    const h2Count = (md.match(/^##\s+/gm) ?? []).length;
    const hasFaq = /^##+\s*(faqs?|frequently asked)/im.test(md);
    const hasSchema = /"@type"/i.test(md);
    const compTitle = extractTitle(md) || meta.title || meta.url;

    results.push({
      url: meta.url,
      rank: meta.position,
      markdown: md.slice(0, 4000), // keep first 4k chars for AI
      title: compTitle,
      word_count: wordCount,
      h2_count: h2Count,
      has_faq: hasFaq,
      has_schema: hasSchema,
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring — deterministic
// ─────────────────────────────────────────────────────────────────────────────

function computeSeoScore(signals: StructuralSignals, rawHtml: RawHtmlSignals, primaryKeyword: string): number {
  let score = 0;
  const kw = primaryKeyword.toLowerCase();

  if (kw && signals.title.toLowerCase().includes(kw)) score += 20;
  else if (kw && signals.title) score += 5; // title exists but no keyword
  else if (signals.title) score += 8;

  if (rawHtml.metaDescription) {
    const metaLen = rawHtml.metaDescription.length;
    if (kw && rawHtml.metaDescription.toLowerCase().includes(kw)) score += 15;
    else score += 5;
    if (metaLen >= 140 && metaLen <= 165) score += 5;
  }

  if (signals.h2_count >= 4 && signals.h3_count >= 2) score += 15;
  else if (signals.h2_count >= 2) score += 8;
  else if (signals.h2_count >= 1) score += 4;

  if (signals.has_schema_hints) score += 10;
  if (signals.internal_link_count >= 2) score += 10;
  else if (signals.internal_link_count >= 1) score += 5;
  if (signals.external_link_count >= 2) score += 10;
  else if (signals.external_link_count >= 1) score += 5;
  if (signals.word_count >= 1500) score += 15;
  else if (signals.word_count >= 800) score += 8;
  else if (signals.word_count >= 400) score += 4;

  return Math.min(100, score);
}

function computeGeoScore(signals: StructuralSignals): number {
  let score = 0;
  if (signals.answer_first) score += 35;
  else if (signals.first_paragraph.length > 100) score += 15;
  if (signals.external_link_count >= 3) score += 25;
  else if (signals.external_link_count >= 2) score += 18;
  else if (signals.external_link_count >= 1) score += 8;
  if (signals.h2_count >= 3 && signals.h3_count >= 2) score += 20;
  else if (signals.h2_count >= 2) score += 10;
  if (signals.word_count >= 1200) score += 20;
  else if (signals.word_count >= 700) score += 10;
  return Math.min(100, score);
}

function computeAeoScore(signals: StructuralSignals, rawHtml: RawHtmlSignals): number {
  let score = 0;
  if (signals.faq_section) score += 30;
  if (rawHtml.schemaTypes.includes('FAQPage')) score += 25;
  else if (rawHtml.hasSchema) score += 10;
  if (signals.has_question_headings) score += 25;
  if (rawHtml.schemaTypes.includes('Article') || rawHtml.schemaTypes.includes('BlogPosting')) score += 10;
  if (signals.answer_first) score += 10;
  return Math.min(100, score);
}

function computeContentQualityScore(signals: StructuralSignals, llmQualityScore: number | undefined): number {
  let det = 0;
  if (signals.word_count >= 1500) det += 25;
  else if (signals.word_count >= 900) det += 15;
  else if (signals.word_count >= 500) det += 8;
  if (signals.h2_count >= 4 && signals.h3_count >= 2) det += 20;
  else if (signals.h2_count >= 2) det += 12;
  if (signals.answer_first) det += 15;
  if (signals.faq_section) det += 15;
  if (signals.internal_link_count >= 2) det += 10;
  if (signals.external_link_count >= 2) det += 15;
  const deterministic = Math.min(100, det);

  if (llmQualityScore != null) {
    return Math.round(llmQualityScore * 0.55 + deterministic * 0.45);
  }
  return deterministic;
}

function computeKeywordRelevanceScore(vitals: KeywordVitals | undefined): number {
  if (!vitals) return 50; // neutral when no data
  let score = 0;
  const vol = vitals.volume;
  if (vol >= 1000) score += 35;
  else if (vol >= 500) score += 30;
  else if (vol >= 100) score += 20;
  else if (vol >= 50) score += 12;
  else if (vol >= 10) score += 6;
  const trend = vitals.trend_pct;
  if (trend >= 20) score += 35;
  else if (trend >= 5) score += 25;
  else if (trend >= -5) score += 18;
  else if (trend >= -15) score += 8;
  else score += 2;
  score += 30; // base for having data
  return Math.min(100, score);
}

function computeFreshnessScore(signals: StructuralSignals): number {
  if (!signals.publish_date) return 55; // neutral
  const nowYear = new Date().getFullYear();
  const yearMatch = signals.publish_date.match(/\b(20\d{2})\b/);
  if (!yearMatch) return 55;
  const pubYear = parseInt(yearMatch[1]);
  const age = nowYear - pubYear;
  if (age <= 0) return 95;
  if (age === 1) return 80;
  if (age === 2) return 60;
  if (age === 3) return 40;
  if (age === 4) return 25;
  return 15;
}

function computeOverallScore(scores: Omit<ContentAuditScores, 'overall'>): number {
  return Math.round(
    scores.seo * 0.25 +
    scores.geo * 0.20 +
    scores.aeo * 0.15 +
    scores.content_quality * 0.20 +
    scores.keyword_relevance * 0.10 +
    scores.freshness * 0.10
  );
}

function buildQualityRubric(signals: StructuralSignals, rawHtml: RawHtmlSignals): QualityRubricRow[] {
  const rows: QualityRubricRow[] = [];

  // 1. Direct answer in first 80 words
  rows.push({
    id: 'direct_answer',
    label: 'Direct answer in opening (GEO)',
    status: signals.answer_first ? 'pass' : signals.first_paragraph.length > 80 ? 'warn' : 'fail',
    detail: signals.answer_first
      ? 'Opening paragraph provides a clear direct answer — good for AI Overviews.'
      : 'Opening paragraph does not directly answer the main question — readers and AI must scroll to find the answer.',
  });

  // 2. H2/H3 structure
  rows.push({
    id: 'heading_structure',
    label: 'Modular H2 / H3 structure',
    status: (signals.h2_count >= 4 && signals.h3_count >= 2) ? 'pass' : signals.h2_count >= 2 ? 'warn' : 'fail',
    detail: `${signals.h2_count} H2 headings, ${signals.h3_count} H3 headings. ${signals.h2_count >= 4 ? 'Good hierarchy.' : 'Add more sub-sections for better scannability.'}`,
  });

  // 3. FAQ section
  rows.push({
    id: 'faq_section',
    label: 'FAQ section + FAQPage schema',
    status: (signals.faq_section && rawHtml.schemaTypes.includes('FAQPage')) ? 'pass' : (signals.faq_section || rawHtml.schemaTypes.includes('FAQPage')) ? 'warn' : 'fail',
    detail: `FAQ section: ${signals.faq_section ? 'yes' : 'no'} · FAQPage schema: ${rawHtml.schemaTypes.includes('FAQPage') ? 'yes' : 'no'}.`,
  });

  // 4. Article schema
  rows.push({
    id: 'article_schema',
    label: 'Article / BlogPosting schema',
    status: (rawHtml.schemaTypes.includes('Article') || rawHtml.schemaTypes.includes('BlogPosting')) ? 'pass' : rawHtml.hasSchema ? 'warn' : 'fail',
    detail: rawHtml.hasSchema
      ? `Schema types found: ${rawHtml.schemaTypes.join(', ') || 'generic'}.`
      : 'No structured data found on this page.',
  });

  // 5. Internal links
  rows.push({
    id: 'internal_links',
    label: 'Internal links to related posts',
    status: signals.internal_link_count >= 2 ? 'pass' : signals.internal_link_count >= 1 ? 'warn' : 'fail',
    detail: `${signals.internal_link_count} internal link(s) in the article body. Aim for 2–4.`,
  });

  // 6. External citations
  rows.push({
    id: 'external_citations',
    label: 'External citations (credibility)',
    status: signals.external_link_count >= 2 ? 'pass' : signals.external_link_count >= 1 ? 'warn' : 'fail',
    detail: `${signals.external_link_count} outbound link(s). Aim for 2–4 authoritative sources.`,
  });

  // 7. Content depth
  rows.push({
    id: 'content_depth',
    label: 'Content depth (word count)',
    status: signals.word_count >= 1500 ? 'pass' : signals.word_count >= 700 ? 'warn' : 'fail',
    detail: `~${signals.word_count.toLocaleString()} words. ${signals.word_count >= 1500 ? 'Sufficient depth.' : 'Consider expanding to 1,500+ words for competitive queries.'}`,
  });

  // 8. Question headings (AEO)
  rows.push({
    id: 'question_headings',
    label: 'Question-style headings (AEO)',
    status: signals.has_question_headings ? 'pass' : 'fail',
    detail: signals.has_question_headings
      ? 'Multiple headings phrased as questions — good for featured snippets and voice search.'
      : 'No question-phrased headings found. Rephrase 2–3 H2s as "How…?", "What is…?" etc.',
  });

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI analysis schema
// ─────────────────────────────────────────────────────────────────────────────

const AuditAnalysisSchema = z.object({
  primary_keyword: z.string(),
  secondary_keywords: z.array(z.string()),
  summary: z.string(),
  plain_language_verdict: z.string(),
  llm_quality_score: z.number().min(0).max(100),
  publish_date_estimate: z.string().optional(),
  issues: z.array(z.object({
    id: z.string(),
    category: z.enum(['seo', 'geo', 'aeo', 'content', 'keyword', 'technical', 'freshness']),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    title: z.string(),
    detail: z.string(),
    impact: z.string(),
    fix: z.string(),
  })),
  competitor_insights: z.array(z.object({
    url: z.string(),
    advantages: z.array(z.string()),
  })),
  revamp_brief: z.object({
    target_keyword: z.string(),
    suggested_title: z.string(),
    suggested_meta: z.string(),
    content_angle: z.string(),
    key_sections: z.array(z.string()),
    missing_topics: z.array(z.string()),
    competitor_gaps: z.array(z.string()),
    recommended_word_count: z.number(),
    schema_types: z.array(z.string()),
    faq_questions: z.array(z.string()),
  }).optional(),
});

async function runAiAnalysis(
  url: string,
  markdown: string,
  signals: StructuralSignals,
  rawHtml: RawHtmlSignals,
  competitors: ScrapedCompetitor[],
  vitals: KeywordVitals | undefined,
  projectId: string,
): Promise<z.infer<typeof AuditAnalysisSchema>> {
  const contentSnippet = markdown.slice(0, 14_000);
  const tailSnippet = markdown.length > 22_000 ? markdown.slice(-6_000) : '';
  const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const competitorBlock = competitors.length
    ? `\nCOMPETITOR ANALYSIS (top ${competitors.length} ranking pages for the same keyword):\n` +
      competitors.map((c, i) => `
Competitor #${i + 1} (rank ~${c.rank}): ${c.url}
  Title: ${c.title}
  Word count: ~${c.word_count} words
  H2 sections: ${c.h2_count}
  Has FAQ: ${c.has_faq ? 'yes' : 'no'}
  Has schema: ${c.has_schema ? 'yes' : 'no'}
  Opening content:
  ${c.markdown.slice(0, 1_200)}
`).join('\n')
    : '\nNo competitor data available (SERP lookup not configured).';

  const keywordBlock = vitals
    ? `\nKEYWORD DATA: "${vitals.keyword}" — volume: ${vitals.volume}/mo, trend: ${vitals.trend_pct >= 0 ? '+' : ''}${vitals.trend_pct}%`
    : '';

  const prompt = `You are a world-class SEO + GEO + AEO content auditor for Rankshoot, an AI SEO platform. Today's date is ${currentDate}.

Analyze the blog post below and produce a comprehensive, actionable audit. This audit will be used to generate a revamped version of this blog.

TARGET AUDIENCE: The output will be read by the blog's author/owner — a business person, not an SEO expert. Use plain English. Explain any SEO/GEO/AEO term you use in a brief parenthetical.

BLOG URL: ${url}

CURRENT DATE: ${currentDate} — use this to assess content freshness and flag outdated information.

STRUCTURAL SIGNALS (deterministic — trust these):
- Title: ${signals.title || '(not found)'}
- Word count: ${signals.word_count}
- H2 sections: ${signals.h2_count}
- H3 sub-sections: ${signals.h3_count}
- FAQ section: ${signals.faq_section ? 'yes' : 'no'}
- Internal links: ${signals.internal_link_count}
- External citations: ${signals.external_link_count}
- Direct answer in opening: ${signals.answer_first ? 'yes' : 'no'}
- Schema / structured data: ${rawHtml.hasSchema ? `yes (${rawHtml.schemaTypes.join(', ') || 'unknown types'})` : 'no'}
- Meta description: ${rawHtml.metaDescription || '(missing)'}
- Publish date detected: ${signals.publish_date || '(not detected)'}

${keywordBlock}
${competitorBlock}

BLOG CONTENT (first ~14k chars):
---
${contentSnippet}
---
${tailSnippet ? `\nCONTENT TAIL (last ~6k chars):\n---\n${tailSnippet}\n---` : ''}

SCORING DEFINITIONS:
- SEO: Title/meta keyword placement, heading structure, schema, link count
- GEO (Generative Engine Optimization): Direct answer first, factual clarity, cited sources — optimized for AI like ChatGPT/Perplexity citing this page
- AEO (Answer Engine Optimization): FAQ format, question headings, featured snippet structure, voice search readiness
- Content Quality: Depth, structure, usefulness, real examples vs filler, up-to-date info
- Freshness: How current is this content? Does it have outdated stats, old references, or stale context?

ISSUE SEVERITY GUIDE:
- critical: This BLOCKS ranking or AI citation today (e.g., broken schema, keyword missing from title, 0 word content)
- high: Major ranking/traffic loss (e.g., missing meta, no FAQ, poor answer structure)
- medium: Dents CTR or engagement (e.g., weak intro, low word count for topic, missing citations)
- low: Polish items (e.g., minor keyword density, a few more internal links)

OUTPUT RULES:
1. Maximum 10 issues. Prioritize by severity DESC, then impact DESC.
2. Every issue must be specific to THIS post. No generic advice.
3. Every fix must be concrete and actionable (what exactly to write/add/change).
4. The revamp_brief is a production brief that will be given to an AI writer — make it comprehensive.
5. Competitor gaps should be specific (what exactly are competitors covering that this post misses?).
6. For faq_questions: write actual questions a reader/searcher would type, in natural language.
7. llm_quality_score: holistic quality 0–100. 90+ = excellent on all dimensions. 70–89 = solid with gaps. 50–69 = several issues. <50 = major problems.

Return ONLY this JSON (no prose, no markdown fences):

{
  "primary_keyword": "the main keyword this post targets (2-5 words, lowercase)",
  "secondary_keywords": ["up to 8 supporting keywords visible in headings"],
  "summary": "one sentence: what this post is about and who it's for",
  "plain_language_verdict": "2-3 sentences a business owner can read in 10 seconds: is this content competitive, what's the single biggest opportunity, and roughly how much work to fix it",
  "llm_quality_score": 0,
  "publish_date_estimate": "best-guess year or date if detectable from content (e.g. '2023' or '2023-06'), else omit",
  "issues": [
    {
      "id": "unique_snake_case_id",
      "category": "seo|geo|aeo|content|keyword|technical|freshness",
      "severity": "critical|high|medium|low",
      "title": "Short title (max 6 words, plain English)",
      "detail": "What is wrong with this specific post (1 sentence)",
      "impact": "Why this hurts traffic/rankings/AI citations (1 sentence)",
      "fix": "Exactly what to do to fix this (1-2 sentences, specific to this post)"
    }
  ],
  "competitor_insights": [
    {
      "url": "exact competitor URL",
      "advantages": ["specific thing competitor does better than this post"]
    }
  ],
  "revamp_brief": {
    "target_keyword": "the primary keyword to optimize for",
    "suggested_title": "A new, optimized H1 title for this post",
    "suggested_meta": "A new meta description 150-160 chars with keyword",
    "content_angle": "The specific angle/hook this post should take to beat competitors",
    "key_sections": ["H2 section 1", "H2 section 2", "..."],
    "missing_topics": ["topic/subtopic missing from current post"],
    "competitor_gaps": ["specific gap vs competitors that we must fill"],
    "recommended_word_count": 1800,
    "schema_types": ["Article", "FAQPage"],
    "faq_questions": ["Question 1?", "Question 2?"]
  }
}`;

  return aiGenerateStructured('content-audit', prompt, AuditAnalysisSchema, {
    temperature: 0.2,
    projectId,
    timeoutMs: 120_000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function auditContentUrl(input: AuditStudioInput): Promise<AuditStudioResult> {
  const trace: { step: string; ok: boolean; detail?: string; ms?: number }[] = [];
  const { url, projectId, projectDomain, region = 'us', language = 'en', uploadedContent, uploadedTitle } = input;

  let pageMarkdown: string;
  let rawHtml: RawHtmlSignals;

  if (uploadedContent && uploadedContent.trim().length >= 160) {
    // Uploaded content — skip preflight and scraping
    trace.push({ step: 'preflight', ok: true, detail: 'skipped (uploaded content)', ms: 0 });
    pageMarkdown = uploadedContent;
    rawHtml = { title: uploadedTitle ?? null, metaDescription: null, hasSchema: false, schemaTypes: [], publishDate: null };
    trace.push({ step: 'scrape', ok: true, detail: `${pageMarkdown.length} chars (uploaded)`, ms: 0 });
  } else {
    // 1. Preflight
    const t0 = Date.now();
    const pre = await preflight(url);
    trace.push({ step: 'preflight', ok: pre.status !== 'broken', detail: pre.status, ms: Date.now() - t0 });

    if (pre.status === 'broken') {
      return { record: brokenRecord(url, (pre as { status: 'broken'; reason: string }).reason), trace };
    }
    if (pre.status === 'redirected') {
      const redir = pre as { status: 'redirected'; finalUrl: string };
      return { record: redirectedRecord(url, redir.finalUrl), trace };
    }

    // 2. Scrape (Jina + raw HTML in parallel)
    const t1 = Date.now();
    const [page, rawHtmlResult] = await Promise.all([
      hybridReadUrl(url, { timeoutMs: 25_000 }),
      fetchRawHtmlSignals(url),
    ]);
    rawHtml = rawHtmlResult;
    trace.push({ step: 'scrape', ok: page.ok, detail: page.ok ? `${page.markdown.length} chars` : page.error, ms: Date.now() - t1 });

    if (!page.ok || page.markdown.trim().length < 160) {
      return { record: emptyRecord(url, page.error ?? 'Could not read page content'), trace };
    }
    pageMarkdown = page.markdown;
  }

  // 3. Extract structural signals
  const signals = extractSignals(pageMarkdown, url, rawHtml);
  if (rawHtml.title && !signals.title) signals.title = rawHtml.title;
  if (uploadedTitle && !signals.title) signals.title = uploadedTitle;

  // 4. Keyword vitals lookup
  const locationCode = locationCodeFromTargetRegion(region);
  const t2 = Date.now();
  let vitals: KeywordVitals | undefined;
  let primaryKeywordForSearch = '';
  try {
    // Extract keyword from URL slug (e.g. /ai-specialist/ → "ai specialist")
    const urlPath = new URL(url).pathname;
    const slug = urlPath.split('/').filter(Boolean).pop() ?? '';
    primaryKeywordForSearch = slug
      .replace(/\.[a-z0-9]{2,5}$/i, '') // strip extension
      .replace(/[-_]/g, ' ')
      .replace(/[^a-z0-9\s]/gi, '')
      .trim()
      .toLowerCase();
  } catch { /* no keyword */ }

  let vitalsMap = new Map<string, KeywordVitals>();
  if (primaryKeywordForSearch) {
    try {
      vitalsMap = await fetchKeywordVitals([primaryKeywordForSearch], region, language);
      vitals = vitalsMap.get(primaryKeywordForSearch.toLowerCase());
      trace.push({ step: 'keyword_vitals', ok: true, detail: primaryKeywordForSearch, ms: Date.now() - t2 });
    } catch (e) {
      trace.push({ step: 'keyword_vitals', ok: false, detail: String(e), ms: Date.now() - t2 });
    }
  }

  // 5. Competitor scraping
  const t3 = Date.now();
  const excludeHost = projectDomain ? safeHost(`https://${projectDomain}`) : safeHost(url);
  let competitors: ScrapedCompetitor[] = [];
  try {
    competitors = await scrapeTopCompetitors(primaryKeywordForSearch, excludeHost, locationCode);
    trace.push({ step: 'competitor_scrape', ok: true, detail: `${competitors.length} competitors`, ms: Date.now() - t3 });
  } catch (e) {
    trace.push({ step: 'competitor_scrape', ok: false, detail: String(e), ms: Date.now() - t3 });
  }

  // 6. AI analysis
  const t4 = Date.now();
  let aiResult: z.infer<typeof AuditAnalysisSchema>;
  try {
    aiResult = await runAiAnalysis(url, pageMarkdown, signals, rawHtml, competitors, vitals, projectId);
    trace.push({ step: 'ai_analysis', ok: true, ms: Date.now() - t4 });
  } catch (e) {
    trace.push({ step: 'ai_analysis', ok: false, detail: String(e), ms: Date.now() - t4 });
    return { record: errorRecord(url, signals, `AI analysis failed: ${e instanceof Error ? e.message : String(e)}`), trace };
  }

  // 7. Refine keyword vitals using AI-identified primary keyword
  const aiKeyword = aiResult.primary_keyword.trim().toLowerCase();
  if (aiKeyword && aiKeyword !== primaryKeywordForSearch.toLowerCase()) {
    try {
      const refined = await fetchKeywordVitals([aiKeyword], region, language);
      const rv = refined.get(aiKeyword);
      if (rv) { vitals = rv; vitalsMap.set(aiKeyword, rv); }
    } catch { /* use existing vitals */ }
  }
  if (!vitals && vitalsMap.size > 0) {
    vitals = vitalsMap.values().next().value;
  }

  // 8. Compute all scores
  const seoScore = computeSeoScore(signals, rawHtml, aiKeyword || primaryKeywordForSearch);
  const geoScore = computeGeoScore(signals);
  const aeoScore = computeAeoScore(signals, rawHtml);
  const contentQuality = computeContentQualityScore(signals, aiResult.llm_quality_score);
  const keywordRelevance = computeKeywordRelevanceScore(vitals);
  const freshnessScore = computeFreshnessScore({
    ...signals,
    publish_date: aiResult.publish_date_estimate ?? signals.publish_date,
  });

  const scoresWithoutOverall = {
    seo: seoScore,
    geo: geoScore,
    aeo: aeoScore,
    content_quality: contentQuality,
    keyword_relevance: keywordRelevance,
    freshness: freshnessScore,
  };
  const overall = computeOverallScore(scoresWithoutOverall);
  const scores: ContentAuditScores = { overall, ...scoresWithoutOverall };

  // 9. Quality rubric
  const qualityRubric = buildQualityRubric(signals, rawHtml);

  // 10. Keyword data shape
  const keywordData: ContentAuditKeywordData | null = vitals
    ? {
        keyword: vitals.keyword,
        volume: vitals.volume,
        trend_pct: vitals.trend_pct,
        verdict: vitals.volume === 0 ? 'unknown'
          : vitals.volume < 40 ? 'niche'
          : vitals.trend_pct >= 8 ? 'trending'
          : vitals.trend_pct <= -12 ? 'declining'
          : 'stable',
        monthly_searches: vitals.monthly_searches ?? [],
      }
    : null;

  // 11. Build competitor insights with AI-enriched advantages
  const competitorInsights: CompetitorInsight[] = competitors.map(c => {
    const aiComp = aiResult.competitor_insights.find(ci => ci.url === c.url);
    return {
      url: c.url,
      title: c.title,
      word_count: c.word_count,
      h2_count: c.h2_count,
      has_faq: c.has_faq,
      has_schema: c.has_schema,
      rank: c.rank,
      content_snippet: c.markdown.slice(0, 300),
      advantages: aiComp?.advantages ?? [],
    };
  });

  // 12. Assemble issues with dedup
  const issues: ContentAuditIssue[] = aiResult.issues
    .slice(0, 10)
    .map(i => ({
      id: i.id || `issue_${Math.random().toString(36).slice(2, 8)}`,
      category: i.category,
      severity: i.severity,
      title: i.title.slice(0, 80),
      detail: i.detail,
      impact: i.impact,
      fix: i.fix,
    }));

  const report: ContentAuditReport = {
    version: 3,
    url,
    title: signals.title || rawHtml.title || aiResult.primary_keyword || url,
    word_count: signals.word_count,
    publish_date_detected: aiResult.publish_date_estimate ?? signals.publish_date,
    primary_keyword: aiKeyword || primaryKeywordForSearch,
    secondary_keywords: aiResult.secondary_keywords.slice(0, 8),
    scores,
    issues,
    competitor_insights: competitorInsights,
    revamp_brief: aiResult.revamp_brief ?? emptyRevamp(),
    quality_rubric: qualityRubric,
    keyword_data: keywordData,
    page_status: 'ok',
    plain_language_verdict: aiResult.plain_language_verdict,
    summary: aiResult.summary,
    analyzed_at: new Date().toISOString(),
  };

  const severity = overall >= 70 ? 'low' : overall >= 45 ? 'medium' : 'high';

  return {
    record: {
      url,
      title: report.title,
      primary_keyword: report.primary_keyword,
      word_count: report.word_count,
      health_score: overall,
      severity,
      analysis: report,
      scraped_markdown: pageMarkdown.length > 50_000 ? pageMarkdown.slice(0, 50_000) : pageMarkdown,
    },
    trace,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Preflight check
// ─────────────────────────────────────────────────────────────────────────────

async function preflight(url: string): Promise<
  | { status: 'ok' }
  | { status: 'broken'; reason: string }
  | { status: 'redirected'; finalUrl: string }
> {
  try {
    const res = await fetch(url, {
      method: 'GET', redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RankshootAudit/1.0)' },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status === 404 || res.status === 410) {
      return { status: 'broken', reason: `The page returned HTTP ${res.status} — it no longer exists.` };
    }
    if (res.status >= 500) {
      return { status: 'broken', reason: `Server returned HTTP ${res.status}.` };
    }
    if (res.redirected && res.url && res.url !== url) {
      return { status: 'redirected', finalUrl: res.url };
    }
    return { status: 'ok' };
  } catch (e) {
    return { status: 'broken', reason: `Could not reach this page: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error/edge case record builders
// ─────────────────────────────────────────────────────────────────────────────

function emptyScores(overall = 0): ContentAuditScores {
  return { overall, seo: 0, geo: 0, aeo: 0, content_quality: 0, keyword_relevance: 0, freshness: 0 };
}

function emptyRevamp(keyword = ''): RevampBrief {
  return {
    target_keyword: keyword, suggested_title: '', suggested_meta: '',
    content_angle: '', key_sections: [], missing_topics: [], competitor_gaps: [],
    recommended_word_count: 1500, schema_types: ['Article', 'FAQPage'], faq_questions: [],
  };
}

function brokenRecord(url: string, reason: string): PersistedContentAudit {
  const report: ContentAuditReport = {
    version: 3, url, title: '(page not reachable)', word_count: 0, publish_date_detected: null,
    primary_keyword: '', secondary_keywords: [], scores: emptyScores(0),
    issues: [{
      id: 'page_broken', category: 'technical', severity: 'critical',
      title: 'Page is not reachable',
      detail: reason,
      impact: 'Google cannot crawl or index this page. Any backlinks or rankings are lost.',
      fix: 'Restore the page content or set up a 301 redirect to the closest relevant page.',
    }],
    competitor_insights: [], revamp_brief: emptyRevamp(), quality_rubric: [], keyword_data: null,
    page_status: 'broken',
    plain_language_verdict: 'This page is dead. Fix the redirect or restore the content before doing any SEO work.',
    summary: 'Page is not reachable.', analyzed_at: new Date().toISOString(),
  };
  return { url, title: '(page not reachable)', primary_keyword: '', word_count: 0, health_score: 0, severity: 'high', analysis: report, error: reason };
}

function redirectedRecord(url: string, finalUrl: string): PersistedContentAudit {
  const report: ContentAuditReport = {
    version: 3, url, title: '(redirected)', word_count: 0, publish_date_detected: null,
    primary_keyword: '', secondary_keywords: [], scores: emptyScores(10),
    issues: [{
      id: 'page_redirected', category: 'technical', severity: 'critical',
      title: 'Redirects to another page',
      detail: `${url} redirects to ${finalUrl}`,
      impact: 'Search engines treat this as a soft-404 and drop any rankings the original URL had.',
      fix: 'If the content was moved, set up a proper 301 redirect to the new location. If deleted, restore the original page.',
    }],
    competitor_insights: [], revamp_brief: emptyRevamp(), quality_rubric: [], keyword_data: null,
    page_status: 'redirected',
    plain_language_verdict: 'This URL redirects away. Any SEO equity from the original page is being lost.',
    summary: 'Page redirects to another URL.', analyzed_at: new Date().toISOString(),
  };
  return { url, title: '(redirected)', primary_keyword: '', word_count: 0, health_score: 10, severity: 'high', analysis: report };
}

function emptyRecord(url: string, reason: string): PersistedContentAudit {
  const report: ContentAuditReport = {
    version: 3, url, title: '(could not read page)', word_count: 0, publish_date_detected: null,
    primary_keyword: '', secondary_keywords: [], scores: emptyScores(12),
    issues: [{
      id: 'page_unreadable', category: 'technical', severity: 'high',
      title: 'Page content not readable',
      detail: reason,
      impact: 'If our scraper cannot read the content, search engine bots may struggle too.',
      fix: 'Ensure the page returns public HTML content. Avoid hard bot-blocks or full JavaScript rendering without SSR.',
    }],
    competitor_insights: [], revamp_brief: emptyRevamp(), quality_rubric: [], keyword_data: null,
    page_status: 'empty',
    plain_language_verdict: 'We could not read this page. Fix the readability first, then re-run the audit.',
    summary: 'Could not extract content from this page.', analyzed_at: new Date().toISOString(),
  };
  return { url, title: '(could not read page)', primary_keyword: '', word_count: 0, health_score: 12, severity: 'high', analysis: report, error: reason };
}

function errorRecord(url: string, signals: StructuralSignals, error: string): PersistedContentAudit {
  const report: ContentAuditReport = {
    version: 3, url, title: signals.title || url, word_count: signals.word_count,
    publish_date_detected: signals.publish_date, primary_keyword: '', secondary_keywords: [],
    scores: emptyScores(0),
    issues: [{
      id: 'analysis_error', category: 'technical', severity: 'high',
      title: 'Analysis failed',
      detail: error,
      impact: 'Could not complete the audit.',
      fix: 'Please try again. If the error persists, contact support.',
    }],
    competitor_insights: [], revamp_brief: emptyRevamp(), quality_rubric: [], keyword_data: null,
    page_status: 'ok',
    plain_language_verdict: 'The audit could not complete. Please try again.',
    summary: 'Analysis error.', analyzed_at: new Date().toISOString(),
  };
  return { url, title: signals.title || url, primary_keyword: '', word_count: signals.word_count, health_score: 0, severity: 'high', analysis: report, error };
}

// Re-export type for compatibility with dataforseo import
export type { KeywordVitals };
