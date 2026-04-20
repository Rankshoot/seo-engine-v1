/**
 * Business Brief = our cached, structured understanding of the user's own
 * business. Built once per project by scraping their domain + competitor
 * homepages and asking Gemini to extract a JSON summary. Drives everything
 * downstream: keyword seeds, relevance filtering, internal linking, blog
 * grounding. See AGENTS.md §"SEO Engine — product pillars".
 */

import {
  fetchBlogUrls,
  jinaReadBatch,
  pickBriefUrls,
  normalizeDomain,
  type JinaPage,
} from './jina';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

export interface InternalLinkCandidate {
  url: string;
  title: string;
  /** Why this page would be a good internal link target (1 short phrase). */
  topic: string;
}

export interface BusinessBrief {
  /** One-paragraph description of what this company does. Shown in UI. */
  summary: string;
  /** Concrete products / offerings, named as the company names them. */
  products: string[];
  /** Domain-specific nouns: technologies, certifications, integrations, methodologies. */
  entities: string[];
  /** Real audience segments inferred from the site, may refine the form input. */
  audiences: string[];
  /** Unique selling points / differentiators (max 6). */
  usps: string[];
  /** Writing tone to reuse in blog generation, e.g. "authoritative, dev-friendly". */
  tone: string;
  /** Pages on the user's site we can link to from future blog posts. */
  internal_link_candidates: InternalLinkCandidate[];
  /** 15–25 seed phrases _specific to this business_ — drives keyword discovery. */
  seed_phrases: string[];
  /** Awareness-stage topics worth publishing (optional hints). */
  tofu_hints: string[];
  mofu_hints: string[];
  bofu_hints: string[];
  /** Every blog URL we found on the user's domain (for Content Health audit). */
  blog_urls: string[];
  /** Snapshot metadata — useful for debugging in UI. */
  source_urls: string[];
  scraped_chars: number;
  generated_at: string;
}

export interface BriefTraceEntry {
  label: string;
  url?: string;
  ok: boolean;
  length?: number;
  error?: string;
}

export interface BuildBriefResult {
  brief: BusinessBrief;
  trace: BriefTraceEntry[];
}

export interface BuildBriefInput {
  domain: string;
  company: string;
  niche: string;
  target_audience: string;
  description?: string;
  competitors?: string[];
}

/** Entrypoint: scrape → extract → return structured brief. */
export async function buildBusinessBrief(input: BuildBriefInput): Promise<BuildBriefResult> {
  const trace: BriefTraceEntry[] = [];

  // 1. Collect candidate URLs (user's site + competitor homepages).
  //    We run blog discovery in parallel with scraping so the LLM sees the
  //    user's existing blog inventory and can cite those URLs as internal
  //    link candidates (not just marketing pages).
  const [userUrls, blogUrls] = await Promise.all([
    pickBriefUrls(input.domain, 10),
    fetchBlogUrls(input.domain, 200),
  ]);

  const competitorUrls = (input.competitors ?? [])
    .slice(0, 3)
    .map(d => `${normalizeDomain(d)}/`);
  const allUrls = [...userUrls, ...competitorUrls];

  trace.push({ label: 'picked_urls', ok: true, length: allUrls.length });
  trace.push({ label: 'blog_urls_discovered', ok: true, length: blogUrls.length });

  // 2. Scrape them with Jina Reader (free, markdown out).
  const pages = await jinaReadBatch(allUrls, { timeoutMs: 25_000 });
  for (const p of pages) {
    trace.push({
      label: 'jina_read',
      url: p.url,
      ok: p.ok,
      length: p.length,
      error: p.error,
    });
  }

  const successful = pages.filter(p => p.ok && p.markdown.length > 200);

  // 3. Build an LLM-sized context. Cap per page so one giant page doesn't
  //    crowd out everything else.
  const userPages = successful.filter(p => inSameDomain(p.url, input.domain));
  const compPages = successful.filter(p => !inSameDomain(p.url, input.domain));

  const userContext = userPages
    .map(p => `### USER SITE · ${p.url}\n${p.markdown.slice(0, 6000)}`)
    .join('\n\n');
  const compContext = compPages
    .map(p => `### COMPETITOR · ${p.url}\n${p.markdown.slice(0, 3500)}`)
    .join('\n\n');

  // A compact list of existing blog URLs — the LLM will echo these back into
  // `internal_link_candidates` so future blog generation has real anchor targets.
  const blogCatalogue = blogUrls.slice(0, 40);
  const blogListContext = blogCatalogue.length
    ? `\n### EXISTING BLOG POSTS ON USER SITE (full inventory, use for internal_link_candidates)\n${blogCatalogue.join('\n')}`
    : '';

  const scrapedChars = userContext.length + compContext.length;

  const prompt = buildPrompt(input, userContext + blogListContext, compContext);

  // 4. Gemini → JSON.
  let parsed: Partial<BusinessBrief> | null = null;
  try {
    const jsonText = await geminiJson(prompt);
    parsed = safeParse(jsonText);
    trace.push({ label: 'gemini_extract', ok: !!parsed, length: jsonText.length });
  } catch (e) {
    trace.push({
      label: 'gemini_extract',
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // 5. Fall back gracefully if the LLM failed — still return something usable.
  const brief: BusinessBrief = coerceBrief(parsed, input, pages, scrapedChars, blogUrls);
  return { brief, trace };
}

// ────────────────────────────────────────────────────────────────────────────
// helpers

function inSameDomain(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const target = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    return host === target || host.endsWith(`.${target}`);
  } catch {
    return false;
  }
}

function buildPrompt(
  input: BuildBriefInput,
  userContext: string,
  compContext: string
): string {
  return `You are a senior SEO + content strategist. Read the scraped website content below and produce a JSON Business Brief that another AI will use to drive keyword discovery and blog generation.

COMPANY (as user entered it)
- Company: ${input.company}
- Domain: ${input.domain}
- Stated niche: ${input.niche}
- Stated audience: ${input.target_audience}
- Description: ${input.description || '(none)'}

SCRAPED CONTENT FROM THE USER'S OWN SITE
${userContext || '(user site returned no usable content — rely on the stated niche/description)'}

SCRAPED CONTENT FROM COMPETITOR HOMEPAGES (context only — NOT to be described as "us")
${compContext || '(no competitor content)'}

Your task:
Produce ONLY a JSON object with this exact shape (no prose, no markdown fences, no trailing text):
{
  "summary": "one factual paragraph (≤60 words) describing what THIS company (not competitors) does and who they serve",
  "products": ["product or offering names as the company names them", "..."],
  "entities": ["domain-specific nouns: technologies, integrations, methodologies, certifications, platform names", "..."],
  "audiences": ["narrower, concrete audience segments inferred from the scraped content (e.g. 'mid-market HR managers evaluating ATS replacements')", "..."],
  "usps": ["their differentiators in short phrases", "..."],
  "tone": "2–4 adjectives describing their voice (e.g. 'authoritative, developer-friendly, data-led')",
  "internal_link_candidates": [
    { "url": "https://full-url-from-scraped-content", "title": "page title", "topic": "short phrase — what topic this page covers" }
  ],
  "seed_phrases": ["15 to 25 highly specific keyword seeds that a prospective customer of THIS company would actually type into Google — mix TOFU questions, MOFU comparisons, BOFU commercial intent, grounded in the products/entities above"],
  "tofu_hints": ["3–6 awareness-stage blog topics (how/what/why) this business should publish"],
  "mofu_hints": ["3–6 evaluation-stage topics (best/vs/compare)"],
  "bofu_hints": ["2–4 decision-stage topics (pricing, demo, ROI, implementation)"]
}

Rules for seed_phrases (critical — these become real Google queries):
- Each phrase is 2–6 words.
- No brand-only phrases unless the company is the brand (never competitor brand names).
- Prefer phrases that combine a product/entity with a real user intent verb ("automate", "integrate", "compare", "cost of", "how to", "best … for").
- Never invent products that aren't in the scraped content or stated niche.
- Region-neutral (discovery will localize via DataForSEO).

Return ONLY the JSON object.`;
}

async function geminiJson(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing in server env');
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty text');
  return text;
}

function safeParse(text: string): Partial<BusinessBrief> | null {
  try {
    return JSON.parse(text);
  } catch {
    // Very occasionally Gemini will wrap JSON in ```json fences despite the
    // mimeType hint. Strip them and retry.
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function coerceBrief(
  parsed: Partial<BusinessBrief> | null,
  input: BuildBriefInput,
  pages: JinaPage[],
  scrapedChars: number,
  blogUrls: string[]
): BusinessBrief {
  const sourceUrls = pages.filter(p => p.ok).map(p => p.url);
  const cleanBlogUrls = dedupe(blogUrls);

  // If the LLM call fully failed, synthesize a minimal brief from form input
  // so discovery still runs (just without the personalization upside).
  if (!parsed) {
    return {
      summary: input.description || `${input.company} operates in ${input.niche}.`,
      products: [],
      entities: [input.niche],
      audiences: [input.target_audience],
      usps: [],
      tone: '',
      internal_link_candidates: cleanBlogUrls.slice(0, 15).map(u => ({
        url: u,
        title: u.split('/').filter(Boolean).pop() ?? u,
        topic: 'existing blog post',
      })),
      seed_phrases: defaultSeeds(input),
      tofu_hints: [],
      mofu_hints: [],
      bofu_hints: [],
      blog_urls: cleanBlogUrls,
      source_urls: sourceUrls,
      scraped_chars: scrapedChars,
      generated_at: new Date().toISOString(),
    };
  }

  const seeds = dedupe(
    (parsed.seed_phrases ?? [])
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 1)
      .map(s => s.trim().toLowerCase())
  );

  // Merge LLM-extracted links with our discovered blog URL list so we never
  // lose the ground truth the sitemap gave us.
  const llmLinks = sanitizeLinks(parsed.internal_link_candidates, input.domain);
  const knownBlogLinks: InternalLinkCandidate[] = cleanBlogUrls
    .filter(u => !llmLinks.some(l => l.url === u))
    .slice(0, 20 - llmLinks.length)
    .map(u => ({
      url: u,
      title: u.split('/').filter(Boolean).pop()?.replace(/[-_]/g, ' ') ?? u,
      topic: 'existing blog post',
    }));

  return {
    summary: strOr(parsed.summary, input.description || ''),
    products: stringList(parsed.products, 20),
    entities: stringList(parsed.entities, 30),
    audiences: stringList(parsed.audiences, 10),
    usps: stringList(parsed.usps, 10),
    tone: strOr(parsed.tone, ''),
    internal_link_candidates: [...llmLinks, ...knownBlogLinks].slice(0, 25),
    seed_phrases: seeds.length ? seeds.slice(0, 25) : defaultSeeds(input),
    tofu_hints: stringList(parsed.tofu_hints, 10),
    mofu_hints: stringList(parsed.mofu_hints, 10),
    bofu_hints: stringList(parsed.bofu_hints, 10),
    blog_urls: cleanBlogUrls,
    source_urls: sourceUrls,
    scraped_chars: scrapedChars,
    generated_at: new Date().toISOString(),
  };
}

function defaultSeeds(input: BuildBriefInput): string[] {
  const n = input.niche;
  return [
    n,
    `best ${n}`,
    `${n} tools`,
    `${n} software`,
    `${n} for ${input.target_audience}`,
    `how to ${n}`,
    `${n} guide`,
    `${n} tips`,
  ];
}

function stringList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const out = v
    .filter((x): x is string => typeof x === 'string')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  return dedupe(out).slice(0, max);
}

function strOr(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : fallback;
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function sanitizeLinks(v: unknown, domain: string): InternalLinkCandidate[] {
  if (!Array.isArray(v)) return [];
  const target = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  const out: InternalLinkCandidate[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Partial<InternalLinkCandidate>;
    if (typeof r.url !== 'string' || !/^https?:\/\//i.test(r.url)) continue;
    try {
      const host = new URL(r.url).hostname.replace(/^www\./, '');
      if (host !== target && !host.endsWith(`.${target}`)) continue;
    } catch {
      continue;
    }
    out.push({
      url: r.url,
      title: strOr(r.title, r.url),
      topic: strOr(r.topic, ''),
    });
    if (out.length >= 15) break;
  }
  return out;
}
