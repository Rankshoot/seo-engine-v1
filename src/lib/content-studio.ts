/**
 * Content Studio (phase 5) — server-side helpers for ebook / whitepaper /
 * LinkedIn generation. Wraps Gemini 2.5 Pro (long-form) + Gemini 2.5 Flash
 * (suggestions) and produces a normalized result the server actions persist.
 */

import { geminiPro, geminiFlash, parseLooseJson } from '@/services/ai/providers';
import {
  buildEbookPrompt,
  type EbookPromptContext,
} from '@/lib/prompts/ebook-prompt';
import {
  buildWhitepaperPrompt,
  type WhitepaperPromptContext,
} from '@/lib/prompts/whitepaper-prompt';
import {
  buildLinkedInPostPrompt,
  type LinkedInPromptContext,
} from '@/lib/prompts/linkedin-post-prompt';
import { stripEmptyFragmentAnchorTags, countWordsInMarkdown } from '@/lib/blog-content';
import type {
  EbookContentData,
  WhitepaperContentData,
  LinkedInContentData,
} from '@/lib/types';

// ─── Shared utilities ───────────────────────────────────────────────────────

function slugifyTitle(title: string, fallback = 'content'): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10)
    .join('-');
  return slug || fallback;
}

function splitMarkdownAndMeta(raw: string): { content: string; metaJson: string } {
  const sepIdx = raw.indexOf('---META---');
  if (sepIdx === -1) return { content: raw.trim(), metaJson: '' };
  return {
    content: raw.slice(0, sepIdx).trim(),
    metaJson: raw.slice(sepIdx + '---META---'.length).trim(),
  };
}

interface ParsedLinkBuckets {
  external: string[];
  internal: string[];
}

function classifyMarkdownLinks(markdown: string, ownDomain: string): ParsedLinkBuckets {
  const ownHost = ownDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const external = new Set<string>();
  const internal = new Set<string>();
  const re = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown))) {
    if (match.index > 0 && markdown[match.index - 1] === '!') continue;
    const url = match[2].trim();
    if (!url || url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:')) continue;
    if (/^https?:\/\//i.test(url)) {
      let host = '';
      try { host = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { /* ignore */ }
      if (ownHost && host && (host === ownHost || host.endsWith(`.${ownHost}`))) internal.add(url);
      else external.add(url);
    } else if (url.startsWith('/')) {
      internal.add(url);
    }
  }
  return { external: [...external], internal: [...internal] };
}

function safeArrayString(value: unknown, max = 32): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === 'string' && v.trim()) {
      out.push(v.trim());
      if (out.length >= max) break;
    }
  }
  return out;
}

// ─── Ebook generation ───────────────────────────────────────────────────────

export interface GeneratedEbook {
  title: string;
  content: string;
  meta_description: string;
  slug: string;
  word_count: number;
  research_sources: number;
  external_links: string[];
  internal_links: string[];
  content_data: EbookContentData;
}

export async function generateEbook(
  ctx: EbookPromptContext,
  ownDomain: string,
): Promise<GeneratedEbook> {
  const prompt = buildEbookPrompt(ctx);
  const raw = await geminiPro(prompt, {
    temperature: 0.78,
    maxOutputTokens: 24576,
    useGoogleSearch: true,
  });

  const { content: bodyRaw, metaJson } = splitMarkdownAndMeta(raw);
  const meta = parseLooseJson<Record<string, unknown>>(metaJson) ?? {};
  const content = stripEmptyFragmentAnchorTags(bodyRaw);

  const titleMatch = content.match(/^#\s+(.+)$/m);
  const fallbackTitle = (typeof meta.cover_title === 'string' && meta.cover_title.trim())
    || titleMatch?.[1]?.replace(/\*+/g, '').trim()
    || ctx.topic.trim()
    || 'Untitled ebook';

  const tocRaw = Array.isArray(meta.table_of_contents) ? meta.table_of_contents : [];
  const tableOfContents = tocRaw.slice(0, 24).map((c, i) => {
    const row = c as Record<string, unknown>;
    return {
      number: typeof row.number === 'number' ? row.number : i + 1,
      title: typeof row.title === 'string' ? row.title : `Chapter ${i + 1}`,
      summary: typeof row.summary === 'string' ? row.summary : '',
      word_count: typeof row.word_count === 'number' ? row.word_count : 0,
    };
  });

  const faqRaw = Array.isArray(meta.faqs) ? meta.faqs : [];
  const faqs = faqRaw.slice(0, 10).map(c => {
    const row = c as Record<string, unknown>;
    return {
      question: typeof row.question === 'string' ? row.question : '',
      answer: typeof row.answer === 'string' ? row.answer : '',
    };
  }).filter(r => r.question && r.answer);

  const { external, internal } = classifyMarkdownLinks(content, ownDomain);
  const externalLinks = Array.from(new Set([...external, ...safeArrayString(meta.external_links, 24)])).slice(0, 14);
  const internalLinks = Array.from(new Set([...internal, ...safeArrayString(meta.internal_links, 16)])).slice(0, 14);

  const wordCount = countWordsInMarkdown(content);

  const content_data: EbookContentData = {
    cover_title: typeof meta.cover_title === 'string' ? meta.cover_title : fallbackTitle,
    cover_subtitle: typeof meta.cover_subtitle === 'string' ? meta.cover_subtitle : '',
    table_of_contents: tableOfContents,
    faqs,
    cta: typeof meta.cta === 'string' ? meta.cta : '',
    references: safeArrayString(meta.references, 18),
    audience: ctx.audience,
    tone: ctx.tone,
    goal: ctx.goal,
    primary_keyword: ctx.primaryKeyword,
    semantic_keywords: safeArrayString(meta.semantic_keywords, 18),
  };

  return {
    title: fallbackTitle,
    content,
    meta_description: typeof meta.meta_description === 'string' ? meta.meta_description : '',
    slug: typeof meta.slug === 'string' && meta.slug.trim() ? meta.slug.trim() : slugifyTitle(fallbackTitle, 'ebook'),
    word_count: wordCount,
    research_sources: ctx.research?.totalSourcesFound ?? 0,
    external_links: externalLinks,
    internal_links: internalLinks,
    content_data,
  };
}

// ─── Whitepaper generation ──────────────────────────────────────────────────

export interface GeneratedWhitepaper {
  title: string;
  content: string;
  meta_description: string;
  slug: string;
  word_count: number;
  research_sources: number;
  external_links: string[];
  internal_links: string[];
  content_data: WhitepaperContentData;
}

export async function generateWhitepaper(
  ctx: WhitepaperPromptContext,
  ownDomain: string,
): Promise<GeneratedWhitepaper> {
  const prompt = buildWhitepaperPrompt(ctx);
  const raw = await geminiPro(prompt, {
    temperature: 0.7,
    maxOutputTokens: 20480,
    useGoogleSearch: true,
  });

  const { content: bodyRaw, metaJson } = splitMarkdownAndMeta(raw);
  const meta = parseLooseJson<Record<string, unknown>>(metaJson) ?? {};
  const content = stripEmptyFragmentAnchorTags(bodyRaw);

  const titleMatch = content.match(/^#\s+(.+)$/m);
  const fallbackTitle = (typeof meta.cover_title === 'string' && meta.cover_title.trim())
    || titleMatch?.[1]?.replace(/\*+/g, '').trim()
    || ctx.topic.trim()
    || 'Untitled whitepaper';

  const sectionsRaw = Array.isArray(meta.sections) ? meta.sections : [];
  const sections = sectionsRaw.slice(0, 14).map((s, i) => {
    const row = s as Record<string, unknown>;
    return {
      number: typeof row.number === 'number' ? row.number : i + 1,
      title: typeof row.title === 'string' ? row.title : `Section ${i + 1}`,
      summary: typeof row.summary === 'string' ? row.summary : '',
    };
  });

  const { external, internal } = classifyMarkdownLinks(content, ownDomain);
  const externalLinks = Array.from(new Set([...external, ...safeArrayString(meta.external_links, 24)])).slice(0, 18);
  const internalLinks = Array.from(new Set([...internal, ...safeArrayString(meta.internal_links, 16)])).slice(0, 12);

  const content_data: WhitepaperContentData = {
    cover_title: typeof meta.cover_title === 'string' ? meta.cover_title : fallbackTitle,
    cover_subtitle: typeof meta.cover_subtitle === 'string' ? meta.cover_subtitle : '',
    executive_summary: typeof meta.executive_summary === 'string' ? meta.executive_summary : '',
    sections,
    recommendations: safeArrayString(meta.recommendations, 12),
    references: safeArrayString(meta.references, 24),
    industry: ctx.industry,
    audience: ctx.audience,
    problem_statement: ctx.problemStatement,
    business_objective: ctx.businessObjective,
    technical_depth: ctx.technicalDepth,
    primary_keyword: ctx.primaryKeyword,
    semantic_keywords: safeArrayString(meta.semantic_keywords, 18),
  };

  return {
    title: fallbackTitle,
    content,
    meta_description: typeof meta.meta_description === 'string' ? meta.meta_description : '',
    slug: typeof meta.slug === 'string' && meta.slug.trim() ? meta.slug.trim() : slugifyTitle(fallbackTitle, 'whitepaper'),
    word_count: countWordsInMarkdown(content),
    research_sources: ctx.research?.totalSourcesFound ?? 0,
    external_links: externalLinks,
    internal_links: internalLinks,
    content_data,
  };
}

// ─── LinkedIn post generation ───────────────────────────────────────────────

export interface GeneratedLinkedInPost {
  title: string;
  content: string;
  meta_description: string;
  slug: string;
  word_count: number;
  research_sources: number;
  external_links: string[];
  internal_links: string[];
  content_data: LinkedInContentData;
}

export async function generateLinkedInPost(
  ctx: LinkedInPromptContext,
): Promise<GeneratedLinkedInPost> {
  const prompt = buildLinkedInPostPrompt(ctx);
  const raw = await geminiPro(prompt, {
    temperature: 0.85,
    maxOutputTokens: 4096,
    useGoogleSearch: false,
  });

  const { content: bodyRaw, metaJson } = splitMarkdownAndMeta(raw);
  const meta = parseLooseJson<Record<string, unknown>>(metaJson) ?? {};

  // Parse the structured output into hook/body/cta/hashtags.
  const sectionGrab = (label: string): string => {
    const re = new RegExp(`##\\s+${label}\\s*\\n([\\s\\S]*?)(?:\\n##\\s+|$)`, 'i');
    const match = bodyRaw.match(re);
    return match?.[1]?.trim() ?? '';
  };

  const hookFromBody = sectionGrab('Hook');
  const bodyFromBody = sectionGrab('Body');
  const ctaFromBody = sectionGrab('Call to Action');
  const hashtagsLine = sectionGrab('Hashtags');

  const hashtagsFromMeta = Array.isArray(meta.hashtags)
    ? (meta.hashtags as unknown[]).filter(v => typeof v === 'string').map(v => (v as string).trim())
    : [];
  const hashtagsFallback = hashtagsLine
    .split(/\s+/)
    .filter(t => t.startsWith('#'))
    .slice(0, 6);
  const hashtags = (hashtagsFromMeta.length ? hashtagsFromMeta : hashtagsFallback).slice(0, 6);

  const hook = (typeof meta.hook === 'string' && meta.hook.trim()) ? meta.hook.trim() : hookFromBody;
  const body = (typeof meta.body === 'string' && meta.body.trim()) ? meta.body.trim() : bodyFromBody;
  const cta = (typeof meta.cta === 'string' && meta.cta.trim()) ? meta.cta.trim() : ctaFromBody;

  const composedPlainText = [hook, body, cta, hashtags.join(' ')].filter(Boolean).join('\n\n');
  const titleH1 = bodyRaw.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? `LinkedIn — ${ctx.postStyle}`;

  // Persist as Markdown so the existing previewer renders the structured layout.
  const markdownDoc = `# ${titleH1}\n\n## Hook\n${hook}\n\n## Body\n${body}\n\n## Call to Action\n${cta}\n\n## Hashtags\n${hashtags.join(' ')}\n\n${composedPlainText ? `> Copy-ready post:\n\n${composedPlainText.split('\n').map(l => `> ${l}`).join('\n')}` : ''}`.trim();

  const content_data: LinkedInContentData = {
    post_style: ctx.postStyle,
    hook,
    body,
    cta,
    hashtags,
    audience: ctx.audience,
    tone: ctx.tone,
    primary_keyword: ctx.primaryKeyword,
  };

  const wordCount = countWordsInMarkdown(composedPlainText);

  const slugBase = (typeof meta.slug === 'string' && meta.slug.trim())
    ? meta.slug.trim()
    : slugifyTitle(hook || titleH1, 'linkedin');

  return {
    title: hook || titleH1,
    content: markdownDoc,
    meta_description: typeof meta.meta_description === 'string' && meta.meta_description.trim()
      ? meta.meta_description.trim().slice(0, 200)
      : (body || hook).replace(/\s+/g, ' ').slice(0, 160),
    slug: slugBase,
    word_count: wordCount,
    research_sources: 0,
    external_links: [],
    internal_links: [],
    content_data,
  };
}

// ─── Lightweight topic / keyword suggestion (Gemini Flash → Pro fallback) ───

export interface ContentTopicSuggestion {
  topic: string;
  primary_keyword: string;
  semantic_keywords: string[];
  rationale: string;
}

interface RawTopicSuggestion {
  topic?: string;
  primary_keyword?: string;
  semantic_keywords?: string[];
  rationale?: string;
}

/** Gemini schema dialect (`v1beta`) — same shape as `INSTANT_KEYWORD_TOPIC_SCHEMA` in `lib/gemini.ts`. */
const TOPIC_SUGGESTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    topic: { type: 'STRING' },
    primary_keyword: { type: 'STRING' },
    semantic_keywords: { type: 'ARRAY', items: { type: 'STRING' } },
    rationale: { type: 'STRING' },
  },
  required: ['topic', 'primary_keyword', 'semantic_keywords', 'rationale'],
} as const;

/** Last-resort line scrape so a slightly malformed model reply still produces a usable suggestion. */
function looseExtractTopicSuggestion(raw: string): RawTopicSuggestion | null {
  const text = raw.replace(/```[a-z]*/gi, '').replace(/```/g, '');
  const grab = (key: string): string | null => {
    const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'i');
    const m = re.exec(text);
    return m ? m[1].replace(/\\"/g, '"') : null;
  };
  const grabArray = (key: string): string[] | null => {
    const re = new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`, 'i');
    const m = re.exec(text);
    if (!m) return null;
    const items: string[] = [];
    const itemRe = /"((?:[^"\\]|\\.)*)"/g;
    let mm: RegExpExecArray | null;
    while ((mm = itemRe.exec(m[1])) !== null) items.push(mm[1].replace(/\\"/g, '"'));
    return items.length ? items : null;
  };

  const topic = grab('topic');
  const primary = grab('primary_keyword');
  if (!topic && !primary) return null;
  return {
    topic: topic ?? undefined,
    primary_keyword: primary ?? undefined,
    semantic_keywords: grabArray('semantic_keywords') ?? undefined,
    rationale: grab('rationale') ?? undefined,
  };
}

function normalizeSuggestion(raw: RawTopicSuggestion): ContentTopicSuggestion {
  return {
    topic: (raw.topic ?? '').trim() || 'Untitled topic',
    primary_keyword: (raw.primary_keyword ?? '').trim(),
    semantic_keywords: Array.isArray(raw.semantic_keywords)
      ? raw.semantic_keywords.filter((s): s is string => typeof s === 'string').slice(0, 14)
      : [],
    rationale: (raw.rationale ?? '').trim(),
  };
}

export async function suggestContentTopicWithFlash(input: {
  contentTypeLabel: string;
  niche: string;
  audience: string;
  domain: string;
  briefSummary: string | null;
  approvedKeywords: string[];
  avoidPhrases: string[];
  seedKeyword?: string;
}): Promise<ContentTopicSuggestion> {
  const seedBlock = input.approvedKeywords.length
    ? input.approvedKeywords.slice(0, 14).map(k => `- ${k}`).join('\n')
    : '(no approved keywords yet)';

  const briefBlock = input.briefSummary?.trim()
    ? `BRIEF: ${input.briefSummary.trim().slice(0, 1500)}`
    : '(no cached brief)';

  const avoidBlock = input.avoidPhrases.length
    ? `Avoid these phrases (already used):\n${input.avoidPhrases.map(p => `- ${p}`).join('\n')}`
    : '(no banned phrases)';

  const seedRule = input.seedKeyword?.trim()
    ? `CRITICAL REQUIREMENT: The user has already provided the primary keyword: "${input.seedKeyword.trim()}". You MUST output EXACTLY this keyword in the "primary_keyword" field of your JSON response. Do NOT change it, modify it, or choose a different one. Design the topic, semantic_keywords, and rationale specifically for this keyword.`
    : `APPROVED KEYWORDS (prefer one of these as the primary keyword if it fits):\n${seedBlock}`;

  const prompt = `You are an SEO content strategist suggesting ONE ${input.contentTypeLabel} topic that the Rankit content engine should produce next.

CONTEXT
- Domain: ${input.domain}
- Niche: ${input.niche}
- Target audience: ${input.audience}
${briefBlock}

${seedRule}

${avoidBlock}

Rules:
- Pick a topic the audience genuinely searches for and that the brand can write with authority.
- The primary_keyword must be 2-6 words. Keep it natural; no brand stuffing unless the brand is the search.
- semantic_keywords: 6-10 supporting phrases (long-tail / NLP / questions) that should be covered in the piece.
- rationale: 1 sentence on why this topic earns organic traffic for THIS domain.

Return JSON ONLY (no markdown fences, no commentary) with EXACTLY these keys:
{"topic": "...", "primary_keyword": "...", "semantic_keywords": ["..."], "rationale": "..."}`;

  // Pass 1 — Gemini Flash with a strict response schema.
  // Temperature kept moderate so the model stays JSON-clean; bumping output
  // budget so the schema's array field never truncates mid-suggestion.
  let raw = '';
  try {
    raw = await geminiFlash(prompt, {
      temperature: 0.6,
      maxOutputTokens: 2048,
      jsonMode: true,
      responseSchema: TOPIC_SUGGESTION_SCHEMA as unknown as Record<string, unknown>,
    });
  } catch (e) {
    console.warn(
      '[content-studio] Flash suggestion call failed; retrying with Pro.',
      e instanceof Error ? e.message : e,
    );
  }

  const fromFlash = raw ? parseLooseJson<RawTopicSuggestion>(raw) ?? looseExtractTopicSuggestion(raw) : null;
  if (fromFlash && (fromFlash.topic || fromFlash.primary_keyword)) {
    return normalizeSuggestion(fromFlash);
  }

  if (raw) {
    console.warn('[content-studio] Flash returned unparseable suggestion. Raw output:', raw.slice(0, 600));
  }

  // Pass 2 — Gemini Pro (slower, much more reliable) with the same schema.
  let proRaw = '';
  try {
    proRaw = await geminiPro(prompt, {
      temperature: 0.78,
      maxOutputTokens: 1024,
      jsonMode: true,
      responseSchema: TOPIC_SUGGESTION_SCHEMA as unknown as Record<string, unknown>,
    });
  } catch (e) {
    throw new Error(
      `Suggestion failed (Flash + Pro): ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const fromPro = parseLooseJson<RawTopicSuggestion>(proRaw) ?? looseExtractTopicSuggestion(proRaw);
  if (fromPro && (fromPro.topic || fromPro.primary_keyword)) {
    return normalizeSuggestion(fromPro);
  }

  console.warn('[content-studio] Pro returned unparseable suggestion. Raw output:', proRaw.slice(0, 600));
  throw new Error(
    'AI returned an unparseable response. Please try again — the model usually recovers on the next call.',
  );
}
