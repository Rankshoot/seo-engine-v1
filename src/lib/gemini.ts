import { CalendarEntry, Project } from './types';
import { ResearchContext, formatResearchForPrompt } from './research';
import type { BusinessBrief } from './business-brief';
import { buildBlogPrompt } from './prompts/blog-prompt';
import { buildKeywordIntentPrompt } from './prompts/keyword-intent-prompt';
import { buildCalendarPrompt } from './prompts/calendar-prompt';
import { buildGapAnalysisPrompt } from './prompts/gap-analysis-prompt';
import {
  deterministicFunnelStage,
  parseFunnelStageLabel,
  type FunnelStage,
} from '@/lib/keyword-funnel';
import { countWordsInMarkdown, stripEmptyFragmentAnchorTags, validateExternalUrl } from '@/lib/blog-content';
import {
  extractGeminiTokenUsage,
  recordGeminiCall,
} from '@/lib/admin/logging/record-provider-call';
import { computeSEOScore, openingPlainLower } from './seo-analyzer';

import { aiGenerate, aiGenerateStructured } from '@/services/ai/providers';
import { z } from 'zod';

const ClassificationSchema = z.array(
  z.object({
    id: z.string(),
    intent: z.enum(['informational', 'commercial', 'navigational', 'transactional']),
    funnel_stage: z.enum(['TOFU', 'MOFU', 'BOFU']),
  })
);

function normalizeHost(domain: string): string {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}
function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Render optional keyword + SERP context into a prompt-ready block.
 * Kept here (not in research.ts) so the gemini prompt is the single place
 * that decides how this data influences the article.
 */
function formatAhrefsContextForPrompt(ctx: {
  ideas: Array<{ keyword: string; volume: number; difficulty: number | null; cpc: number | null }>;
  serp: Array<{ position: number; url: string; title: string; domain: string; domain_rating: number | null; traffic: number | null }>;
}): string {
  const lines: string[] = [];
  lines.push('=== KEYWORD + SERP CONTEXT (live research data — use to expand topical coverage) ===\n');

  if (ctx.ideas.length) {
    lines.push('ADJACENT QUERIES TO ANSWER (from matching-terms + related-terms + search-suggestions):');
    lines.push('Each is a real search with monthly Google volume. Answer at least 6 of these naturally inside the article body or FAQ — do NOT just append them as a bulleted list.');
    ctx.ideas.slice(0, 24).forEach(k => {
      const kdLabel = k.difficulty != null ? ` · KD ${k.difficulty}` : '';
      lines.push(`• "${k.keyword}" — ${k.volume.toLocaleString()} searches/mo${kdLabel}`);
    });
    lines.push('');
  }

  if (ctx.serp.length) {
    lines.push('LIVE TOP-10 SERP:');
    lines.push('These are the pages currently winning for the target keyword. Beat them by going deeper on whatever they cover, AND covering at least one angle they miss.');
    ctx.serp.slice(0, 10).forEach(p => {
      const dr = p.domain_rating != null ? ` · DR ${Math.round(p.domain_rating)}` : '';
      const traffic = p.traffic ? ` · ~${p.traffic.toLocaleString()} mo traffic` : '';
      lines.push(`#${p.position} — "${p.title}" — ${p.domain}${dr}${traffic}`);
    });
    lines.push('');
  }

  lines.push('=== END KEYWORD + SERP CONTEXT ===');
  return lines.join('\n');
}

export async function geminiGenerate(
  prompt: string,
  retries = 3,
  useGoogleSearch = false,
  responseMimeType?: string,
  userId?: string | null,
  projectId?: string | null,
  maxOutputTokens?: number,
  timeoutMs?: number
): Promise<string> {
  return aiGenerate("blog", prompt, {
    useGoogleSearch,
    jsonMode: responseMimeType === 'application/json',
    retries,
    userId,
    projectId,
    maxOutputTokens,
    timeoutMs,
  });
}

/** Low-temperature JSON-style output for deterministic intent labels. */
async function geminiGenerateClassificationJson(prompt: string, retries = 3): Promise<string> {
  const result = await aiGenerateStructured("keyword-classification", prompt, ClassificationSchema, {
    temperature: 0.2,
    retries,
    timeoutMs: 0, // Disable timeout for batch classification of keywords
  });
  return JSON.stringify(result);
}

export interface KeywordIntentClassifyRow {
  id: string;
  keyword: string;
}

export interface BusinessContextForIntent {
  company: string;
  domain: string;
  niche: string;
  targetAudience: string;
  targetRegion: string;
  /** Pre-truncated brief-derived block (may be empty). */
  briefContext: string;
}

const SERP_INTENT_LABELS = ['informational', 'commercial', 'navigational', 'transactional'] as const;
export type SerpIntentValue = (typeof SERP_INTENT_LABELS)[number];

export function normalizeSerpIntentLabel(raw: unknown): SerpIntentValue {
  const s = typeof raw === 'string' ? raw.toLowerCase().trim() : '';
  return (SERP_INTENT_LABELS as readonly string[]).includes(s) ? (s as SerpIntentValue) : 'informational';
}

function stripJsonTrailingCommas(s: string): string {
  return s.replace(/,\s*([}\]])/g, '$1');
}

/** Extract a top-level JSON array from `start` using bracket depth (strings respected). */
function extractBalancedJsonArray(s: string): string | null {
  const start = s.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function tryParseIntentArrayPayload(raw: string): unknown[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    try {
      parsed = JSON.parse(stripJsonTrailingCommas(trimmed));
    } catch {
      return null;
    }
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const o = parsed as Record<string, unknown>;
    for (const key of [
      'results',
      'keywords',
      'items',
      'data',
      'classifications',
      'intents',
      'rows',
      'output',
    ]) {
      const v = o[key];
      if (Array.isArray(v)) return v;
    }
  }
  return null;
}

/**
 * Last-resort: pull `{"id":"…","intent":"…"}` objects from noisy text.
 */
function extractIntentObjectsLoose(s: string): unknown[] {
  const out: unknown[] = [];
  const idFirst = /\{\s*"id"\s*:\s*"([^"]*)"\s*,\s*"intent"\s*:\s*"([^"]*)"\s*\}/gi;
  let m: RegExpExecArray | null;
  while ((m = idFirst.exec(s)) !== null) {
    out.push({ id: m[1], intent: m[2] });
  }
  if (out.length) return out;

  const intentFirst = /\{\s*"intent"\s*:\s*"([^"]*)"\s*,\s*"id"\s*:\s*"([^"]*)"\s*\}/gi;
  while ((m = intentFirst.exec(s)) !== null) {
    out.push({ id: m[2], intent: m[1] });
  }
  return out;
}

function parseIntentClassificationArray(text: string): unknown[] {
  let s = text.trim();
  if (!s) {
    throw new Error('Could not parse intent JSON array from model output');
  }

  // Single fenced block
  const fence = /^```(?:json)?\s*([\s\S]*?)```\s*$/im.exec(s);
  if (fence) s = fence[1].trim();

  const candidates = [
    s,
    s.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim(),
  ];

  for (const chunk of candidates) {
    const direct = tryParseIntentArrayPayload(chunk);
    if (direct) return direct;

    const balanced = extractBalancedJsonArray(chunk);
    if (balanced) {
      const fromBalanced = tryParseIntentArrayPayload(stripJsonTrailingCommas(balanced));
      if (fromBalanced) return fromBalanced;
    }
  }

  const loose = extractIntentObjectsLoose(s);
  if (loose.length) return loose;

  throw new Error('Could not parse intent JSON array from model output');
}

/**
 * Classify a batch of keywords into a single SERP intent label each, grounded in
 * the customer's business (brief + project fields).
 */
export async function classifyKeywordIntentsForBusinessChunk(
  ctx: BusinessContextForIntent,
  rows: KeywordIntentClassifyRow[]
): Promise<{ id: string; intent: SerpIntentValue; funnel_stage: FunnelStage }[]> {
  if (!rows.length) return [];

  const expectedIds = new Set(rows.map(r => r.id));
  const prompt = buildKeywordIntentPrompt(ctx, rows);

  const rawText = await geminiGenerateClassificationJson(prompt);
  const arr = parseIntentClassificationArray(rawText);
  const byId = new Map<string, SerpIntentValue>();
  const byFunnel = new Map<string, FunnelStage>();

  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as { id?: unknown; intent?: unknown; funnel_stage?: unknown };
    const id = typeof rec.id === 'string' ? rec.id : '';
    if (!expectedIds.has(id)) continue;
    byId.set(id, normalizeSerpIntentLabel(rec.intent));
    const fs = parseFunnelStageLabel(rec.funnel_stage);
    if (fs) byFunnel.set(id, fs);
  }

  return rows.map(r => {
    const intent = byId.get(r.id) ?? 'informational';
    const funnel_stage = byFunnel.get(r.id) ?? deterministicFunnelStage(intent, r.keyword);
    return { id: r.id, intent, funnel_stage };
  });
}

export interface GeneratedBlog {
  title: string;
  content: string;
  meta_description: string;
  slug: string;
  word_count: number;
  research_sources: number;
  external_links: string[];
  internal_links: string[];
}

export interface AhrefsBlogContext {
  /** All adjacent keywords from matching/related/search-suggestions, dedup'd & sorted by volume. */
  ideas: Array<{
    keyword: string;
    volume: number;
    difficulty: number | null;
    cpc: number | null;
  }>;
  /** Top 10 SERP positions (Ahrefs) — gives the writer real competitor titles + DR. */
  serp: Array<{
    position: number;
    url: string;
    title: string;
    domain: string;
    domain_rating: number | null;
    traffic: number | null;
  }>;
  /**
   * Ahrefs "Matching terms → All" tab for the focus keyword.
   * These are terms that contain the seed phrase — used as H2 section seeds.
   */
  matchingTerms?: Array<{
    keyword: string;
    volume: number;
    difficulty: number | null;
  }>;
  /**
   * Ahrefs "Matching terms → Questions" tab for the focus keyword.
   * Question-style keywords (how/what/why/when…) — used to seed FAQ blocks.
   */
  questions?: Array<{
    keyword: string;
    volume: number;
    difficulty: number | null;
  }>;
  secondaryKeywords?: Array<{
    keyword: string;
    volume: number;
    difficulty: number | null;
  }>;
  faqKeywords?: Array<{
    keyword: string;
    volume: number;
    difficulty: number | null;
  }>;
}

/** Collapse leaked planning headers from Gemini blog output. */
function stripLeakedStepContent(raw: string): string {
  return stripEmptyFragmentAnchorTags(
    raw
      .replace(/^[═]{8,}\s*$/gm, '')
      .replace(/^STEP\s+\d+\s*[—–:-].*$/gm, '')
      .replace(/^\[PLAN STEP.*?\].*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Strip raw JSON artifacts that leak into blog content when Gemini truncates
 * mid-output or merges the META block into the article body.
 *
 * Targets:
 *   • `"external_links": ["https://..."]`  — JSON key-value pairs
 *   • `["https://...", "https://..."]`      — bare URL arrays
 *   • Orphaned `---META---` + trailing JSON  — incomplete META block
 *   • Lines that are just bare URLs (not inside markdown links)
 *   • `"meta_description": "..."`           — leaked meta fields
 */
function stripLeakedJsonArtifacts(content: string): string {
  let cleaned = content;

  // 1. Remove orphaned ---META--- and everything after it (truncated output).
  const metaIdx = cleaned.indexOf('---META---');
  if (metaIdx !== -1) {
    cleaned = cleaned.substring(0, metaIdx).trim();
  }

  // 2. Remove JSON key-value patterns leaked into body:
  //    "external_links": [...], "internal_links": [...], "meta_description": "...",
  //    "slug": "...", "seoNotes": [...]
  cleaned = cleaned.replace(
    /^\s*"(?:external_links|internal_links|meta_description|slug|seoNotes|title|contentMarkdown)"\s*:\s*(?:\[.*?\]|"[^"]*")\s*,?\s*$/gm,
    ''
  );

  // 3. Remove bare JSON URL arrays on their own line: ["https://...", ...]
  cleaned = cleaned.replace(
    /^\s*\[\s*"https?:\/\/[^"]+"(?:\s*,\s*"https?:\/\/[^"]+")*\s*\]\s*$/gm,
    ''
  );

  // 4. Remove lines that are just bare URLs (not inside markdown links).
  //    A bare URL line starts with http(s):// and has no markdown link wrapper.
  cleaned = cleaned.replace(
    /^\s*"?https?:\/\/\S+"?\s*,?\s*$/gm,
    ''
  );

  // 5. Remove orphaned JSON braces/brackets on their own line (remnants).
  cleaned = cleaned.replace(/^\s*[{}]\s*$/gm, '');

  // 6. Remove lines that look like JSON object start/end with leaked keys:
  //    e.g. `},"internal_links":{` or `","https://..."` (trailing array items)
  cleaned = cleaned.replace(
    /^\s*[,}]\s*"(?:external_links|internal_links|meta_description|slug)".*$/gm,
    ''
  );

  // 7. Clean up excessive blank lines left behind.
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}

function parseGeneratedBlogMarkdown(
  rawText: string,
  entry: { title: string; slug: string },
  project: Project,
  research?: ResearchContext
): GeneratedBlog {
  const text = rawText.trim();
  const sepIdx = text.indexOf('---META---');
  let content = stripLeakedStepContent(text);
  let meta_description = '';
  let slug = entry.slug;
  let external_links: string[] = [];
  let internal_links: string[] = [];

  if (sepIdx !== -1) {
    content = stripLeakedStepContent(text.substring(0, sepIdx).trim());
    try {
      const metaRaw = text.substring(sepIdx + 10).trim();
      const metaJson = JSON.parse(metaRaw);
      meta_description = metaJson.meta_description ?? '';
      slug = metaJson.slug ?? entry.slug;
      external_links = metaJson.external_links ?? [];
      internal_links = metaJson.internal_links ?? [];
    } catch {
      /* use defaults */
    }
  }

  // Strip any leaked JSON artifacts (raw URL arrays, META fragments, etc.)
  // BEFORE extracting links — otherwise the link regex picks up raw URLs
  // that are inside JSON arrays and double-counts them.
  content = stripLeakedJsonArtifacts(content);

  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match;
  const ownHost = normalizeHost(project.domain);
  while ((match = linkRegex.exec(content)) !== null) {
    const url = match[2];
    const host = safeHost(url);
    const pointsToOwn = Boolean(host && ownHost && (host === ownHost || host.endsWith(`.${ownHost}`)));
    if (pointsToOwn) {
      if (!internal_links.includes(url)) internal_links.push(url);
    } else if (!external_links.includes(url)) {
      external_links.push(url);
    }
  }

  const internalLinkRegex = /\[([^\]]+)\]\((\/[^)]+)\)/g;
  while ((match = internalLinkRegex.exec(content)) !== null) {
    const path = match[2];
    const absoluteUrl = project.domain ? `https://${project.domain}${path}` : path;
    content = content.replace(`](${path})`, `](${absoluteUrl})`);
    if (!internal_links.includes(absoluteUrl)) internal_links.push(absoluteUrl);
  }

  const word_count = content.split(/\s+/).filter(Boolean).length;
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].replace(/\*/g, '').trim() : entry.title;

  return {
    title,
    content,
    meta_description,
    slug,
    word_count,
    research_sources: research?.totalSourcesFound ?? 0,
    external_links: [...new Set(external_links)].slice(0, 10),
    internal_links: [...new Set(internal_links)].slice(0, 12),
  };
}

interface GeminiBlogJson {
  title: string;
  metaDescription: string;
  contentMarkdown: string;
  faqQuestions?: string[];
  internalLinksUsed?: string[];
  externalLinksUsed?: string[];
}

export function parseGeneratedBlogJson(
  rawText: string,
  entry: { title: string; slug: string; focus_keyword: string },
  project: Project,
  research?: ResearchContext
): GeneratedBlog {
  let parsed: GeminiBlogJson | null = null;
  const cleanedText = rawText.trim();
  
  // Try direct parsing
  try {
    parsed = JSON.parse(cleanedText) as GeminiBlogJson;
  } catch {
    // Try to find the first JSON object block using curly braces
    const match = cleanedText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]) as GeminiBlogJson;
      } catch {
        /* proceed to fallback */
      }
    }
  }

  // Fallback parsing if JSON is malformed or not JSON at all
  if (!parsed || typeof parsed !== 'object') {
    // If JSON parsing fails completely, use the legacy markdown parser
    return parseGeneratedBlogMarkdown(rawText, entry, project, research);
  }

  let content = parsed.contentMarkdown ?? '';
  const meta_description = parsed.metaDescription ?? '';
  const title = parsed.title ?? entry.title;
  const slug = entry.slug;

  // Make sure the content markdown begins with the H1 title if not present
  if (content && !/^\s*#\s+/m.test(content) && title) {
    content = `# ${title}\n\n${content}`;
  }

  // Extract external/internal links from content
  const external_links: string[] = [];
  const internal_links: string[] = [];

  const ownHost = normalizeHost(project.domain);

  // Helper to add links
  const addLink = (url: string) => {
    if (!url) return;
    const host = safeHost(url);
    const pointsToOwn = Boolean(host && ownHost && (host === ownHost || host.endsWith(`.${ownHost}`)));
    if (pointsToOwn) {
      if (!internal_links.includes(url)) internal_links.push(url);
    } else {
      if (!external_links.includes(url)) {
        external_links.push(url);
      }
    }
  };

  // Populate from JSON fields if available
  if (Array.isArray(parsed.externalLinksUsed)) {
    parsed.externalLinksUsed.forEach(addLink);
  }
  if (Array.isArray(parsed.internalLinksUsed)) {
    parsed.internalLinksUsed.forEach(url => {
      if (url.startsWith('/')) {
        const absoluteUrl = project.domain ? `https://${project.domain}${url}` : url;
        if (!internal_links.includes(absoluteUrl)) internal_links.push(absoluteUrl);
      } else {
        addLink(url);
      }
    });
  }

  // Scan markdown for embedded links
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    addLink(match[2]);
  }

  const internalLinkRegex = /\[([^\]]+)\]\((\/[^)]+)\)/g;
  while ((match = internalLinkRegex.exec(content)) !== null) {
    const path = match[2];
    const absoluteUrl = project.domain ? `https://${project.domain}${path}` : path;
    if (!internal_links.includes(absoluteUrl)) internal_links.push(absoluteUrl);
  }

  const word_count = content.split(/\s+/).filter(Boolean).length;

  return {
    title,
    content,
    meta_description,
    slug,
    word_count,
    research_sources: research?.totalSourcesFound ?? 0,
    external_links: [...new Set(external_links)].slice(0, 10),
    internal_links: [...new Set(internal_links)].slice(0, 12),
  };
}

function applyDeterministicFallbackFixes(
  blog: GeneratedBlog,
  targetKeyword: string,
  project: Project
): GeneratedBlog {
  let content = blog.content ?? '';
  let meta_description = blog.meta_description ?? '';
  let title = blog.title ?? '';
  const kw = targetKeyword.trim();

  // 1. Title Keyword Fix
  if (kw && !title.toLowerCase().includes(kw.toLowerCase())) {
    title = `${kw}: ${title}`;
    if (/^\s*#\s+/m.test(content)) {
      content = content.replace(/^\s*#\s+(.+)$/m, `# ${title}`);
    } else {
      content = `# ${title}\n\n${content}`;
    }
  }

  // 2. Intro Keyword Fix (first 100 words)
  const opening100 = openingPlainLower(content, 100);
  if (kw && !opening100.toLowerCase().includes(kw.toLowerCase())) {
    const lines = content.split('\n');
    let inserted = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('# ') || line.startsWith('---') || line === '') continue;
      lines[i] = `When focusing on ${kw}, businesses can gain a significant competitive edge. ${lines[i]}`;
      inserted = true;
      break;
    }
    if (inserted) {
      content = lines.join('\n');
    } else {
      content = content + `\n\nWhen considering ${kw}, understanding best practices is essential for long-term success.`;
    }
  }

  // 3. FAQ Missing Fix
  const hasFAQ = /#{1,3}\s*(faq|frequently asked)/i.test(content);
  if (!hasFAQ) {
    const faqSection = `

## Frequently Asked Questions

### What is ${kw}?
${kw} is a crucial strategy in modern industries that helps businesses optimize their processes, improve efficiency, and drive sustainable growth over the long term.

### Why is ${kw} important?
Implementing ${kw} allows organizations to stay competitive, adapt to changing market demands, and deliver superior value to their target audience and clients.

### How can we get started with ${kw}?
To get started, evaluate your current needs, define clear objectives, align your team on best practices, and implement key tools to monitor your overall progress.

### What are the main challenges of ${kw}?
Common challenges include resistance to change, lack of proper training, and integration issues, which can all be addressed with strong planning and leadership support.`;
    
    if (content.toLowerCase().includes('## conclusion')) {
      content = content.replace(/##\s+conclusion/i, `${faqSection}\n\n## Conclusion`);
    } else {
      content = content + faqSection;
    }
  }

  // 4. Meta Description Fix
  const isMetaValid = meta_description.length >= 140 && 
                      meta_description.length <= 165 && 
                      meta_description.toLowerCase().includes(kw.toLowerCase());
  
  if (!isMetaValid && kw) {
    const candidateMeta = `Discover how to master ${kw} with our expert guide. Read on to learn the best strategies, tips, and solutions for your business today.`;
    meta_description = candidateMeta.slice(0, 160);
  }

  // 5. Keyword Density Fix
  const words = content.toLowerCase().replace(/[#>*_\-[\]()`~.,!?;:"]/g, " ").split(/\s+/).filter(Boolean);
  const kwWords = kw.toLowerCase().replace(/[#>*_\-[\]()`~.,!?;:"]/g, " ").split(/\s+/).filter(Boolean);
  let kwOccurrences = 0;
  for (let i = 0; i <= words.length - kwWords.length; i++) {
    if (kwWords.every((w, j) => words[i + j] === w)) kwOccurrences++;
  }
  const kwDensity = words.length > 0 ? (kwOccurrences / words.length) * 100 : 0;
  if (kwDensity < 0.5 && kw) {
    const lines = content.split('\n');
    let headingsUpdated = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('## ') && headingsUpdated < 2 && !lines[i].toLowerCase().includes(kw.toLowerCase())) {
        lines[i] = `${lines[i]} & ${kw}`;
        headingsUpdated++;
      }
    }
    content = lines.join('\n');
    
    if (content.toLowerCase().includes('## conclusion')) {
      content = content.replace(/##\s+conclusion/i, `Implementing ${kw} is key.\n\n## Conclusion`);
    }
  }

  const finalWordCount = content.split(/\s+/).filter(Boolean).length;

  return {
    ...blog,
    title,
    content,
    meta_description,
    word_count: finalWordCount,
  };
}

function slugFromTopic(topic: string): string {
  const base = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10)
    .join('-');
  return base || 'article';
}

export async function generateBlogPost(
  entry: CalendarEntry,
  project: Project,
  wordCount: number = 2500,
  research?: ResearchContext,
  existingBlogs?: Array<{ title: string; slug: string; target_keyword: string }>,
  brief?: BusinessBrief | null,
  ahrefsContext?: AhrefsBlogContext | null,
  /** Optional user instructions (angle, tone, must-cover points) — merged into the writer prompt. */
  writerNotes?: string
): Promise<GeneratedBlog> {
  // Internal linking pool:
  //   (a) Pages from the user's actual website (from the Business Brief's
  //       `internal_link_candidates` — their real marketing pages + blog posts
  //       discovered via sitemap scrape). These use absolute URLs so they
  //       actually resolve when the blog is republished on any CMS.
  //   (b) Blogs we generated in our own system (relative /slug URLs).

  // Pre-validate the internal link candidates
  const allInternalCandidates = [
    ...(brief?.internal_link_candidates ?? [])
      .filter(l => l.url && l.url.startsWith('http'))
      .map(l => ({ url: l.url, title: l.title || l.topic || 'Page', topic: l.topic, type: 'site' as const })),
    ...(existingBlogs ?? [])
      .filter(b => b.target_keyword !== entry.focus_keyword)
      .map(b => ({
        url: `https://${project.domain}/${b.slug}`,
        title: b.title,
        topic: b.target_keyword,
        type: 'generated' as const
      }))
  ];

  const validatedInternalResults = await Promise.allSettled(
    allInternalCandidates.map(async (candidate) => {
      const ok = await validateExternalUrl(candidate.url, 4000);
      return { candidate, ok };
    })
  );

  const validatedInternalLinks = validatedInternalResults
    .filter((r): r is PromiseFulfilledResult<{ candidate: typeof allInternalCandidates[number]; ok: boolean }> => r.status === 'fulfilled' && r.value.ok)
    .map(r => r.value.candidate);

  const siteLinks = validatedInternalLinks
    .filter(c => c.type === 'site')
    .slice(0, 12);

  const generatedLinks = validatedInternalLinks
    .filter(c => c.type === 'generated')
    .slice(0, 8);

  const filteredBrief = brief
    ? {
        ...brief,
        internal_link_candidates: brief.internal_link_candidates.filter(c =>
          validatedInternalLinks.some(vl => vl.type === 'site' && vl.url === c.url)
        )
      }
    : null;

  const filteredExistingBlogs = existingBlogs
    ? existingBlogs.filter(b =>
        validatedInternalLinks.some(vl => vl.type === 'generated' && vl.url === `https://${project.domain}/${b.slug}`)
      )
    : [];

  const prompt = buildBlogPrompt({
    entry: {
      focus_keyword: entry.focus_keyword,
      title: entry.title,
      article_type: entry.article_type || 'Blog Post',
      secondary_keywords: entry.secondary_keywords,
    },
    project,
    wordCount,
    research,
    existingBlogs: filteredExistingBlogs,
    brief: filteredBrief,
    ahrefsContext: ahrefsContext || undefined,
    writerNotes,
  });

  const text = await geminiGenerate(prompt, 3, true, 'application/json', project.user_id, project.id);
  const result = parseGeneratedBlogJson(text, { ...entry, focus_keyword: entry.focus_keyword }, project, research);

  // ── Pre-save SEO Quality Gate & Repair Loop ──
  let currentBlogCandidate = result;
  let repairAttempts = 0;
  const maxRepairAttempts = 2;
  let scoreObj = computeSEOScore(currentBlogCandidate, project.domain);

  while (repairAttempts < maxRepairAttempts && (scoreObj.total < 85 || ['C', 'D', 'F'].includes(scoreObj.grade))) {
    repairAttempts++;
    const failedChecks = scoreObj.checks.filter(c => !c.pass);
    const failedChecksText = failedChecks.map(c => `- ${c.label} (${c.points}pt): ${c.hint}`).join('\n');

    const repairPrompt = `You are a senior SEO editor. Your job is to repair a generated blog post that failed the SEO quality checks. You MUST correct all failed checks while maintaining the original value, structure, tone, and external/internal links of the post.

BUSINESS CONTEXT:
- Company: ${project.company}
- Domain: ${project.domain}
- Niche: ${project.niche}
- Focus Keyword: "${entry.focus_keyword}"

CURRENT STATUS:
- Current SEO Score: ${scoreObj.total} / ${scoreObj.maxTotal} (Grade: ${scoreObj.grade})
- Failed SEO Checks that MUST be fixed:
${failedChecksText}

ORIGINAL META DESCRIPTION:
${currentBlogCandidate.meta_description}

ORIGINAL GENERATED BLOG ARTICLE:
${currentBlogCandidate.content}

REPAIR INSTRUCTIONS:
- You MUST fix all failed checks.
- Include the exact focus keyword "${entry.focus_keyword}" verbatim in:
  1. H1 title
  2. First 100 words of intro
  3. At least one H2 heading
  4. The conclusion section
  5. The meta description (must be exactly 150-160 characters long).
- Ensure a FAQ section exists under "## FAQs" with 4-6 FAQs, each question formatted as "###".
- Maintain keyword density strictly between 0.5% and 3%. Do not keyword stuff!
- Do not invent any new external/internal links. Use only the verified ones present in the original post.
- Return a strict JSON response only matching this exact format:
{
  "title": "[Fixed H1 Title]",
  "metaDescription": "[Fixed Meta Description (150-160 chars, includes focus keyword)]",
  "contentMarkdown": "[Entire corrected blog content starting with H1, with fixed FAQs, headings, keyword density, etc.]",
  "faqQuestions": ["Question 1", "Question 2", ...],
  "internalLinksUsed": [],
  "externalLinksUsed": []
}
`;

    try {
      const repairedRaw = await geminiGenerate(repairPrompt, 2, true, 'application/json', project.user_id, project.id);
      const repairedBlog = parseGeneratedBlogJson(repairedRaw, { ...entry, focus_keyword: entry.focus_keyword }, project, research);
      const newScoreObj = computeSEOScore(repairedBlog, project.domain);

      if (newScoreObj.total > scoreObj.total) {
        currentBlogCandidate = repairedBlog;
        scoreObj = newScoreObj;
      }

      if (scoreObj.total >= 85 && !['C', 'D', 'F'].includes(scoreObj.grade)) {
        break; // Quality target achieved!
      }
    } catch (repairErr) {
      console.error(`[blog-gen-repair] Attempt ${repairAttempts} failed:`, repairErr);
    }
  }

  // ── Deterministic fallback fixes ──
  const finalBlog = applyDeterministicFallbackFixes(currentBlogCandidate, entry.focus_keyword, project);
  
  // Re-evaluate score after deterministic fallbacks
  const finalScoreObj = computeSEOScore(finalBlog, project.domain);

  // Dev-only logging
  console.log('[blog-gen-seo] Quality Gate Summary:', JSON.stringify({
    modelUsed: 'gemini-flash-latest',
    targetKeyword: entry.focus_keyword,
    wordCount: finalBlog.word_count,
    seoScore: finalScoreObj.total,
    seoGrade: finalScoreObj.grade,
    failedChecks: finalScoreObj.checks.filter(c => !c.pass).map(c => c.label),
    hasMetaDescription: Boolean(finalBlog.meta_description),
    hasFAQ: /#{1,3}\s*(faq|frequently asked)/i.test(finalBlog.content),
    keywordDensity: finalScoreObj.checks.find(c => c.key === 'keyword_density')?.hint || '',
    repairAttempts
  }, null, 2));

  return finalBlog;
}


export async function generateContentCalendar(
  keywords: Array<{ keyword: string; volume: number; kd: number; secondary_keywords: string[] }>,
  project: Project,
  startDate: Date,
  days = 30
): Promise<Array<{
  day: number;
  date: string;
  keyword: string;
  title: string;
  article_type: string;
  slug: string;
  secondary_keywords: string[];
}>> {
  // Cap days to available keywords
  const actualDays = Math.min(days, keywords.length);
  const usedKeywords = keywords.slice(0, actualDays);

  const startStr = startDate.toISOString().split('T')[0];

  const articleTypes = [
    'How-to Guide', 'Listicle: Round-up', 'Comparison', 'Case Study',
    'Ultimate Guide', 'Tutorial', 'FAQ Guide', 'Industry Report',
    "Beginner's Guide", 'Expert Interview',
  ];

  const assignments = usedKeywords.map((k, i) => ({
    day: i + 1,
    date: new Date(new Date(startStr).getTime() + i * 86400000).toISOString().split('T')[0],
    keyword: k.keyword,
    article_type: articleTypes[i % articleTypes.length],
  }));

  const prompt = buildCalendarPrompt(project, actualDays, assignments);

  const text = await geminiGenerate(prompt, 3, true);

  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('Gemini calendar raw response:', text.slice(0, 500));
    throw new Error('Failed to parse calendar from Gemini. Please try again.');
  }

  type CalendarRow = {
    day: number;
    date: string;
    keyword: string;
    title: string;
    article_type: string;
    slug: string;
    secondary_keywords?: string[];
  };

  let calendar: CalendarRow[];
  try {
    calendar = JSON.parse(jsonMatch[0]) as CalendarRow[];
  } catch {
    console.error('JSON.parse failed on calendar:', jsonMatch[0].slice(0, 300));
    throw new Error('Failed to parse calendar from Gemini. Please try again.');
  }
  // The LLM occasionally rephrases the keyword (case, "in", etc.). We trust the
  // ordered `assignments` we sent, so realign by day index and overwrite the
  // keyword/article_type/date with our canonical values.
  return calendar.slice(0, actualDays).map((entry, i) => {
    const canonical = assignments[i] ?? assignments[0];
    const match = usedKeywords.find(k => k.keyword === canonical.keyword);
    return {
      ...entry,
      day: canonical.day,
      date: canonical.date,
      keyword: canonical.keyword,
      article_type: canonical.article_type,
      secondary_keywords: match?.secondary_keywords ?? [],
    };
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Blog repair — rewrite an existing public page addressing audit issues.

export interface RepairBlogInput {
  /** The live URL of the page being repaired. */
  sourceUrl: string;
  /** Best known title from the audit/scrape. Used to preserve the original page identity. */
  originalTitle?: string;
  /** Markdown of the live page (from Jina Reader). */
  originalMarkdown: string;
  /** Audit findings — we feed each issue + fix back to the LLM. */
  issues: Array<{
    label: string;
    detail: string;
    fix: string;
    severity: 'low' | 'medium' | 'high';
    why_it_matters?: string;
    category?: string;
  }>;
  contentGaps: string[];
  /** URLs on the user's own site we can link to. Must be verbatim — LLM won't invent. */
  internalLinkPool: string[];
  /** Best-guess primary keyword this page is trying to rank for. */
  primaryKeyword: string;
  secondaryKeywords: string[];
  /** Light business context — ONLY for voice/tone, not to overwrite the page's topic. */
  brief?: BusinessBrief | null;
  /** The project — for domain + region + audience signals. */
  project: Project;
  /** Target word count for the rewrite. */
  wordCount?: number;
  /**
   * Full in-app "Content Analysis" payload — enables a stronger SEO enhancement pass
   * (issues + rubric + quick wins + verdict), not only minimal surgical edits.
   */
  contentAnalysisBundle?: {
    summary: string;
    plain_language_verdict: string;
    conclusion_verdict: string;
    conclusion_summary: string;
    quick_wins: string[];
    quality_rubric: Array<{ label: string; detail: string; status: 'pass' | 'warn' | 'fail' }>;
  };
}

export interface RepairedBlog extends GeneratedBlog {
  repair_notes: string[];
}

export async function repairBlogPost(input: RepairBlogInput): Promise<RepairedBlog> {
  const {
    sourceUrl,
    originalMarkdown,
    issues,
    contentGaps,
    internalLinkPool,
    primaryKeyword,
    secondaryKeywords,
    brief,
    project,
    contentAnalysisBundle,
  } = input;

  const targetWords = Math.min(
    4500,
    Math.max(1400, input.wordCount ?? countWordsInMarkdown(originalMarkdown) + 250),
  );

  const originalTitle =
    input.originalTitle?.trim() ||
    originalMarkdown.match(/^#\s+(.+)$/m)?.[1]?.replace(/\*+/g, '').trim() ||
    '';
  const titleNeedsRepair = issues.some(i =>
    /title|h1|headline|keyword in title|target keyword/i.test(`${i.label} ${i.detail} ${i.fix}`)
  );
  const metaNeedsRepair = issues.some(i =>
    /meta description|meta tag|description/i.test(`${i.label} ${i.detail} ${i.fix}`)
  );

  const issueBlock = issues.length
    ? issues
        .map((i, idx) => {
          const cat = i.category ? ` · ${i.category.toUpperCase()}` : '';
          const wim = i.why_it_matters ? `\n   Why it matters: ${i.why_it_matters}` : '';
          return `${idx + 1}. [${i.severity.toUpperCase()}${cat}] ${i.label}\n   What's wrong: ${i.detail}${wim}\n   Fix: ${i.fix}`;
        })
        .join('\n')
    : '(no explicit issues — focus on depth, clarity, and answer-first intro)';

  const gapsBlock = contentGaps.length
    ? contentGaps.map(g => `- ${g}`).join('\n')
    : '(the LLM did not flag explicit content gaps)';

  const rubricNeedsWork =
    contentAnalysisBundle?.quality_rubric?.filter(r => r.status === 'fail' || r.status === 'warn') ?? [];
  const rubricBlock = rubricNeedsWork.length
    ? rubricNeedsWork
        .map(
          (r, idx) =>
            `${idx + 1}. [${r.status.toUpperCase()}] ${r.label}\n   ${r.detail}`,
        )
        .join('\n')
    : '';

  const analysisOverview = contentAnalysisBundle
    ? `EDITORIAL VERDICT (${contentAnalysisBundle.conclusion_verdict}): ${contentAnalysisBundle.conclusion_summary}

Article summary (stay on this topic): ${contentAnalysisBundle.summary}

Key diagnosis: ${contentAnalysisBundle.plain_language_verdict}`
    : '';

  const linkPool = internalLinkPool
    .filter(u => u !== sourceUrl)
    .slice(0, 25);
  const linkPoolBlock = linkPool.length
    ? linkPool.map(u => `- ${u}`).join('\n')
    : '(no peer URLs available)';

  const briefLine = brief
    ? `Company voice (for tone ONLY — do not hijack the topic): ${brief.summary} · Products: ${brief.products.slice(0, 3).join(', ') || 'n/a'}`
    : '';

  const fullBundle = Boolean(contentAnalysisBundle);
  // Truncate the original — we want the LLM to see structure + flavor, not
  // reproduce word-for-word. Content-analysis enhancement uses a larger window.
  const originalBudget = fullBundle ? 20_000 : 10_000;
  const originalHead = originalMarkdown.slice(0, originalBudget);

  const modeIntro = fullBundle
    ? `You are a senior SEO editor. The user clicked "Generate enhanced" after a full content-quality analysis. Your job is to produce a **strong, search-ready** version of the SAME article: same core topic, same audience, same primary keyword intent — but comprehensively upgraded for clarity, depth, E-E-A-T, on-page SEO, and reader UX.

This is NOT a pivot and NOT a brand-new article from scratch. Reuse strong existing paragraphs where they already work; rewrite or expand anywhere needed to satisfy **every** requirement block below (all audit issues, all rubric rows that are not pass, all quick wins, all content gaps).`
    : `You are a senior SEO + content editor. Repair an existing public blog post by making the smallest useful changes needed to address the audit issues below. This is NOT a net-new article generation task.`;

  const modeRules = fullBundle
    ? `IMPORTANT RULES (FULL ENHANCEMENT):
- Keep the same topic, angle, and reader promise as the original. Do NOT pivot industry, product, or audience.
- Target PRIMARY KEYWORD naturally in the H1 (if TITLE_NEEDS_REPAIR), first ~120 words, at least one H2, and sporadically in body — never keyword stuffing.
- Aim for roughly ${targetWords} words (±15%). If the draft was thin, add substantive sections; if long, tighten fluff without losing coverage of gaps/issues.
- Output valid Markdown only. No HTML.
- Do not include schema JSON-LD, raw JSON, or implementation code blocks in the article body.
- Start with one H1 (# Title).
- Immediately under the H1, write one "answer-first" paragraph in ≤80 words that states the direct takeaway (optimized for AI Overviews / featured snippets).
- Use clear modular H2/H3 hierarchy (RAG-friendly). Merge redundant headings; fix weak single-sentence sections.
- Include a "## Frequently Asked Questions" section with 5–9 Q&A pairs (### question as heading, answer paragraph). Address real reader objections and long-tail phrasing.
- Include **at least 3 and at most 8** credible external citations as markdown links in the body. Use Google Search to find the PRIMARY SOURCE of each claim — the actual research report, government dataset, academic paper, or official standards page, NOT a blog post or news article summarising it. Preferred domains: .gov, .edu, PubMed/NCBI, WHO, CDC, McKinsey, Gartner, Deloitte, PwC, EY, Accenture, Forrester, Statista report pages, SHRM, IEEE, ISO, peer-reviewed journals. Never link to root domains or competitor blogs. No Wikipedia.
- Use **at least 2** INTERNAL LINK POOL URLs verbatim in contextually relevant sentences.
- Remove crutch phrases ("in today's world", "in recent years", "it's important to note", "game-changer", "leverage" without substance).
- If the original used base64 or data-URI images, replace with descriptive markdown image placeholders or prose (no raw base64).
- Tables of contents are optional; only add "## Table of contents" if the post has 4+ H2 sections and it improves UX.`
    : `IMPORTANT RULES (REPAIR):
- This is a REPAIR of an existing page — the topic must stay the same. Do NOT pivot to a different product, industry, or audience.
- Target the same primary keyword unless the audit explicitly says the keyword is dead; then re-target to the closest secondary keyword listed.
- Preserve every section, claim, example, and phrasing that is already correct. Only rewrite the parts connected to the listed audit issues or missing subtopics.
- Output must be valid Markdown. No HTML.
- Do not include schema JSON-LD, raw JSON, or implementation code blocks in the article body.
- Start with an H1 (# Title).
- Include an "answer-first" paragraph directly under the H1 in ≤80 words that plainly answers "what is this post about and what will the reader learn".
- Add H2/H3 structure, FAQ, internal links, external links, examples, or data ONLY where the audit says those are missing or weak.
- Link to peer URLs from the INTERNAL LINK POOL only if internal links are missing/weak or the repair naturally touches those sections. Use verbatim URLs. Never invent URLs.
- Link to credible external sources only if the audit says citations/data are missing or a changed section needs proof. Use Google Search to find the PRIMARY SOURCE of each citation — the actual research report, government dataset, or academic paper, NOT a blog or news article summarising it. Preferred domains: .gov, .edu, PubMed/NCBI, WHO, CDC, McKinsey, Gartner, Deloitte, PwC, EY, Accenture, Forrester, Statista report pages, SHRM, IEEE, ISO, peer-reviewed journals. Never link to root domains (e.g. "https://www.gartner.com") or competitor blogs. No Wikipedia.
- Keep length close to the original unless the audit says thin content / missing depth. If expanding, add only the listed missing subtopics.`;

  const titleMetaBlock = `- Do not change the title/H1 unless TITLE_NEEDS_REPAIR is true. If false, the H1 must remain exactly: "${originalTitle || '(keep original H1)'}".
- Do not change the meta description unless META_NEEDS_REPAIR is true. If false, keep the same marketing angle as the original page (do not invent a new pitch).`;

  const rubricSection =
    fullBundle && rubricBlock
      ? `QUALITY RUBRIC — STILL NEEDS WORK (address each; if an item is marginal, strengthen it anyway):\n${rubricBlock}\n\n`
      : '';

  const quickWinsSection =
    fullBundle && contentAnalysisBundle?.quick_wins?.length
      ? `QUICK WINS (implement each):\n- ${contentAnalysisBundle.quick_wins.join('\n- ')}\n\n`
      : '';

  const prompt = `${modeIntro}

${titleMetaBlock}

${modeRules}

SOURCE URL (the live page being repaired): ${sourceUrl}
ORIGINAL TITLE/H1: ${originalTitle || '(unknown)'}
TITLE_NEEDS_REPAIR: ${titleNeedsRepair ? 'true' : 'false'}
META_NEEDS_REPAIR: ${metaNeedsRepair ? 'true' : 'false'}
PRIMARY KEYWORD: ${primaryKeyword || '(infer from title)'}
SECONDARY KEYWORDS: ${secondaryKeywords.join(', ') || '(none)'}
TARGET LENGTH: ~${targetWords} words (${fullBundle ? 'full enhancement' : 'repair'} mode)
${briefLine}

AUDIENCE: ${project.target_audience}
REGION: ${project.target_region}

${analysisOverview ? `${analysisOverview}\n\n` : ''}AUDIT ISSUES TO FIX (address every row):
${issueBlock}

${rubricSection}${quickWinsSection}MISSING SUBTOPICS TO COVER:
${gapsBlock}

INTERNAL LINK POOL (you MUST use at least 2 of these, verbatim):
${linkPoolBlock}

ORIGINAL PAGE (first ~${Math.round(originalBudget / 1000)}k chars of markdown, for reference — do not copy verbatim; rewrite):
---
${originalHead}
---

Write the repaired blog now. End the blog content, then on the next line output EXACTLY:
---META---
{"meta_description":"150–160 chars only if META_NEEDS_REPAIR, otherwise preserve the original angle","slug":"url-slug-from-title","external_links":["url1"],"internal_links":["url1","url2"],"repair_notes":["Done: specific fix applied and where","Still to do: optional manual follow-up, or 'Still to do: none'"]}`;

  const text = await geminiGenerate(prompt, 3, true, undefined, project.user_id, project.id);

  const sepIdx = text.indexOf('---META---');
  let content = text.trim();
  let meta_description = '';
  let slug = slugify(primaryKeyword || 'repaired-post');
  let external_links: string[] = [];
  let internal_links: string[] = [];
  let repair_notes: string[] = [];

  if (sepIdx !== -1) {
    content = text.substring(0, sepIdx).trim();
    try {
      const metaRaw = text.substring(sepIdx + 10).trim();
      const metaJson = JSON.parse(metaRaw);
      meta_description = metaJson.meta_description ?? '';
      slug = metaJson.slug ?? slug;
      external_links = Array.isArray(metaJson.external_links) ? metaJson.external_links : [];
      internal_links = Array.isArray(metaJson.internal_links) ? metaJson.internal_links : [];
      repair_notes = Array.isArray(metaJson.repair_notes) ? metaJson.repair_notes : [];
    } catch { /* use defaults */ }
  }

  content = stripEmptyFragmentAnchorTags(content);

  // Re-scan markdown to pick up links the LLM embedded but omitted from meta.
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  const ownHost = normalizeHost(project.domain);
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(content))) {
    const url = m[2];
    const host = safeHost(url);
    const internal = Boolean(host && ownHost && (host === ownHost || host.endsWith(`.${ownHost}`)));
    if (internal) {
      if (!internal_links.includes(url)) internal_links.push(url);
    } else if (!external_links.includes(url)) {
      external_links.push(url);
    }
  }
  const relInternalRegex = /\[([^\]]+)\]\((\/[^)]+)\)/g;
  while ((m = relInternalRegex.exec(content))) {
    const path = m[2];
    const absoluteUrl = project.domain ? `https://${project.domain}${path}` : path;
    // Replace the relative link in the content with the absolute URL
    content = content.replace(`](${path})`, `](${absoluteUrl})`);
    if (!internal_links.includes(absoluteUrl)) internal_links.push(absoluteUrl);
  }

  const word_count = content.split(/\s+/).filter(Boolean).length;
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].replace(/\*/g, '').trim() : `Repaired: ${primaryKeyword}`;

  return {
    title,
    content,
    meta_description,
    slug,
    word_count,
    research_sources: 1,
    external_links: [...new Set(external_links)].slice(0, 10),
    internal_links: [...new Set(internal_links)].slice(0, 12),
    repair_notes: repair_notes.slice(0, 10),
  };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'repaired-post';
}

export interface GapAnalysisResult {
  analysisMarkdown: string;
  clusterKeywords: string[];
}

export async function analyzeKeywordGapStrategy(
  project: Project,
  industryKeywords: Array<{ keyword: string; volume: number; kd: number; status: string; ai_score: number }>,
  gaps: Array<{ keyword: string; competitorDomain: string; sourceTitle: string; sourceUrl: string }>
): Promise<GapAnalysisResult> {
  const ind = industryKeywords
    .slice(0, 80)
    .map(k => `- ${k.keyword} | vol ${k.volume} | KD ${k.kd} | score ${k.ai_score} | ${k.status}`)
    .join('\n');
  const gapLines = gaps
    .slice(0, 80)
    .map(
      g =>
        `- ${g.keyword} | competitor: ${g.competitorDomain} | article: ${g.sourceTitle} | url: ${g.sourceUrl || 'n/a'}`
    )
    .join('\n');

  const prompt = buildGapAnalysisPrompt(project, ind, gapLines);

  const text = await geminiGenerate(prompt, 3, true);
  const marker = '---CLUSTER---';
  const idx = text.indexOf(marker);
  let analysisMarkdown = text.trim();
  let clusterKeywords: string[] = [];

  if (idx !== -1) {
    analysisMarkdown = text.slice(0, idx).trim();
    const jsonPart = text.slice(idx + marker.length).trim();
    try {
      const parsed = JSON.parse(jsonPart) as { prioritized_keywords?: string[] };
      clusterKeywords = parsed.prioritized_keywords ?? [];
    } catch {
      const brace = jsonPart.match(/\{[\s\S]*\}/);
      if (brace) {
        try {
          const parsed = JSON.parse(brace[0]) as { prioritized_keywords?: string[] };
          clusterKeywords = parsed.prioritized_keywords ?? [];
        } catch {
          /* keep empty */
        }
      }
    }
  }

  return { analysisMarkdown, clusterKeywords };
}

const INSTANT_KEYWORD_TOPIC_SCHEMA = {
  type: 'OBJECT',
  properties: {
    keyword: { type: 'STRING' },
    topic: { type: 'STRING' },
  },
  required: ['keyword', 'topic'],
} as const;

/**
 * One keyword grounded in the project's website domain, then one article topic that targets that keyword (no web search).
 */
export async function suggestInstantArticleKeywordAndTopic(input: {
  company: string;
  niche: string;
  domain: string;
  targetAudience: string;
  regionLabel: string;
  languageLabel: string;
  briefSummary: string | null;
  seedPhrases: string[];
  /** Forces a different sub-intent each request (server-chosen). */
  rotationHint: string;
  /** Phrases the model must not repeat (e.g. prior Ask AI fills). */
  avoidPhrases: string[];
}): Promise<{ topic: string; keyword: string }> {
  const seeds =
    input.seedPhrases
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 20)
      .join('\n') || '(none — infer from domain and niche only)';

  const briefBlock = input.briefSummary?.trim()
    ? `PROJECT BRIEF (source of truth):\n${input.briefSummary.trim()}`
    : 'No cached project brief — infer primarily from the website domain, company, and niche.';

  const avoidBlock =
    input.avoidPhrases.length > 0
      ? `BANNED PHRASES (case-insensitive; do not output the keyword or topic if it duplicates or only trivially rephrases any of these — use a clearly different search intent):\n${input.avoidPhrases.map(p => `- ${p}`).join('\n')}`
      : '(No prior phrases to avoid — still pick a fresh angle.)';

  const prompt = `You are an SEO content strategist for the Instant Article tool.

PRIMARY ANCHOR — WEBSITE DOMAIN (this is what the keyword must be relevant to):
${input.domain}

BUSINESS CONTEXT
- Company: ${input.company}
- Niche: ${input.niche}
- Target audience: ${input.targetAudience}
- Target region: ${input.regionLabel}
- Article language: ${input.languageLabel}

${briefBlock}

SEED PHRASES (optional alignment — only if they clearly match this domain's offering):
${seeds}

VARIETY FOR THIS REQUEST (required — obey strictly):
- ${input.rotationHint}
- This run must feel like a new brainstorm: a different head term or query pattern than a generic default you might repeat. Same domain, new angle.

${avoidBlock}

Process (follow in order):
1) KEYWORD — Output exactly ONE short search phrase (2–6 words) in ${input.languageLabel} that a real searcher would type when looking for what this domain's business offers. It must be plausibly winnable organic demand for this site (not a random trending query unrelated to the domain). No brand name unless it is clearly a navigational product query for this company. No hashtags, no quotes, no numbering.
2) TOPIC — One specific, compelling article title or headline that naturally centers that same keyword intent (not generic fluff). It should read like a strong blog title for ${input.regionLabel}.

Return JSON only with keys "keyword" (string) and "topic" (string).`;

  const InstantKeywordTopicSchema = z.object({
    keyword: z.string(),
    topic: z.string(),
  });

  const result = await aiGenerateStructured(
    "instant-keyword-topic",
    prompt,
    InstantKeywordTopicSchema,
    {
      temperature: 0.92,
      topP: 0.94,
    }
  );

  const keyword = String(result.keyword ?? '').trim();
  const topic = String(result.topic ?? '').trim();

  if (!keyword) {
    throw new Error('Model returned an empty keyword');
  }
  if (!topic) {
    throw new Error('Model returned an empty topic');
  }

  return { topic, keyword };
}

