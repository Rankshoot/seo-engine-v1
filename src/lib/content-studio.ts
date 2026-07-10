/**
 * Content Studio (phase 5) — server-side helpers for ebook / whitepaper /
 * LinkedIn generation. Wraps Gemini 2.5 Pro (long-form) + Gemini 2.5 Flash
 * (suggestions) and produces a normalized result the server actions persist.
 */

import { aiGenerate, parseLooseJson } from '@/services/ai/providers';
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
import { stripEmptyFragmentAnchorTags, countWordsInMarkdown, humanizeDashes } from '@/lib/blog-content';
import type {
  EbookContentData,
  WhitepaperContentData,
  LinkedInContentData,
} from '@/lib/types';
import {
  validateGeneratedContent,
  looksLikeRawJsonEnvelope,
  recoverContentFromEnvelope,
  summarizeValidation,
  type GeneratedContentType,
} from '@/lib/content-validation';

/**
 * Shared studio content gate: recover a leaked JSON envelope if one slipped
 * through, and throw on structurally-broken output so the server action never
 * persists a raw envelope. Non-blocking issues (short, placeholder images) are
 * left to the export/publish gates.
 */
function ensureValidStudioContent(
  content: string,
  type: GeneratedContentType,
  metaDescription: string,
): string {
  let out = content;
  if (looksLikeRawJsonEnvelope(out)) {
    const recovered = recoverContentFromEnvelope(out);
    if (recovered) out = recovered;
  }
  const v = validateGeneratedContent(out, { type, metaDescription });
  if (!v.ok) {
    const blocking = v.fatalCodes.filter(
      c =>
        c === 'raw_json_envelope' ||
        c === 'leaked_envelope_keys' ||
        c === 'empty' ||
        c === 'starts_with_code_fence',
    );
    if (blocking.length) {
      throw new Error(`Generated ${type} failed content validation (${summarizeValidation(v)}).`);
    }
  }
  return out;
}

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
  const raw = await aiGenerate('ebook', prompt, {
    temperature: 0.78,
    maxOutputTokens: 24576,
    useGoogleSearch: true,
    cachePrompt: true,
    timeoutMs: 0,
  });

  const { content: bodyRaw, metaJson } = splitMarkdownAndMeta(raw);
  const meta = parseLooseJson<Record<string, unknown>>(metaJson) ?? {};
  
  // Clean up emdashes/endashes
  const humanizedBodyRaw = humanizeDashes(bodyRaw);
  
  const content = ensureValidStudioContent(
    stripEmptyFragmentAnchorTags(humanizedBodyRaw),
    'ebook',
    typeof meta.meta_description === 'string' ? humanizeDashes(meta.meta_description) : '',
  );

  const titleMatch = content.match(/^#\s+(.+)$/m);
  const rawCoverTitle = typeof meta.cover_title === 'string' ? meta.cover_title.trim() : '';
  const fallbackTitle = humanizeDashes(
    rawCoverTitle
      || titleMatch?.[1]?.replace(/\*+/g, '').trim()
      || ctx.topic.trim()
      || 'Untitled ebook'
  );

  const tocRaw = Array.isArray(meta.table_of_contents) ? meta.table_of_contents : [];
  const tableOfContents = tocRaw.slice(0, 24).map((c, i) => {
    const row = c as Record<string, unknown>;
    return {
      number: typeof row.number === 'number' ? row.number : i + 1,
      title: typeof row.title === 'string' ? humanizeDashes(row.title) : `Chapter ${i + 1}`,
      summary: typeof row.summary === 'string' ? humanizeDashes(row.summary) : '',
      word_count: typeof row.word_count === 'number' ? row.word_count : 0,
    };
  });

  const faqRaw = Array.isArray(meta.faqs) ? meta.faqs : [];
  const faqs = faqRaw.slice(0, 10).map(c => {
    const row = c as Record<string, unknown>;
    return {
      question: typeof row.question === 'string' ? humanizeDashes(row.question) : '',
      answer: typeof row.answer === 'string' ? humanizeDashes(row.answer) : '',
    };
  }).filter(r => r.question && r.answer);

  const { external, internal } = classifyMarkdownLinks(content, ownDomain);
  const externalLinks = Array.from(new Set([...external, ...safeArrayString(meta.external_links, 24)])).slice(0, 14);
  const internalLinks = Array.from(new Set([...internal, ...safeArrayString(meta.internal_links, 16)])).slice(0, 14);

  const wordCount = countWordsInMarkdown(content);

  const content_data: EbookContentData = {
    cover_title: typeof meta.cover_title === 'string' ? humanizeDashes(meta.cover_title) : fallbackTitle,
    cover_subtitle: typeof meta.cover_subtitle === 'string' ? humanizeDashes(meta.cover_subtitle) : '',
    table_of_contents: tableOfContents,
    faqs,
    cta: typeof meta.cta === 'string' ? humanizeDashes(meta.cta) : '',
    references: safeArrayString(meta.references, 18).map(r => humanizeDashes(r)),
    audience: ctx.audience,
    tone: ctx.tone,
    goal: ctx.goal,
    primary_keyword: ctx.primaryKeyword,
    semantic_keywords: safeArrayString(meta.semantic_keywords, 18),
  };

  return {
    title: fallbackTitle,
    content,
    meta_description: typeof meta.meta_description === 'string' ? humanizeDashes(meta.meta_description) : '',
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
  const raw = await aiGenerate('whitepaper', prompt, {
    temperature: 0.7,
    maxOutputTokens: 20480,
    useGoogleSearch: true,
    cachePrompt: true,
    timeoutMs: 0,
  });

  const { content: bodyRaw, metaJson } = splitMarkdownAndMeta(raw);
  const meta = parseLooseJson<Record<string, unknown>>(metaJson) ?? {};
  
  // Clean up emdashes/endashes
  const humanizedBodyRaw = humanizeDashes(bodyRaw);
  
  const content = ensureValidStudioContent(
    stripEmptyFragmentAnchorTags(humanizedBodyRaw),
    'whitepaper',
    typeof meta.meta_description === 'string' ? humanizeDashes(meta.meta_description) : '',
  );

  const titleMatch = content.match(/^#\s+(.+)$/m);
  const rawCoverTitle = typeof meta.cover_title === 'string' ? meta.cover_title.trim() : '';
  const fallbackTitle = humanizeDashes(
    rawCoverTitle
      || titleMatch?.[1]?.replace(/\*+/g, '').trim()
      || ctx.topic.trim()
      || 'Untitled whitepaper'
  );

  const sectionsRaw = Array.isArray(meta.sections) ? meta.sections : [];
  const sections = sectionsRaw.slice(0, 14).map((s, i) => {
    const row = s as Record<string, unknown>;
    return {
      number: typeof row.number === 'number' ? row.number : i + 1,
      title: typeof row.title === 'string' ? humanizeDashes(row.title) : `Section ${i + 1}`,
      summary: typeof row.summary === 'string' ? humanizeDashes(row.summary) : '',
    };
  });

  const { external, internal } = classifyMarkdownLinks(content, ownDomain);
  const externalLinks = Array.from(new Set([...external, ...safeArrayString(meta.external_links, 24)])).slice(0, 18);
  const internalLinks = Array.from(new Set([...internal, ...safeArrayString(meta.internal_links, 16)])).slice(0, 12);

  const content_data: WhitepaperContentData = {
    cover_title: typeof meta.cover_title === 'string' ? humanizeDashes(meta.cover_title) : fallbackTitle,
    cover_subtitle: typeof meta.cover_subtitle === 'string' ? humanizeDashes(meta.cover_subtitle) : '',
    executive_summary: typeof meta.executive_summary === 'string' ? humanizeDashes(meta.executive_summary) : '',
    sections,
    recommendations: safeArrayString(meta.recommendations, 12).map(r => humanizeDashes(r)),
    references: safeArrayString(meta.references, 24).map(r => humanizeDashes(r)),
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
    meta_description: typeof meta.meta_description === 'string' ? humanizeDashes(meta.meta_description) : '',
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
  const raw = await aiGenerate('linkedin', prompt, {
    temperature: 0.85,
    maxOutputTokens: 4096,
    useGoogleSearch: false,
    cachePrompt: true,
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
  const markdownDoc = `# ${titleH1}\n\n## Hook\n${hook}\n\n## Body\n${body}\n\n## Call to Action\n${cta}\n\n## Hashtags\n${hashtags.join(' ')}`.trim();
  // Structural gate — throws only on a leaked envelope / empty output, not on
  // legitimately short social copy.
  ensureValidStudioContent(markdownDoc, 'linkedin', '');

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
  goal?: string;
  cta_objective?: string;
  /** 2-3 alternative topic angles so the form can offer pickable suggestions. */
  alternate_topics: string[];
}

interface RawTopicSuggestion {
  topic?: string;
  primary_keyword?: string;
  semantic_keywords?: string[];
  rationale?: string;
  goal?: string;
  cta_objective?: string;
  alternate_topics?: string[];
}

/** Gemini schema dialect (`v1beta`) — same shape as `INSTANT_KEYWORD_TOPIC_SCHEMA` in `lib/gemini.ts`. */
const TOPIC_SUGGESTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    topic: { type: 'STRING' },
    primary_keyword: { type: 'STRING' },
    semantic_keywords: { type: 'ARRAY', items: { type: 'STRING' } },
    rationale: { type: 'STRING' },
    goal: { type: 'STRING' },
    cta_objective: { type: 'STRING' },
    alternate_topics: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['topic', 'primary_keyword', 'semantic_keywords', 'rationale', 'goal', 'cta_objective', 'alternate_topics'],
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
    goal: grab('goal') ?? undefined,
    cta_objective: grab('cta_objective') ?? undefined,
    alternate_topics: grabArray('alternate_topics') ?? undefined,
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
    goal: (raw.goal ?? '').trim() || undefined,
    cta_objective: (raw.cta_objective ?? '').trim() || undefined,
    alternate_topics: Array.isArray(raw.alternate_topics)
      ? raw.alternate_topics
          .filter((s): s is string => typeof s === 'string' && !!s.trim())
          .map(s => s.trim())
          .slice(0, 4)
      : [],
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
  usedKeywords: string[];
  seedKeyword?: string;
  /** Topic the user already typed — must be respected, not replaced. */
  seedTopic?: string;
  /** Topic ideas already shown to the user — never repeat these. */
  avoidTopics?: string[];
  /** Other form fields already filled in (audience/tone/goal/CTA/etc) — context only, never a fill target. */
  formContext?: string;
}): Promise<ContentTopicSuggestion> {
  const briefBlock = input.briefSummary?.trim()
    ? `BRIEF: ${input.briefSummary.trim().slice(0, 1500)}`
    : '(no cached brief)';

  const avoidBlock = input.avoidPhrases.length
    ? `Avoid these semantic keyword phrases (already used as secondary keywords):\n${input.avoidPhrases.map(p => `- ${p}`).join('\n')}`
    : '';

  const allAvoidKeywords = Array.from(
    new Set([...input.usedKeywords, ...input.approvedKeywords])
  ).slice(0, 40);

  const avoidKeywordsBlock = allAvoidKeywords.length
    ? `FORBIDDEN PRIMARY KEYWORDS — do NOT use any of these as primary_keyword (they are already scheduled, generated, or in the discovery pipeline):\n${allAvoidKeywords.map(k => `- ${k}`).join('\n')}`
    : '';

  const seedRule = input.seedKeyword?.trim()
    ? `CRITICAL REQUIREMENT: The user has already provided the primary keyword: "${input.seedKeyword.trim()}". You MUST output EXACTLY this keyword in the "primary_keyword" field of your JSON response. Do NOT change it, modify it, or choose a different one. Design the topic, semantic_keywords, and rationale specifically for this keyword.`
    : `Choose a fresh primary keyword that the brand can rank for — one that is NOT in the forbidden list above and is not a close variant of any forbidden keyword.`;

  const seedTopicRule = input.seedTopic?.trim()
    ? `The user has already written their own topic: "${input.seedTopic.trim().slice(0, 300)}". Treat it as the anchor: design semantic_keywords, goal, and cta_objective to serve THAT topic. Your "topic" field and alternate_topics should be sharper alternative phrasings or adjacent angles of the user's topic — never an unrelated subject.`
    : '';

  const avoidTopicsBlock = input.avoidTopics?.length
    ? `Do NOT repeat any of these topic ideas (already suggested — give genuinely different angles):\n${input.avoidTopics.slice(0, 12).map(t => `- ${t}`).join('\n')}`
    : '';

  const formContextBlock = input.formContext?.trim()
    ? `Details the user has already filled in on this form (keep the topic and alternate_topics consistent with these — do not contradict them):\n${input.formContext.trim().slice(0, 800)}`
    : '';

  const prompt = `You are an SEO content strategist suggesting ONE ${input.contentTypeLabel} topic that the Rankshoot content engine should produce next.

CONTEXT
- Domain: ${input.domain}
- Niche: ${input.niche}
- Target audience: ${input.audience}
${briefBlock}

${avoidKeywordsBlock}

${seedRule}

${seedTopicRule}

${avoidTopicsBlock}

${formContextBlock}

${avoidBlock}

Rules:
- Pick a topic the audience genuinely searches for and that the brand can write with authority.
- The primary_keyword must be 2-3 words maximum, completely different from any forbidden keyword above — not a synonym, not a sub-phrase.
- semantic_keywords: 6-10 supporting phrases (long-tail / NLP / questions) that should be covered in the piece.
- rationale: 1 sentence on why this topic earns organic traffic for THIS domain.
- goal: 1 sentence describing what the reader should know or do after reading (reader takeaway).
- cta_objective: 1 sentence describing the action the conclusion should steer the reader toward (e.g. book a demo, download a guide, start a free trial).
- alternate_topics: exactly 3 alternative topic titles for the same primary keyword — distinct angles (e.g. guide vs. comparison vs. trends), each usable as-is.

Return JSON ONLY (no markdown fences, no commentary) with EXACTLY these keys:
{"topic": "...", "primary_keyword": "...", "semantic_keywords": ["..."], "rationale": "...", "goal": "...", "cta_objective": "...", "alternate_topics": ["...", "...", "..."]}`;

  // Pass 1 — Gemini Flash with a strict response schema.
  // Temperature kept moderate so the model stays JSON-clean; bumping output
  // budget so the schema's array field never truncates mid-suggestion.
  let raw = '';
  try {
    raw = await aiGenerate('assistant', prompt, {
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

  // Pass 2 — Routed Pro (slower, much more reliable) with the same schema.
  let proRaw = '';
  try {
    proRaw = await aiGenerate('assistant', prompt, {
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

/** Gemini schema dialect (`v1beta`) for LinkedIn inputs. */
const LINKEDIN_INPUTS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    topic: { type: 'STRING' },
    primary_keyword: { type: 'STRING' },
    audience: { type: 'STRING' },
    post_style: { 
      type: 'STRING',
      description: 'The style of the LinkedIn post. Must be one of: "educational", "founder", "industry_insight", "storytelling", "list", "carousel"'
    },
    voice: { 
      type: 'STRING',
      description: 'The narrative perspective of the LinkedIn post. Must be either "first_person" or "company"'
    },
    author_role: { 
      type: 'STRING',
      description: 'If voice is first_person, suggest a role like "Founder", "CMO", "VP of Growth". Otherwise suggest empty string.'
    },
    cta_objective: { 
      type: 'STRING',
      description: 'Engaging, feed-native call to action (e.g. Spark a debate, ask a specific question, prompt them to DM for the cheat sheet).'
    },
    tone: {
      type: 'STRING',
      description: 'Tone of the post. Must be one of: "Confident · plain-spoken", "Curious · analytical", "Provocative · sharp", "Warm · human", "Numbers-first · precise"'
    }
  },
  required: ['topic', 'primary_keyword', 'audience', 'post_style', 'voice', 'author_role', 'cta_objective', 'tone'],
} as const;

export interface LinkedInInputsSuggestion {
  topic: string;
  primary_keyword: string;
  audience: string;
  post_style: string;
  voice: string;
  author_role: string;
  cta_objective: string;
  tone: string;
}

export async function suggestLinkedInInputsWithFlash(input: {
  niche: string;
  audience: string;
  domain: string;
  briefSummary: string | null;
  brandVoice?: string;
  brandValues?: string;
  brandDescription?: string;
  seedKeyword?: string;
  /** Topic the user already typed — must be output verbatim, not replaced. */
  seedTopic?: string;
}): Promise<LinkedInInputsSuggestion> {
  const briefBlock = input.briefSummary?.trim()
    ? `BRIEF: ${input.briefSummary.trim().slice(0, 1500)}`
    : '(no cached brief)';

  const seedRule = input.seedKeyword?.trim()
    ? `CRITICAL REQUIREMENT: The user has already provided the primary keyword: "${input.seedKeyword.trim()}". You MUST output EXACTLY this keyword in the "primary_keyword" field of your JSON response. Do NOT change it, modify it, or choose a different one.`
    : `Suggest a highly relevant primary keyword (2-6 words) related to the project niche and audience.`;

  const seedTopicRule = input.seedTopic?.trim()
    ? `CRITICAL REQUIREMENT: The user has already written the post topic: "${input.seedTopic.trim().slice(0, 300)}". Output EXACTLY this text in the "topic" field. Design post_style, tone, cta_objective, and the rest to make THIS topic perform in the feed.`
    : '';

  const prompt = `You are a social media SEO content strategist proposing a LinkedIn post plan.
Suggest the form input values that will produce the best feed-native LinkedIn post next.

CONTEXT:
- Domain: ${input.domain}
- Niche: ${input.niche}
- Default audience: ${input.audience}
${input.brandVoice ? `- Brand Voice: ${input.brandVoice}` : ''}
${input.brandValues ? `- Brand Values: ${input.brandValues}` : ''}
${input.brandDescription ? `- Brand Description: ${input.brandDescription}` : ''}
${briefBlock}

${seedRule}

${seedTopicRule}

Rules for values:
- post_style: Must be exactly one of: "educational", "founder", "industry_insight", "storytelling", "list", "carousel". Pick the style that best fits this topic and niche.
- voice: Must be exactly one of: "first_person" or "company".
- author_role: E.g., "Founder", "CEO", "Head of Growth", "CMO", "VP of Marketing". If voice is "company", set this to an empty string.
- tone: Must be exactly one of: "Confident · plain-spoken", "Curious · analytical", "Provocative · sharp", "Warm · human", "Numbers-first · precise".
- cta_objective: Feed-native CTA (e.g. asking a smart question to drive comments, or suggesting they DM for a checklist). Avoid generic clichés.

Return JSON ONLY (no markdown fences, no commentary) with EXACTLY these keys:
{"topic": "...", "primary_keyword": "...", "audience": "...", "post_style": "...", "voice": "...", "author_role": "...", "cta_objective": "...", "tone": "..."}`;

  let raw = '';
  try {
    raw = await aiGenerate('assistant', prompt, {
      temperature: 0.6,
      maxOutputTokens: 2048,
      jsonMode: true,
      responseSchema: LINKEDIN_INPUTS_SCHEMA as unknown as Record<string, unknown>,
    });
  } catch (e) {
    console.warn(
      '[content-studio] LinkedIn inputs suggestion Flash call failed; retrying with Pro.',
      e instanceof Error ? e.message : e,
    );
  }

  const parseOrExtract = (text: string): LinkedInInputsSuggestion | null => {
    const parsed = parseLooseJson<LinkedInInputsSuggestion>(text);
    if (parsed && parsed.topic && parsed.primary_keyword) {
      return parsed;
    }
    // Fallback regex grab
    const grab = (key: string): string => {
      const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'i');
      const m = re.exec(text);
      return m ? m[1].replace(/\\"/g, '"').trim() : '';
    };
    const topic = grab('topic');
    const primary = grab('primary_keyword');
    if (!topic && !primary) return null;
    return {
      topic,
      primary_keyword: primary,
      audience: grab('audience') || input.audience,
      post_style: grab('post_style') || 'educational',
      voice: grab('voice') || 'first_person',
      author_role: grab('author_role') || 'Founder',
      cta_objective: grab('cta_objective') || 'Spark a comment thread.',
      tone: grab('tone') || 'Confident · plain-spoken',
    };
  };

  const fromFlash = raw ? parseOrExtract(raw) : null;
  if (fromFlash) {
    return fromFlash;
  }

  // Fallback to Pro
  let proRaw = '';
  try {
    proRaw = await aiGenerate('assistant', prompt, {
      temperature: 0.75,
      maxOutputTokens: 1024,
      jsonMode: true,
      responseSchema: LINKEDIN_INPUTS_SCHEMA as unknown as Record<string, unknown>,
    });
  } catch (e) {
    throw new Error(
      `LinkedIn suggestion failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const fromPro = parseOrExtract(proRaw);
  if (fromPro) {
    return fromPro;
  }

  throw new Error('AI returned an unparseable response for LinkedIn suggestions. Please try again.');
}

