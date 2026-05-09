import { CalendarEntry, Project } from './types';
import { ResearchContext, formatResearchForPrompt } from './research';
import type { BusinessBrief } from './business-brief';
import {
  deterministicFunnelStage,
  parseFunnelStageLabel,
  type FunnelStage,
} from '@/lib/keyword-funnel';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';
const POLLINATIONS_CHAT_URL = 'https://gen.pollinations.ai/v1/chat/completions';

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

export async function geminiGenerate(prompt: string, retries = 3, useGoogleSearch = false): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const body: any = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.75, maxOutputTokens: 8192 },
      };
      if (useGoogleSearch) {
        body.tools = [{ googleSearch: {} }];
      }

      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        const fallback = await pollinationsGeminiFallback(prompt, 'Gemini API rate limit reached', 0.75);
        if (fallback) return fallback;
        throw new Error('Gemini API rate limit reached and Pollinations fallback is unavailable.');
      }

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini ${res.status}: ${err}`);
      }

      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from Gemini');
      return text;
    } catch (e: unknown) {
      if (attempt === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  throw new Error('Gemini failed after all retries');
}

async function pollinationsGeminiFallback(
  prompt: string,
  reason: string,
  temperature = 0.75
): Promise<string | null> {
  const apiKey = process.env.POLLINATIONS_API_KEY;
  if (!apiKey) return null;

  try {
    console.warn(`${reason}; using Pollinations Gemini fallback.`);
    const res = await fetch(POLLINATIONS_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.POLLINATIONS_TEXT_MODEL || 'gemini-fast',
        messages: [{ role: 'user', content: prompt }],
        temperature,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn(`Pollinations fallback failed (${res.status}): ${err.slice(0, 200)}`);
      return null;
    }

    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    return typeof text === 'string' && text.trim() ? text : null;
  } catch (error) {
    console.warn('Pollinations fallback failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Schema for structured JSON array output (consumer Gemini API). */
const KEYWORD_INTENT_RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      id: { type: 'STRING' },
      intent: {
        type: 'STRING',
        enum: ['informational', 'commercial', 'navigational', 'transactional'],
      },
    },
    required: ['id', 'intent'],
  },
} as const;

/** Low-temperature JSON-style output for deterministic intent labels. */
async function geminiGenerateClassificationJson(prompt: string, retries = 3): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const tryOnce = async (withResponseSchema: boolean): Promise<string> => {
        const generationConfig: Record<string, unknown> = {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        };
        if (withResponseSchema) {
          generationConfig.responseSchema = KEYWORD_INTENT_RESPONSE_SCHEMA;
        }

        const res = await fetch(GEMINI_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': GEMINI_API_KEY,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig,
          }),
        });

        if (res.status === 400 && withResponseSchema) {
          const errText = await res.text();
          console.warn(
            '[intent-classify] responseSchema rejected; retrying without schema:',
            errText.slice(0, 200)
          );
          return tryOnce(false);
        }

        if (res.status === 429) {
          const fallback = await pollinationsGeminiFallback(
            prompt,
            'Gemini API rate limit reached',
            0.2
          );
          if (fallback) return fallback;
          throw new Error('Gemini API rate limit reached and Pollinations fallback is unavailable.');
        }

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Gemini ${res.status}: ${err}`);
        }

        const json = await res.json();
        const cand = json?.candidates?.[0];
        const text = cand?.content?.parts?.[0]?.text;
        if (!text) {
          const reason = String(cand?.finishReason ?? '');
          if (reason.includes('SAFETY')) {
            throw new Error('Gemini blocked the response (safety filter).');
          }
          throw new Error('Empty response from Gemini');
        }
        return text;
      };

      return await tryOnce(true);
    } catch (e: unknown) {
      if (attempt === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 4000));
    }
  }
  throw new Error('Gemini classification failed after all retries');
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
 * Last-resort: pull `{"id":"…","intent":"…"}` objects from noisy text (e.g. Pollinations).
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
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  if (!rows.length) return [];

  const expectedIds = new Set(rows.map(r => r.id));
  const lines = rows.map(
    (r, i) => `${i + 1}. id=${r.id} | keyword="${String(r.keyword).replace(/"/g, '\\"')}"`
  );

  const prompt = `You are an SEO analyst. For each keyword below, assign EXACTLY ONE primary search intent for how ${ctx.company || 'this business'} (${ctx.domain}) should think about the query in their industry — not a generic dictionary guess.

BUSINESS CONTEXT
- Company: ${ctx.company || 'Unknown'}
- Domain: ${ctx.domain || 'Unknown'}
- Industry / niche: ${ctx.niche || 'Unknown'}
- Target audience: ${ctx.targetAudience || 'Unknown'}
- Region: ${ctx.targetRegion || 'Unknown'}
${ctx.briefContext ? `\nSITE / OFFERING CONTEXT (from scraped brief — use to interpret services and jargon):\n${ctx.briefContext}\n` : ''}

INTENT LABELS (pick one per keyword)
- informational: learning, definitions, how/what/why, early research; not actively choosing a vendor.
- commercial: comparing providers/services/solutions, "best", "top", "vs", reviews, or category shopping where the user is evaluating options before buying or hiring.
- transactional: ready to act now — purchase, sign up, pricing, demo, quote, apply, download a gated asset tied to conversion, or hire immediately.
- navigational: trying to reach a specific brand, product name, or web destination (including obvious brand + "login" / "portal").

Rules:
- Interpret each keyword in light of THIS company's niche. A broad term may be commercial for a B2B service provider even if it looks informational in isolation.
- If a query is ambiguous, prefer informational over commercial.

FUNNEL STAGE (one per keyword, must align with intent + phrasing)
- TOFU: early research — how/what/why, broad education, awareness, definitions, ideas, tips; user is not comparing vendors yet.
- MOFU: evaluation — best/top/vs/reviews/alternatives/compare, shortlists, "which X", category shopping before a final decision.
- BOFU: ready to convert or navigate — buy/pricing/demo/signup/download/hire/apply, transactional or clear brand/site navigation.

- Return JSON ONLY: one array. Each element: {"id":"<exact uuid from input>","intent":"informational"|"commercial"|"navigational"|"transactional","funnel_stage":"TOFU"|"MOFU"|"BOFU"}.
- Same number of elements as input, same order as listed.

KEYWORDS:
${lines.join('\n')}
`;

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
  const siteLinks = (brief?.internal_link_candidates ?? [])
    .filter(l => l.url && l.url.startsWith('http'))
    .slice(0, 12);
  const generatedLinks = (existingBlogs ?? [])
    .filter(b => b.target_keyword !== entry.focus_keyword)
    .slice(0, 8);

  let internalLinksBlock = '';
  if (siteLinks.length || generatedLinks.length) {
    const siteBlock = siteLinks.length
      ? `User's own website pages (prefer these — use the absolute URL as the link target, with natural anchor text):\n${siteLinks
          .map(l => `- ${l.title || l.topic || 'Page'} · ${l.url}${l.topic ? ` (topic: ${l.topic})` : ''}`)
          .join('\n')}`
      : '';
    const generatedBlock = generatedLinks.length
      ? `Blog posts we've generated in this project (use absolute URLs like https://${project.domain}/blog/slug or https://${project.domain}/slug):\n${generatedLinks
          .map(b => `- "${b.title}" → https://${project.domain}/${b.slug} (keyword: ${b.target_keyword})`)
          .join('\n')}`
      : '';
    internalLinksBlock = `\nINTERNAL LINKING (pick 2–4 total, split across the two pools, placed where they genuinely help the reader):\n${[siteBlock, generatedBlock].filter(Boolean).join('\n\n')}`;
  }

  // Company grounding from the Business Brief so the draft sounds like this
  // specific company rather than a generic explainer.
  const writerNotesBlock =
    writerNotes && writerNotes.length > 0
      ? `\nWRITER / EDITOR NOTES (user-supplied — follow closely; resolve conflicts in favour of these notes when they do not break factual accuracy or the structural rules below):\n${writerNotes.slice(0, 2500)}\n`
      : "";

  const briefBlock = brief
    ? `\nCOMPANY CONTEXT (use as grounding — the article must sound like it was written by ${project.company}, for their audience; weave products/entities in naturally; do NOT pitch competitor names)
- Summary: ${brief.summary || '(none)'}
- Products / offerings: ${brief.products.slice(0, 10).join(', ') || '(none listed)'}
- Key entities: ${brief.entities.slice(0, 15).join(', ') || '(none)'}
- Audience segments: ${brief.audiences.slice(0, 6).join(' | ') || project.target_audience}
- USPs: ${brief.usps.slice(0, 6).join(' | ') || '(none)'}
- Tone: ${brief.tone || 'professional, expert, helpful'}
`
    : '';

  // Research context block
  const researchBlock = research ? formatResearchForPrompt(research) : '';

  // Optional live keyword + SERP context (when provided by the caller).
  const ahrefsBlock = ahrefsContext && (ahrefsContext.ideas.length || ahrefsContext.serp.length)
    ? formatAhrefsContextForPrompt(ahrefsContext)
    : '';

  // Build the ordered H2 list.
  // Priority: live matching terms > entry.secondary_keywords > fallback instruction.
  // We take the top 10 by volume so the LLM gets the most-searched sub-topics first.
  const termsMatchList = ahrefsContext?.matchingTerms?.length
    ? ahrefsContext.matchingTerms
        .slice(0, 10)
        .map((k, i) => `${i + 1}. ${k.keyword}${k.volume ? ` (${k.volume.toLocaleString()} searches/mo)` : ''}`)
        .join('\n')
    : entry.secondary_keywords?.length
      ? entry.secondary_keywords
          .slice(0, 10)
          .map((kw, i) => `${i + 1}. ${kw}`)
          .join('\n')
      : 'none — derive 7–8 topically relevant H2s from the primary keyword';

  // Build FAQ seed list.
  // Priority: live question terms > Serper PAA > fallback instruction.
  const ahrefsQuestions = ahrefsContext?.questions?.length
    ? ahrefsContext.questions
        .slice(0, 10)
        .map(k => `• ${k.keyword}${k.volume ? ` (${k.volume.toLocaleString()} searches/mo)` : ''}`)
        .join('\n')
    : '';

  const paaQuestions = research?.peopleAlsoAsk?.length
    ? research.peopleAlsoAsk
        .slice(0, 7)
        .map(q => `• ${q.question}${q.answer ? `\n  Hint: ${q.answer}` : ''}`)
        .join('\n')
    : '';

  // Combine: research question terms first (volume-ranked), then PAA (freshness/context).
  const faqSeeds = [ahrefsQuestions, paaQuestions].filter(Boolean).join('\n') ||
    'none available — use the most common search questions around this topic';

  const prompt = `You are an expert SEO content strategist and writer. Your job is to produce a blog post that ranks in Google, gets cited by AI Overviews, and converts readers for ${project.company}.

CRITICAL OUTPUT RULE: Your response must contain ONLY the final Markdown blog post followed by the ---META--- block. Do NOT write out any planning steps, reasoning, step numbers, step headers, or process notes. All planning (steps 1–4 below) is INTERNAL THINKING ONLY — never appear in the output.

════════════════════════════════════════
INPUTS
════════════════════════════════════════
PRIMARY KEYWORD: "${entry.focus_keyword}"
ARTICLE TITLE:   "${entry.title}"
ARTICLE TYPE:    ${entry.article_type}
TARGET AUDIENCE: ${project.target_audience}
INDUSTRY/NICHE:  ${project.niche}
COMPANY:         ${project.company} (${project.domain})
WORD COUNT:      ~${wordCount} words
${writerNotesBlock}${briefBlock}${internalLinksBlock}

SECONDARY KEYWORDS / TERMS MATCH (from keyword research — these become your H2 topics):
${termsMatchList}

QUESTIONS FROM RESEARCH + PEOPLE ALSO ASK (use 3–4 verbatim in the FAQ section):
${faqSeeds}

${researchBlock}

${ahrefsBlock}

════════════════════════════════════════
INTERNAL PLANNING — do this mentally, output NOTHING from these steps
════════════════════════════════════════

[PLAN STEP 1 — H2 STRUCTURE — keep internal]
Using the SECONDARY KEYWORDS / TERMS MATCH list above (sorted by search volume where available), mentally select the 7–10 most search-intent-relevant ones and decide each H2 heading.
Rules for H2 headings:
• Use plain, direct language — no "navigating", "nuances", "at a glance", "unlocking", "delving", "comprehensive", "in today's world", or any GPT-style filler.
• Each H2 must answer a specific reader question or address a specific subtopic.
• Write headings as short noun phrases or direct questions (e.g. "How to Hire AI Engineers", "AI Engineer Salary in 2024", "Top Skills Every AI Engineer Needs").
• Keep them under 8 words where possible.

[PLAN STEP 2 — FAQ MAPPING — keep internal]
From the QUESTIONS FROM RESEARCH + PEOPLE ALSO ASK list above, mentally pick 3–4 of the highest-volume questions for the FAQ section. Add 3–6 more common questions around this topic so the FAQ has 7–10 questions total.
Each FAQ answer must be:
• Crisp and ≤50 words.
• Answer-first (first sentence directly answers the question).
• Written in active voice.

[PLAN STEP 3 — AUTHORITY SECTIONS — keep internal]
Based on the primary keyword and the company's niche (${project.niche}), mentally identify 2–4 H2 sections that let ${project.company} demonstrate expertise subtly.
Think: what challenges, solutions, strategies, or industry insights can you include that naturally lead the reader toward ${project.company}'s value — without a sales pitch?
Examples of authority angles: hiring/operational challenges, step-by-step solutions, industry-specific use cases, data-backed trends the company solves for.
Weave ${project.company} mentions naturally (1–2 times max in the full body), tied to a genuine insight or solution.

[PLAN STEP 4 — FINAL STRUCTURE — keep internal]
Mentally combine the H2s from Step 1 + authority sections from Step 3 into a final outline. The structure must:
• Fulfil informational search intent (the reader leaves knowing the topic deeply).
• Flow logically: define → explain → apply → evaluate → act.
• Not sound like an ad. Mention ${project.company} only where it adds real value.
• Include a FAQPage section (from Step 2) before the Conclusion.

════════════════════════════════════════
NOW WRITE THE FULL BLOG — this is the ONLY thing you output
════════════════════════════════════════
Write the complete blog post using the structure you planned above. Begin immediately with the # H1 title.

SEO SCORE REQUIREMENTS — every item below is machine-checked and scored:
┌─────────────────────────────────────────────────────────────────────┐
│ ✦ WORD COUNT        Minimum ${Math.max(wordCount, 1500)} words (target ${wordCount}). Never end early.
│ ✦ TITLE KEYWORD     Primary keyword MUST appear in the # H1.
│ ✦ INTRO KEYWORD     Primary keyword MUST appear within the first 100 words.
│ ✦ KEYWORD DENSITY   Mention the primary keyword naturally 1× per ~150–200 words (0.5–3% density). Spread mentions evenly — not just intro + conclusion.
│ ✦ H2 HEADINGS       At least 5 × ## headings (the checker requires ≥ 3).
│ ✦ H3 SUB-HEADINGS   At least 2 × ### headings inside the body sections.
│ ✦ FAQ SECTION       MUST have a heading that reads exactly "## Frequently Asked Questions". Include 7–10 Q&A pairs, each as ### Question / Answer.
│ ✦ EXTERNAL LINKS    Include at least 5 credible external links (checker requires ≥ 3). Format: [anchor text](https://...).
│ ✦ INTERNAL LINKS    Include at least 2 internal links from the INTERNAL LINKING pool. Format: [anchor text](/slug) or [anchor](https://domain/path).
│ ✦ META DESCRIPTION  140–165 characters. Must contain the primary keyword. Written as a sentence.
└─────────────────────────────────────────────────────────────────────┘

WRITING RULES — follow every rule without exception:

INTRO (first ~150 words):
• Open with 1 real, cited data point from a credible source (Gartner, Deloitte, McKinsey, LinkedIn, SHRM, Accenture, EY, Statista, World Economic Forum, or a peer-reviewed source). Format: stat + source inline link.
• Follow immediately with an answer-first paragraph (≤80 words) that directly answers the primary keyword query. This is extracted by AI Overviews — make it self-contained.
• Primary keyword must appear in the first 100 words naturally.
• NEVER start with "In today's world", "In recent years", "As we navigate", or any vague scene-setter.

EACH H2 SECTION:
• Open with a snippet-friendly paragraph of exactly 40–50 words that directly answers what the H2 promises. This paragraph alone must make sense if pulled out of context.
• Follow with deeper content: mix of short paragraphs (3–4 lines, 10–12 words per sentence) + bullet lists + tables where comparisons or data are present.
• Use at least one ### H3 sub-heading within the two longest H2 sections to break them into scannable sub-topics.
• Use transition words — "because", "for example", "however", "as a result", "in contrast", "specifically" — to connect sentences and paragraphs naturally.

SENTENCE & PARAGRAPH STYLE:
• Sentences: 10–12 words average. Break any sentence over 20 words into two.
• Paragraphs: 3–4 lines max. One idea per paragraph.
• Active voice throughout. Passive voice is only acceptable for citing sources.
• Simple, jargon-free language. If a technical term is unavoidable, define it in the same sentence.

IMAGES:
• Do NOT add any image markdown yourself. The system inserts at most 2 real images (hero + one supporting visual) AFTER your draft is written.
• Never output image syntax (no exclamation-mark followed by square-bracket alt then parenthesized URL).
• Never write a literal placeholder such as IMAGE_PLACEHOLDER.
• Never reference an image by URL.

LINKS (machine-checked — these directly affect your SEO score):
• External links: include AT LEAST 5 credible institutional citations (Gartner, Deloitte, McKinsey, LinkedIn Talent Blog, SHRM, Accenture, EY, Statista, WEF, government/academic sources). Spread them across different sections. Do NOT link to competitor blogs, random marketing blogs, Medium posts, Quora, Reddit, or thin affiliate pages.
• You have access to Google Search. You MUST use Google Search to find REAL, specific, deep-linked URLs for your citations. Do NOT link to root domains like "https://www.gartner.com" or "https://www.mckinsey.com". Link to the exact report, article, or statistic page that supports your claim.
• Internal links: include AT LEAST 3 from the INTERNAL LINKING pools above, woven naturally into body sections. Do NOT invent internal URLs. You MUST use the exact URLs provided in the pool.
• If you genuinely cannot place 3 natural in-body internal links, add a section ## Also read immediately BEFORE "## Frequently Asked Questions" with 2–3 bullets. Each bullet must be a single markdown link from the INTERNAL LINKING pool plus one short sentence on why it matters. Do not duplicate URLs already linked in the body.
• Format all links as [anchor text](url).

KEYWORD DENSITY:
• The primary keyword "${entry.focus_keyword}" must appear once every ~150–200 words on average.
• Spread uses naturally across: intro, at least 2 H2 sections, and the conclusion.
• Do not cluster all uses in one section. Do not keyword-stuff (max 3% density).
• Secondary keywords should each appear once naturally in their corresponding H2 section.

CONTENT QUALITY:
• Cover at least one angle that the top-ranking competitor pages miss.
• Back every claim with data. If no data is available from context, use hedged language ("research suggests", "industry estimates").
• Do NOT include schema JSON-LD, raw HTML, or code blocks in the article body.

════════════════════════════════════════
OUTPUT FORMAT — begin your response here, nothing before it
════════════════════════════════════════

# [Compelling H1 — improve "${entry.title}" if needed, MUST include primary keyword]

[Opening data point with inline citation link — e.g. "According to [Source](https://...), stat..."]

[Answer-first paragraph — ≤80 words, primary keyword in first 100 words total]

## [H2 — section 1]
[40–50 word snippet paragraph]
[Deeper paragraphs, bullets, or table]

### [H3 sub-topic inside this section]
[Body]

## [H2 — section 2]
[40–50 word snippet paragraph]
[Body]

## [H2 — section 3]
[40–50 word snippet paragraph]

### [H3 sub-topic]
[Body]

## [H2 — section 4 — authority-building for ${project.company}]
[40–50 word snippet paragraph]
[Content that demonstrates ${project.company}'s expertise, no hard sell]

## [H2 — section 5+, continue as needed to reach word count target]

## Frequently Asked Questions

### [Question 1 — from PAA or research questions]
[Answer ≤50 words, answer-first]

### [Question 2]
[Answer ≤50 words]

### [Question 3]
[Answer ≤50 words]

### [Question 4]
[Answer ≤50 words]

### [Question 5]
[Answer ≤50 words]

### [Question 6]
[Answer ≤50 words]

### [Question 7 — add up to 10 total]
[Answer ≤50 words]

## Conclusion
[Strong, actionable closing — 3–5 sentences. Include primary keyword once. The final paragraph MUST include a strong Call to Action (CTA) linking to ${project.domain} or a relevant product page from the internal linking pool.]

FORMAT: Valid Markdown only. Use [text](url) for all links. Never output raw HTML.

After the article, output EXACTLY this block (no extra text, no trailing comma, valid JSON):
---META---
{"meta_description":"[140–165 chars, must include '${entry.focus_keyword}', written as a clear sentence]","slug":"url-slug-from-h1","external_links":["https://url1","https://url2","https://url3","https://url4","https://url5"],"internal_links":["/slug-or-absolute-url-1","/slug-or-absolute-url-2"]}`;

  const text = await geminiGenerate(prompt, 3, true);

  // Safety strip: remove any leaked planning-step headers the LLM may have output
  // despite the INTERNAL PLANNING instruction. These lines begin with "STEP N —"
  // or are the ════ separator lines used in the planning section.
  function stripLeakedStepContent(raw: string): string {
    return raw
      // Remove lines that are exactly the ════ separator (8+ chars)
      .replace(/^[═]{8,}\s*$/gm, '')
      // Remove lines like "STEP 1 — ..." or "STEP 1: ..."
      .replace(/^STEP\s+\d+\s*[—–:-].*$/gm, '')
      // Remove [PLAN STEP …] markers if they leaked
      .replace(/^\[PLAN STEP.*?\].*$/gm, '')
      // Collapse 3+ consecutive blank lines into 2
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Parse content + metadata
  const sepIdx = text.indexOf('---META---');
  let content = stripLeakedStepContent(text.trim());
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
    } catch { /* use defaults */ }
  }

  // Extract additional links from content via regex. Any http(s) link that
  // points to the user's own domain is an *internal* link (backlinks to their
  // site); anything else is external.
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

  // Relative /slug links (our own generated blogs) — still internal.
  // We will convert them to absolute URLs based on project.domain
  const internalLinkRegex = /\[([^\]]+)\]\((\/[^)]+)\)/g;
  while ((match = internalLinkRegex.exec(content)) !== null) {
    const path = match[2];
    const absoluteUrl = project.domain ? `https://${project.domain}${path}` : path;
    
    // Replace the relative link in the content with the absolute URL
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

  const prompt = `You are an SEO content strategist. Complete this content calendar by adding a title and slug for each entry.

PROJECT: ${project.company} | ${project.niche} | Audience: ${project.target_audience}

ENTRIES TO COMPLETE (${actualDays} entries):
${assignments.map(a => `Day ${a.day} | ${a.date} | keyword: "${a.keyword}" | type: ${a.article_type}`).join('\n')}

RULES:
- Keep keyword and article_type EXACTLY as given
- Title must be compelling and specific for that keyword and type
- Slug: lowercase, hyphenated, URL-safe, max 6 words

Return ONLY a JSON array. No markdown. No explanation. No code fences:
[{"day":1,"date":"YYYY-MM-DD","keyword":"exact keyword","title":"Title Here","article_type":"How-to Guide","slug":"title-here"}]`;

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
    wordCount = 2200,
  } = input;

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
        .map(
          (i, idx) =>
            `${idx + 1}. [${i.severity.toUpperCase()}] ${i.label}\n   What's wrong: ${i.detail}\n   Fix: ${i.fix}`
        )
        .join('\n')
    : '(no explicit issues — focus on depth, clarity, and answer-first intro)';

  const gapsBlock = contentGaps.length
    ? contentGaps.map(g => `- ${g}`).join('\n')
    : '(the LLM did not flag explicit content gaps)';

  const linkPool = internalLinkPool
    .filter(u => u !== sourceUrl)
    .slice(0, 25);
  const linkPoolBlock = linkPool.length
    ? linkPool.map(u => `- ${u}`).join('\n')
    : '(no peer URLs available)';

  const briefLine = brief
    ? `Company voice (for tone ONLY — do not hijack the topic): ${brief.summary} · Products: ${brief.products.slice(0, 3).join(', ') || 'n/a'}`
    : '';

  // Truncate the original — we want the LLM to see structure + flavor, not
  // reproduce word-for-word.
  const originalHead = originalMarkdown.slice(0, 10_000);

  const prompt = `You are a senior SEO + content editor. Repair an existing public blog post by making the smallest useful changes needed to address the audit issues below. This is NOT a net-new article generation task.

IMPORTANT RULES:
- This is a REPAIR of an existing page — the topic must stay the same. Do NOT pivot to a different product, industry, or audience.
- Target the same primary keyword unless the audit explicitly says the keyword is dead; then re-target to the closest secondary keyword listed.
- Preserve every section, claim, example, and phrasing that is already correct. Only rewrite the parts connected to the listed audit issues or missing subtopics.
- Do not change the title/H1 unless TITLE_NEEDS_REPAIR is true. If false, the H1 must remain exactly: "${originalTitle || '(keep original H1)'}".
- Do not change the meta description unless META_NEEDS_REPAIR is true. If false and you cannot see the original meta description, return a neutral summary that matches the original page, not a new angle.
- Output must be valid Markdown. No HTML.
- Do not include schema JSON-LD, raw JSON, or implementation code blocks in the article body.
- Start with an H1 (# Title).
- Include an "answer-first" paragraph directly under the H1 in ≤80 words that plainly answers "what is this post about and what will the reader learn".
- Add H2/H3 structure, FAQ, internal links, external links, examples, or data ONLY where the audit says those are missing or weak.
- Link to peer URLs from the INTERNAL LINK POOL only if internal links are missing/weak or the repair naturally touches those sections. Use verbatim URLs. Never invent URLs.
- Link to credible external sources only if the audit says citations/data are missing or a changed section needs proof. You MUST use Google Search to find REAL, specific, deep-linked URLs for your citations. Do NOT link to root domains like "https://www.gartner.com". Link to the exact report or article. No Wikipedia.
- Keep length close to the original unless the audit says thin content / missing depth. If expanding, add only the listed missing subtopics.

SOURCE URL (the live page being repaired): ${sourceUrl}
ORIGINAL TITLE/H1: ${originalTitle || '(unknown)'}
TITLE_NEEDS_REPAIR: ${titleNeedsRepair ? 'true' : 'false'}
META_NEEDS_REPAIR: ${metaNeedsRepair ? 'true' : 'false'}
PRIMARY KEYWORD: ${primaryKeyword || '(infer from title)'}
SECONDARY KEYWORDS: ${secondaryKeywords.join(', ') || '(none)'}
${briefLine}

AUDIENCE: ${project.target_audience}
REGION: ${project.target_region}

AUDIT ISSUES TO FIX:
${issueBlock}

MISSING SUBTOPICS TO COVER:
${gapsBlock}

INTERNAL LINK POOL (you MUST use at least 2 of these, verbatim):
${linkPoolBlock}

ORIGINAL PAGE (first ~10k chars of markdown, for reference — do not copy, rewrite):
---
${originalHead}
---

Write the repaired blog now. End the blog content, then on the next line output EXACTLY:
---META---
{"meta_description":"150–160 chars only if META_NEEDS_REPAIR, otherwise preserve the original angle","slug":"url-slug-from-title","external_links":["url1"],"internal_links":["url1","url2"],"repair_notes":["Done: specific fix applied and where","Still to do: optional manual follow-up, or 'Still to do: none'"]}`;

  const text = await geminiGenerate(prompt, 3, true);

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

  const prompt = `You are a senior SEO and content strategist.

OUR SITE
- Domain: ${project.domain}
- Company: ${project.company}
- Niche: ${project.niche}
- Audience: ${project.target_audience}
- Region / language: ${project.target_region} / ${project.target_language}

INDUSTRY KEYWORDS (from our research — statuses may be pending, approved, or rejected):
${ind || '(none)'}

COMPETITOR GAP SIGNALS (pages and queries competitors lean on that we may not cover):
${gapLines || '(none)'}

Write:
1) ## Where competitors look stronger
Short bullets: themes or intents suggested by their content vs our keyword set.

2) ## Gaps on our side
Short bullets: content angles or clusters we should add or deepen.

3) ## What to publish first
Numbered list: 8–15 concrete priorities tied to demand.

Then output ONE JSON object on its own line after this exact marker (no code fences):
---CLUSTER---
{"prioritized_keywords":["phrase", "..."]}

JSON rules:
- 12–28 strings in prioritized_keywords.
- Each string must match (verbatim or trivial spacing case) a keyword from the INDUSTRY or COMPETITOR lists above.
- Order = recommended publishing order for one cohesive monthly cluster.`;

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
