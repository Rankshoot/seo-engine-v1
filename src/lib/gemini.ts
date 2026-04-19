import { CalendarEntry, Project } from './types';
import { ResearchContext, formatResearchForPrompt } from './research';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

async function geminiGenerate(prompt: string, retries = 3): Promise<string> {
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
  existingBlogs?: Array<{ title: string; slug: string; target_keyword: string }>
): Promise<GeneratedBlog> {
  const secondaryKw = entry.secondary_keywords?.length
    ? entry.secondary_keywords.join(', ')
    : 'none';

  // Build internal links context
  let internalLinksBlock = '';
  if (existingBlogs && existingBlogs.length > 0) {
    const relevantBlogs = existingBlogs
      .filter(b => b.target_keyword !== entry.focus_keyword)
      .slice(0, 8);
    if (relevantBlogs.length > 0) {
      internalLinksBlock = `
INTERNAL LINKING (link to these existing articles where topically relevant — use [anchor text](/slug) markdown format):
${relevantBlogs.map(b => `- "${b.title}" → /${b.slug} (keyword: ${b.target_keyword})`).join('\n')}
Add 2–4 internal links where natural. Do not force them.`;
    }
  }

  // Research context block
  const researchBlock = research ? formatResearchForPrompt(research) : '';

  const prompt = `You are a world-class SEO content writer AND researcher. Write a comprehensive, deeply researched blog post that outranks competitors.

TARGET KEYWORD: "${entry.focus_keyword}"
ARTICLE TITLE: "${entry.title}"
ARTICLE TYPE: ${entry.article_type}
TARGET AUDIENCE: ${project.target_audience}
INDUSTRY/NICHE: ${project.niche}
COMPANY: ${project.company} (${project.domain})
SECONDARY KEYWORDS: ${secondaryKw}
WORD COUNT: ~${wordCount} words
${internalLinksBlock}

${researchBlock}

WRITING RULES:
1. Start with a hook — real scenario, stat, or provocative question. NEVER "In today's world" or "In recent years"
2. Target keyword must appear in the first 100 words naturally
3. Write like a subject-matter expert — specific, actionable, no fluff
4. Use research context above to add real data points, cite sources with inline links [anchor](url)
5. Cover what competitors miss — go deeper on at least 2 sections
6. Include people-also-ask questions as FAQ items
7. Add external links to 3–5 authoritative sources found in research
8. Add internal links where relevant (see list above)
9. H2 for main sections, H3 for subsections

ARTICLE STRUCTURE (adapt for "${entry.article_type}"):
# [Compelling H1 — use or improve "${entry.title}"]

[Hook — 2-3 sentences]

[Strong intro paragraph with keyword in first 100 words]

## [Section 1 — core topic]

## [Section 2 — deeper dive]

## [Section 3 — practical/actionable]

## [Section 4 if word count allows]

## Frequently Asked Questions
### [Q from People Also Ask or common search question]
[Answer]
### [Q2]
[Answer]
...5-7 FAQs total

## Conclusion
[Strong, actionable closing]

FORMAT: Valid Markdown only. Use [text](url) for all links.

After article, output EXACTLY:
---META---
{"meta_description":"150–160 chars with target keyword","slug":"url-slug-from-title","external_links":["url1","url2"],"internal_links":["/slug1","/slug2"]}`;

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

  // Extract additional links from content via regex
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const url = match[2];
    if (!url.includes(project.domain) && !external_links.includes(url)) {
      external_links.push(url);
    }
  }

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
    internal_links: [...new Set(internal_links)].slice(0, 8),
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
