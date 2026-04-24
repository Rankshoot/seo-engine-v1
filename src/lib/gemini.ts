import { CalendarEntry, Project } from './types';
import { ResearchContext, formatResearchForPrompt } from './research';
import type { BusinessBrief } from './business-brief';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

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

export async function geminiGenerate(prompt: string, retries = 3): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.75, maxOutputTokens: 8192 },
        }),
      });

      if (res.status === 429) {
        const wait = (attempt + 1) * 20;
        console.warn(`Gemini 429 — waiting ${wait}s (attempt ${attempt + 1}/${retries})`);
        await new Promise(r => setTimeout(r, wait * 1000));
        continue;
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

export async function generateBlogPost(
  entry: CalendarEntry,
  project: Project,
  wordCount: number = 2500,
  research?: ResearchContext,
  existingBlogs?: Array<{ title: string; slug: string; target_keyword: string }>,
  brief?: BusinessBrief | null
): Promise<GeneratedBlog> {
  const secondaryKw = entry.secondary_keywords?.length
    ? entry.secondary_keywords.join(', ')
    : 'none';

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
      ? `Blog posts we've generated in this project (use /slug relative URLs):\n${generatedLinks
          .map(b => `- "${b.title}" → /${b.slug} (keyword: ${b.target_keyword})`)
          .join('\n')}`
      : '';
    internalLinksBlock = `\nINTERNAL LINKING (pick 2–4 total, split across the two pools, placed where they genuinely help the reader):\n${[siteBlock, generatedBlock].filter(Boolean).join('\n\n')}`;
  }

  // Company grounding from the Business Brief so the draft sounds like this
  // specific company rather than a generic explainer.
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

  const prompt = `You are a world-class SEO + GEO content writer. Write a comprehensive, deeply researched blog post that ranks in Google AND gets cited by AI answer engines (AI Overviews, Perplexity, ChatGPT).

TARGET KEYWORD: "${entry.focus_keyword}"
ARTICLE TITLE: "${entry.title}"
ARTICLE TYPE: ${entry.article_type}
TARGET AUDIENCE: ${project.target_audience}
INDUSTRY/NICHE: ${project.niche}
COMPANY: ${project.company} (${project.domain})
SECONDARY KEYWORDS: ${secondaryKw}
WORD COUNT: ~${wordCount} words
${briefBlock}${internalLinksBlock}

${researchBlock}

WRITING RULES (SEO + GEO 2026):
1. Hook = real scenario, stat, or provocative question. NEVER "In today's world" / "In recent years".
2. Put a direct, one-paragraph answer to the query in the first 80 words (this is what AI Overviews extract).
3. Target keyword must appear in the first 100 words naturally.
4. Write like a subject-matter expert from ${project.company} — specific, actionable, no fluff. Reference the company's products/entities from COMPANY CONTEXT when it genuinely helps the reader, never as a pitch.
5. Use research context above to add real data points, cite sources with inline links [anchor](url).
6. Cover what competitors miss — go deeper on at least 2 sections.
7. Include People-Also-Ask-style questions as an FAQ section (5–7 Qs).
8. 3–5 external links to authoritative sources from the research block.
9. 2–4 INTERNAL links from the pools above, placed where they genuinely help. Do NOT invent internal URLs.
10. H2 for main sections, H3 for subsections. Short paragraphs (max 3–4 sentences).

ARTICLE STRUCTURE (adapt for "${entry.article_type}"):
# [Compelling H1 — use or improve "${entry.title}"]

[Hook — 2-3 sentences]

[Answer-first paragraph — directly answers the target keyword in ≤80 words, keyword in first 100 words]

## [Section 1 — core topic]

## [Section 2 — deeper dive]

## [Section 3 — practical/actionable]

## [Section 4 if word count allows]

## Frequently Asked Questions
### [Q from People Also Ask or common search question]
[Answer — 2–4 sentences, answer-first]
### [Q2]
[Answer]
...5-7 FAQs total

## Conclusion
[Strong, actionable closing]

FORMAT: Valid Markdown only. Use [text](url) for all links. Never output HTML.

After article, output EXACTLY:
---META---
{"meta_description":"150–160 chars with target keyword","slug":"url-slug-from-title","external_links":["url1","url2"],"internal_links":["url-or-slug-1","url-or-slug-2"]}`;

  const text = await geminiGenerate(prompt);

  // Parse content + metadata
  const sepIdx = text.indexOf('---META---');
  let content = text.trim();
  let meta_description = '';
  let slug = entry.slug;
  let external_links: string[] = [];
  let internal_links: string[] = [];

  if (sepIdx !== -1) {
    content = text.substring(0, sepIdx).trim();
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
  const internalLinkRegex = /\[([^\]]+)\]\((\/[^)]+)\)/g;
  while ((match = internalLinkRegex.exec(content)) !== null) {
    const path = match[2];
    if (!internal_links.includes(path)) internal_links.push(path);
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

  const text = await geminiGenerate(prompt);

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
  return calendar.slice(0, actualDays).map(entry => {
    const match = usedKeywords.find(k => k.keyword === entry.keyword);
    return { ...entry, secondary_keywords: match?.secondary_keywords ?? [] };
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Blog repair — rewrite an existing public page addressing audit issues.

export interface RepairBlogInput {
  /** The live URL of the page being repaired. */
  sourceUrl: string;
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

  const prompt = `You are a senior SEO + content editor. Rewrite an existing public blog post so that it addresses every audit issue listed below, while preserving the ORIGINAL topic, voice, and audience.

IMPORTANT RULES:
- This is a REPAIR of an existing page — the topic must stay the same. Do NOT pivot to a different product, industry, or audience.
- Target the same primary keyword unless the audit explicitly says the keyword is dead; then re-target to the closest secondary keyword listed.
- Output must be valid Markdown. No HTML.
- Start with an H1 (# Title).
- Include an "answer-first" paragraph directly under the H1 in ≤80 words that plainly answers "what is this post about and what will the reader learn".
- Add an H2-structured body with concrete examples, numbers, and subheads. Hit ≈${wordCount} words.
- Include a ## FAQ section with 4–6 Q/A pairs (this helps earn AI Overview citations).
- Link to 2–4 peer URLs from the INTERNAL LINK POOL below, verbatim. Use descriptive anchor text tied to the linked page. Never invent URLs.
- Link to 1–3 credible external sources (research bodies, stats sites, documentation) using [anchor](url) — no Wikipedia.
- Close with a brief "## Key takeaways" bullet list (3–5 bullets).

SOURCE URL (the live page being repaired): ${sourceUrl}
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

Write the repaired blog now. Keep the H1 title close to the original intent but improved for clarity and keyword. End the blog content, then on the next line output EXACTLY:
---META---
{"meta_description":"150–160 chars with primary keyword","slug":"url-slug-from-title","external_links":["url1"],"internal_links":["url1","url2"],"repair_notes":["one-line summary of each fix applied"]}`;

  const text = await geminiGenerate(prompt);

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
    if (!internal_links.includes(path)) internal_links.push(path);
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

  const text = await geminiGenerate(prompt);
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
