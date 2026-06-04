import { geminiGenerate } from '@/lib/gemini';
import { parseLooseJson } from '@/services/ai/providers';
import { readUrlViaJinaReader } from '@/lib/jina';
import { fetchGoogleOrganicSerpTopUrls, type DataForSEOTraceEntry } from '@/lib/dataforseo';
import { locationCodeFromTargetRegion } from '@/lib/types';
import {
  type DeepAnalysisImpact,
  type CompetitorPageExtract,
  type BlogDeepAnalysisPriorityFix,
  type BlogDeepAnalysisScoreParameter,
  type BlogSectionCompetitorGap,
  type BlogDeepAnalysisResult,
  DEEP_ANALYSIS_SCORE_PARAMETER_DEFS,
  type DeepAnalysisTraceEntry,
  type RunBlogDeepAnalysisInput,
  type RunBlogDeepAnalysisOutput,
} from './blog-deep-analysis-types';

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function plainWordCount(md: string): number {
  const plain = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/[#>*_`~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain ? plain.split(/\s+/).length : 0;
}

function extractHeadings(md: string): { h1: string[]; h2: string[]; h3: string[] } {
  const h1: string[] = [];
  const h2: string[] = [];
  const h3: string[] = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^(#{1,3})\s+(.+)$/);
    if (!m) continue;
    const text = m[2].replace(/\*+/g, '').trim();
    if (!text) continue;
    if (m[1] === '#') h1.push(text);
    else if (m[1] === '##') h2.push(text);
    else h3.push(text);
  }
  return { h1, h2, h3 };
}

function extractMarkdownTables(md: string): string[] {
  const blocks: string[] = [];
  const lines = md.split('\n');
  let buf: string[] = [];
  for (const line of lines) {
    if (/^\|.+\|/.test(line.trim())) {
      buf.push(line);
    } else if (buf.length >= 2) {
      blocks.push(buf.join('\n').slice(0, 800));
      buf = [];
    } else {
      buf = [];
    }
  }
  if (buf.length >= 2) blocks.push(buf.join('\n').slice(0, 800));
  return blocks.slice(0, 12);
}

function extractLists(md: string): string[] {
  const out: string[] = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^\s*[-*+]\s+(.+)$/);
    if (m) out.push(m[1].replace(/\*+/g, '').trim().slice(0, 200));
    const n = line.match(/^\s*\d+\.\s+(.+)$/);
    if (n) out.push(n[1].replace(/\*+/g, '').trim().slice(0, 200));
  }
  return [...new Set(out)].slice(0, 40);
}

function extractFaqs(md: string, headings: { h2: string[]; h3: string[] }): string[] {
  const faqs: string[] = [];
  if (/faq|frequently asked questions/i.test(md)) {
    for (const h of [...headings.h2, ...headings.h3]) {
      if (/\?/.test(h)) faqs.push(h);
    }
  }
  for (const h of [...headings.h2, ...headings.h3]) {
    if (/\?\s*$/.test(h)) faqs.push(h);
  }
  return [...new Set(faqs)].slice(0, 20);
}

function extractLinks(
  md: string,
  pageUrl: string
): { internal: string[]; external: string[] } {
  const host = safeHost(pageUrl);
  const internal: string[] = [];
  const external: string[] = [];
  const re = /\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g;
  for (const m of md.matchAll(re)) {
    const href = m[1];
    const linkHost = safeHost(href);
    if (!linkHost) continue;
    if (host && (linkHost === host || linkHost.endsWith(`.${host}`))) internal.push(href);
    else external.push(href);
  }
  return {
    internal: [...new Set(internal)].slice(0, 30),
    external: [...new Set(external)].slice(0, 30),
  };
}

function extractImages(md: string): string[] {
  return [...new Set((md.match(/!\[[^\]]*\]\(([^)]+)\)/g) ?? []).map(m => {
    const u = m.match(/\(([^)]+)\)/);
    return u?.[1] ?? '';
  }).filter(Boolean))].slice(0, 20);
}

function extractCtas(md: string): string[] {
  const patterns = [
    /\b(sign up|signup|get started|book a demo|request demo|free trial|contact us|download now|subscribe)\b/gi,
  ];
  const out: string[] = [];
  for (const p of patterns) {
    for (const m of md.matchAll(p)) {
      if (m[0]) out.push(m[0].trim());
    }
  }
  return [...new Set(out)].slice(0, 12);
}

function extractMetaFromJina(md: string): { title: string; metaDescription: string; author: string } {
  const titleMatch = md.match(/(?:^|\n)Title:\s*(.+)\n/i);
  const metaMatch = md.match(/(?:^|\n)(?:Description|Meta-Description):\s*(.+)\n/i);
  const authorMatch = md.match(/(?:^|\n)Author:\s*(.+)\n/i);
  return {
    title: titleMatch?.[1]?.trim() ?? '',
    metaDescription: metaMatch?.[1]?.trim() ?? '',
    author: authorMatch?.[1]?.trim() ?? '',
  };
}

function extractDates(md: string): { publishDate: string; updatedDate: string } {
  const published =
    md.match(/(?:published|publish(?:ed)? date|date published)[:\s]+([^\n]+)/i)?.[1]?.trim() ?? '';
  const updated =
    md.match(/(?:updated|last updated|modified)[:\s]+([^\n]+)/i)?.[1]?.trim() ?? '';
  return { publishDate: published.slice(0, 80), updatedDate: updated.slice(0, 80) };
}

function extractEntitiesAndSemantic(md: string, keyword: string): { entities: string[]; semanticKeywords: string[] } {
  const entities = new Set<string>();
  const semantic = new Set<string>();

  for (const m of md.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g)) {
    const phrase = m[1].trim();
    if (phrase.length > 3 && phrase.length < 48) entities.add(phrase);
  }

  const kwParts = keyword.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  for (const line of md.split('\n')) {
    const lower = line.toLowerCase();
    if (kwParts.some(p => lower.includes(p))) {
      const words = lower.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 4);
      for (const w of words) {
        if (!kwParts.includes(w)) semantic.add(w);
      }
    }
  }

  return {
    entities: [...entities].slice(0, 25),
    semanticKeywords: [...semantic].slice(0, 30),
  };
}

export function extractCompetitorPageFromMarkdown(url: string, markdown: string): CompetitorPageExtract {
  const headings = extractHeadings(markdown);
  const meta = extractMetaFromJina(markdown);
  const dates = extractDates(markdown);
  const { entities, semanticKeywords } = extractEntitiesAndSemantic(markdown, '');
  const h1First = headings.h1[0] ?? '';

  return {
    url,
    title: meta.title || h1First || '',
    metaDescription: meta.metaDescription,
    headings,
    wordCount: plainWordCount(markdown),
    faqs: extractFaqs(markdown, { h2: headings.h2, h3: headings.h3 }),
    tables: extractMarkdownTables(markdown),
    lists: extractLists(markdown),
    entities,
    semanticKeywords,
    schema: [],
    images: extractImages(markdown),
    links: extractLinks(markdown, url),
    publishDate: dates.publishDate,
    updatedDate: dates.updatedDate,
    author: meta.author,
    ctas: extractCtas(markdown),
    content: markdown.slice(0, 14_000),
  };
}

export async function scrapeCompetitorPages(
  urls: string[],
  onProgress?: (detail: string) => void
): Promise<{ pages: CompetitorPageExtract[]; failures: string[] }> {
  const pages: CompetitorPageExtract[] = [];
  const failures: string[] = [];

  await Promise.all(
    urls.map(async url => {
      onProgress?.(url);
      const jina = await readUrlViaJinaReader(url, { timeoutMs: 28_000 });
      if (!jina.ok || jina.markdown.length < 120) {
        failures.push(`${url}: ${jina.error ?? 'empty content'}`);
        pages.push({
          url,
          title: '',
          metaDescription: '',
          headings: { h1: [], h2: [], h3: [] },
          wordCount: 0,
          faqs: [],
          tables: [],
          lists: [],
          entities: [],
          semanticKeywords: [],
          schema: [],
          images: [],
          links: { internal: [], external: [] },
          publishDate: '',
          updatedDate: '',
          author: '',
          ctas: [],
          content: '',
          scrapeError: jina.error ?? 'Failed to scrape',
        });
        return;
      }
      pages.push(extractCompetitorPageFromMarkdown(url, jina.markdown));
    })
  );

  pages.sort((a, b) => urls.indexOf(a.url) - urls.indexOf(b.url));
  return { pages, failures };
}

function normalizeImpact(v: unknown): DeepAnalysisImpact {
  const impact = String(v ?? 'Medium');
  return impact === 'High' || impact === 'Low' ? impact : 'Medium';
}

function normalizeScoreParameters(raw: unknown): BlogDeepAnalysisScoreParameter[] {
  const rows = Array.isArray(raw) ? raw : [];
  const byId = new Map<string, BlogDeepAnalysisScoreParameter>();

  for (const row of rows) {
    const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
    const id = String(r.id ?? '').trim();
    if (!id) continue;
    byId.set(id, {
      id,
      label: String(r.label ?? id).trim(),
      weight: Math.max(0, Math.min(100, Math.round(Number(r.weight ?? 0) || 0))),
      score: Math.max(0, Math.min(100, Math.round(Number(r.score ?? 0) || 0))),
      detail: String(r.detail ?? '').trim(),
    });
  }

  return DEEP_ANALYSIS_SCORE_PARAMETER_DEFS.map(def => {
    const hit = byId.get(def.id);
    return {
      id: def.id,
      label: hit?.label || def.label,
      weight: def.weight,
      score: hit?.score ?? 0,
      detail: hit?.detail ?? '',
    };
  });
}

function weightedScoreFromParameters(params: BlogDeepAnalysisScoreParameter[]): number {
  const totalWeight = params.reduce((s, p) => s + p.weight, 0);
  if (!totalWeight) return 0;
  const sum = params.reduce((s, p) => s + p.score * p.weight, 0);
  return Math.round(sum / totalWeight);
}

function normalizeSectionGaps(raw: unknown): BlogSectionCompetitorGap[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(row => {
      const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      const gap = String(r.gap ?? '').trim();
      if (!gap) return null;
      return {
        blogSection: String(r.blogSection ?? r.blog_section ?? '').trim() || 'General',
        blogExcerpt: String(r.blogExcerpt ?? r.blog_excerpt ?? '').trim(),
        competitorUrl: String(r.competitorUrl ?? r.competitor_url ?? '').trim(),
        competitorSection: String(r.competitorSection ?? r.competitor_section ?? '').trim(),
        gap,
        impact: normalizeImpact(r.impact),
      };
    })
    .filter((g): g is BlogSectionCompetitorGap => Boolean(g))
    .slice(0, 20);
}

function normalizeAnalysis(raw: unknown): BlogDeepAnalysisResult {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : [];
  const fixesRaw = Array.isArray(o.priorityFixes) ? o.priorityFixes : [];
  const priorityFixes: BlogDeepAnalysisPriorityFix[] = fixesRaw
    .map(f => {
      const row = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
      return {
        issue: String(row.issue ?? '').trim(),
        impact: normalizeImpact(row.impact),
        recommendation: String(row.recommendation ?? '').trim(),
      };
    })
    .filter(f => f.issue);

  const scoreParameters = normalizeScoreParameters(o.scoreParameters);
  const fromParams = weightedScoreFromParameters(scoreParameters);
  const stated = Math.round(Number(o.deepAnalysisScore ?? 0) || 0);
  const score = Math.max(
    0,
    Math.min(100, fromParams > 0 ? fromParams : stated)
  );

  return {
    deepAnalysisScore: score,
    summary: String(o.summary ?? '').trim(),
    scoreParameters,
    sectionGaps: normalizeSectionGaps(o.sectionGaps ?? o.section_gaps),
    competitorUrls: arr(o.competitorUrls),
    missingTopics: arr(o.missingTopics),
    missingEntities: arr(o.missingEntities),
    missingSemanticKeywords: arr(o.missingSemanticKeywords),
    weakSections: arr(o.weakSections),
    competitorAdvantages: arr(o.competitorAdvantages),
    contentOpportunities: arr(o.contentOpportunities),
    recommendedAdditions: arr(o.recommendedAdditions),
    faqSuggestions: arr(o.faqSuggestions),
    tableSuggestions: arr(o.tableSuggestions),
    eeatSuggestions: arr(o.eeatSuggestions),
    linkingSuggestions: arr(o.linkingSuggestions),
    priorityFixes,
  };
}

/** Split our blog markdown into H2-level sections for Gemini section mapping. */
export function outlineBlogSections(markdown: string): Array<{ heading: string; excerpt: string }> {
  const body = (markdown || '').trim();
  if (!body) return [];

  const sections: Array<{ heading: string; excerpt: string }> = [];
  const chunks = body.split(/^##\s+/m);

  if (chunks[0]?.trim()) {
    const intro = chunks[0].trim();
    sections.push({
      heading: 'Introduction / opening',
      excerpt: intro.replace(/^#\s+.+$/m, '').trim().slice(0, 600),
    });
  }

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i].trim();
    const firstLine = chunk.split('\n')[0] ?? '';
    const heading = firstLine.replace(/\*+/g, '').trim() || `Section ${i}`;
    const excerpt = chunk.slice(firstLine.length).trim().slice(0, 600);
    sections.push({ heading, excerpt });
  }

  return sections;
}

function competitorPayloadForGemini(pages: CompetitorPageExtract[]) {
  return pages.map((p, rank) => ({
    rank: rank + 1,
    url: p.url,
    title: p.title,
    metaDescription: p.metaDescription,
    headings: p.headings,
    wordCount: p.wordCount,
    faqs: p.faqs,
    tables: p.tables,
    lists: p.lists.slice(0, 25),
    entities: p.entities,
    semanticKeywords: p.semanticKeywords,
    schema: p.schema,
    images: p.images.slice(0, 15),
    links: p.links,
    publishDate: p.publishDate,
    updatedDate: p.updatedDate,
    author: p.author,
    ctas: p.ctas,
    content: p.content.slice(0, 10_000),
    scrapeError: p.scrapeError ?? null,
  }));
}

export async function compareBlogToCompetitors(input: {
  keyword: string;
  blogTitle: string;
  blogContent: string;
  blogMeta: string;
  competitorPages: CompetitorPageExtract[];
  competitorUrls: string[];
}): Promise<BlogDeepAnalysisResult> {
  const validCompetitors = input.competitorPages.filter(p => p.wordCount >= 80 && !p.scrapeError);
  const crawlerPayload = competitorPayloadForGemini(
    validCompetitors.length ? validCompetitors : input.competitorPages
  );
  const blogSections = outlineBlogSections(input.blogContent);
  const paramDefsJson = JSON.stringify(
    DEEP_ANALYSIS_SCORE_PARAMETER_DEFS.map(d => ({ id: d.id, label: d.label, weight: d.weight })),
    null,
    2
  );

  const prompt = `You are a senior SEO strategist. You receive FULL crawler extracts (Jina Reader markdown) for the top Google organic competitors plus our complete blog draft.

TARGET KEYWORD: ${input.keyword}

OUR BLOG (full draft — use this to name exact sections):
Title: ${input.blogTitle}
Meta: ${input.blogMeta || '(none)'}

OUR BLOG SECTION OUTLINE (H2-level map):
${JSON.stringify(blogSections, null, 2)}

OUR BLOG FULL CONTENT:
${input.blogContent.slice(0, 18_000)}

COMPETITOR CRAWLER DATA (complete structured extract per URL — headings, FAQs, tables, links, entities, full markdown):
${JSON.stringify(crawlerPayload, null, 2)}

TASKS:
1. Score our blog on EACH parameter below (0-100 per parameter). Weights sum to 100. deepAnalysisScore MUST equal the weighted average (round to integer).
2. For sectionGaps: identify 5-12 specific places where a named part of OUR blog falls short vs a SPECIFIC competitor URL and THEIR section/heading. Reference real H2/H3 titles from both sides when possible.
3. List missing topics, entities, semantic gaps, priority fixes as before.

SCORE PARAMETERS (return one row per id with score 0-100 and a one-line detail):
${paramDefsJson}

Return ONLY valid JSON (no markdown fences):
{
  "deepAnalysisScore": 0,
  "summary": "",
  "scoreParameters": [
    { "id": "topic_coverage", "label": "", "weight": 18, "score": 0, "detail": "" }
  ],
  "sectionGaps": [
    {
      "blogSection": "Our H2 or Introduction name",
      "blogExcerpt": "Short quote from our blog (max 200 chars)",
      "competitorUrl": "exact URL from crawler data",
      "competitorSection": "Their H2/H3 or topic name",
      "gap": "What they cover that we don't or do worse",
      "impact": "High|Medium|Low"
    }
  ],
  "competitorUrls": ${JSON.stringify(input.competitorUrls)},
  "missingTopics": [],
  "missingEntities": [],
  "missingSemanticKeywords": [],
  "weakSections": [],
  "competitorAdvantages": [],
  "contentOpportunities": [],
  "recommendedAdditions": [],
  "faqSuggestions": [],
  "tableSuggestions": [],
  "eeatSuggestions": [],
  "linkingSuggestions": [],
  "priorityFixes": [
    { "issue": "", "impact": "High|Medium|Low", "recommendation": "" }
  ]
}

Rules:
- Use ONLY competitor URLs present in the crawler data.
- sectionGaps must tie each gap to exactly one competitorUrl and one blogSection from our outline.
- scoreParameters must include every parameter id from the list above with correct weights.
- Be specific — cite section titles, not generic advice. Do not suggest rewriting the entire article.
- competitorUrls must be exactly: ${JSON.stringify(input.competitorUrls)}
- priorityFixes: 3-8 items, High impact first.`;

  const raw = await geminiGenerate(prompt, 4, false, 'application/json', null, null, 8192);
  const parsed = parseLooseJson<unknown>(raw);
  if (!parsed) {
    throw new Error('Failed to parse deep analysis response. The AI response might have been cut off or is malformed.');
  }
  const result = normalizeAnalysis(parsed);
  if (!result.competitorUrls.length) result.competitorUrls = [...input.competitorUrls];
  return result;
}

export {
  type RunBlogDeepAnalysisInput,
  type RunBlogDeepAnalysisOutput,
} from './blog-deep-analysis-types';

export async function runBlogDeepAnalysisPipeline(
  input: RunBlogDeepAnalysisInput
): Promise<RunBlogDeepAnalysisOutput> {
  const trace: DeepAnalysisTraceEntry[] = [];
  const dfsTrace: DataForSEOTraceEntry[] = [];
  const keyword = (input.keyword || '').trim();

  if (!keyword) {
    throw new Error('This blog has no target keyword — add one before running deep analysis.');
  }

  const locationCode = input.targetRegion
    ? locationCodeFromTargetRegion(input.targetRegion)
    : 2840;

  const ownHost = (input.ownDomain ?? '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .toLowerCase();
  const excludeHosts = ownHost ? [ownHost] : [];

  const serp = await fetchGoogleOrganicSerpTopUrls(keyword, {
    locationCode,
    languageCode: 'en',
    limit: 5,
    excludeHosts,
    trace: dfsTrace,
  });

  if (!dfsTrace.some(t => t.ok)) {
    trace.push({ stage: 'serp', ok: false, detail: 'DataForSEO SERP request failed' });
    throw new Error('Could not fetch Google SERP results (DataForSEO). Check API credentials and try again.');
  }

  const competitorUrls = serp.urls.map(r => r.url).filter(Boolean);
  trace.push({
    stage: 'serp',
    ok: competitorUrls.length > 0,
    detail:
      competitorUrls.length > 0
        ? `Found ${competitorUrls.length} organic URLs`
        : 'No organic results returned for this keyword',
  });

  if (!competitorUrls.length) {
    throw new Error('No organic Google results found for this keyword. Try a different keyword or region.');
  }

  const { pages, failures } = await scrapeCompetitorPages(competitorUrls);
  const validCount = pages.filter(p => p.wordCount >= 80 && !p.scrapeError).length;
  trace.push({
    stage: 'scrape',
    ok: validCount > 0,
    detail:
      validCount > 0
        ? `Scraped ${validCount}/${competitorUrls.length} pages`
        : `All scrapes failed: ${failures.slice(0, 3).join('; ')}`,
  });

  if (validCount === 0) {
    throw new Error(
      failures.length
        ? `Could not scrape competitor pages: ${failures[0]}`
        : 'Competitor pages returned empty content.'
    );
  }

  trace.push({ stage: 'compare', ok: true, detail: 'Comparing content with Gemini' });

  const analysis = await compareBlogToCompetitors({
    keyword,
    blogTitle: input.blogTitle,
    blogContent: input.blogContent,
    blogMeta: input.blogMeta,
    competitorPages: pages,
    competitorUrls,
  });

  trace.push({ stage: 'analysis', ok: true, detail: `Score ${analysis.deepAnalysisScore}/100` });

  return { analysis, trace, dfsTrace };
}

export function formatDeepAnalysisRecommendations(analysis: BlogDeepAnalysisResult): string {
  const lines: string[] = [
    `Deep Analysis Score: ${analysis.deepAnalysisScore}/100`,
    '',
    analysis.summary,
  ];

  if (analysis.scoreParameters?.length) {
    lines.push('', 'Score breakdown:');
    for (const p of analysis.scoreParameters) {
      lines.push(`- ${p.label} (${p.weight}%): ${p.score}/100 — ${p.detail}`);
    }
  }

  if (analysis.sectionGaps?.length) {
    lines.push('', 'Section vs competitor gaps:');
    for (const g of analysis.sectionGaps) {
      lines.push(
        `- [${g.impact}] Our "${g.blogSection}" vs ${g.competitorUrl} ("${g.competitorSection}"): ${g.gap}`
      );
    }
  }

  lines.push('', 'Competitor URLs:', ...analysis.competitorUrls.map(u => `- ${u}`));

  const section = (title: string, items: string[]) => {
    if (!items.length) return;
    lines.push('', `${title}:`);
    for (const item of items) lines.push(`- ${item}`);
  };

  section('Missing topics', analysis.missingTopics);
  section('Competitor advantages (we lack)', analysis.competitorAdvantages);
  section('Missing entities', analysis.missingEntities);
  section('Missing semantic keywords', analysis.missingSemanticKeywords);
  section('Weak sections', analysis.weakSections);
  section('Content opportunities', analysis.contentOpportunities);
  section('Recommended additions', analysis.recommendedAdditions);
  section('FAQ suggestions', analysis.faqSuggestions);
  section('Table suggestions', analysis.tableSuggestions);
  section('E-E-A-T suggestions', analysis.eeatSuggestions);
  section('Linking suggestions', analysis.linkingSuggestions);

  if (analysis.priorityFixes.length) {
    lines.push('', 'Priority fixes:');
    for (const f of analysis.priorityFixes) {
      lines.push(`- [${f.impact}] ${f.issue} → ${f.recommendation}`);
    }
  }

  return lines.join('\n');
}
