/**
 * Ebook prompt — long-form, lead-magnet style. Targets Gemini 2.5 Pro.
 *
 * The output is a single Markdown document the previewer renders directly
 * (cover → ToC → chapters → FAQs → CTA → references) followed by a JSON
 * meta block the server uses to populate `blogs.content_data`.
 */

import type { ResearchContext } from '@/lib/research';
import { formatResearchForPrompt } from '@/lib/research';
import type { BusinessBrief } from '@/lib/business-brief';

export interface EbookPromptContext {
  topic: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  audience: string;
  tone: string;
  goal: string;
  ctaObjective: string;
  chapterDepth: 'concise' | 'standard' | 'deep';
  regionLabel: string;
  languageLabel: string;
  companyName: string;
  companyDomain: string;
  niche: string;
  brief: BusinessBrief | null;
  research: ResearchContext | null;
  internalLinks: string[];
  semanticKeywords: string[];
  brandVoice?: string;
  brandValues?: string;
  brandDescription?: string;
}

const DEPTH_GUIDE: Record<EbookPromptContext['chapterDepth'], { chapters: string; words: string }> = {
  concise: { chapters: '5–6 chapters', words: '600–900 words per chapter, 4,000–6,000 total' },
  standard: { chapters: '7–8 chapters', words: '900–1,300 words per chapter, 7,000–10,000 total' },
  deep: { chapters: '9–11 chapters', words: '1,200–1,700 words per chapter, 11,000–18,000 total' },
};

export function buildEbookPrompt(ctx: EbookPromptContext): string {
  const depth = DEPTH_GUIDE[ctx.chapterDepth];
  const brandPersonaBlock = (ctx.brandVoice || ctx.brandValues || ctx.brandDescription)
    ? `\nBRAND PERSONA & IDENTITY:
${ctx.brandVoice ? `- Brand Voice/Tone: ${ctx.brandVoice}\n` : ''}${ctx.brandValues ? `- Core Values/Messaging: ${ctx.brandValues}\n` : ''}${ctx.brandDescription ? `- Personality/Description: ${ctx.brandDescription}\n` : ''}`
    : '';

  const briefBlock = ctx.brief
    ? `COMPANY GROUNDING (voice + credibility, not sales):
- Summary: ${ctx.brief.summary || '(none)'}
- Products / offerings: ${ctx.brief.products.slice(0, 8).join(', ') || '(none)'}
- Audiences: ${ctx.brief.audiences.slice(0, 4).join(' | ') || ctx.audience}
- USPs: ${ctx.brief.usps.slice(0, 4).join(' | ') || '(none)'}
- Tone bias from brief: ${ctx.brief.tone || ctx.tone}
${brandPersonaBlock}`
    : `(No cached brief — infer voice from the company name and niche.)
${brandPersonaBlock}`;

  const researchBlock = ctx.research ? formatResearchForPrompt(ctx.research) : '';
  const semanticBlock = ctx.semanticKeywords.length
    ? `Semantic keyword cluster (use naturally across chapters — never in a list, never stuffed):\n${ctx.semanticKeywords.slice(0, 24).map(k => `• ${k}`).join('\n')}`
    : '';
  const internalLinksBlock = ctx.internalLinks.length
    ? `Internal link pool (use 2–4 verbatim where they help the reader):\n${ctx.internalLinks.slice(0, 16).map(u => `- ${u}`).join('\n')}`
    : '(No internal link pool available — skip internal links.)';

  return `You are a senior content strategist drafting an authoritative, lead-magnet ebook for ${ctx.companyName}. Audience reads on desktop AND mobile; treat it like a premium downloadable PDF.

GOAL: ${ctx.goal}
CTA OBJECTIVE: ${ctx.ctaObjective}
PRIMARY KEYWORD: "${ctx.primaryKeyword}"
SECONDARY KEYWORDS: ${ctx.secondaryKeywords.join(', ') || '(derive 4–6 from research)'}
TOPIC: ${ctx.topic}
AUDIENCE: ${ctx.audience}
TONE: ${ctx.tone}
REGION: ${ctx.regionLabel} · LANGUAGE: ${ctx.languageLabel}
NICHE: ${ctx.niche}
DOMAIN: ${ctx.companyDomain}

LENGTH BUDGET: ${depth.chapters}, ${depth.words}.

${briefBlock}

${semanticBlock}

${internalLinksBlock}

${researchBlock}

OUTPUT CONTRACT — produce ONE Markdown document, then the ---META--- block.

Structure (use these heading levels exactly):
# [Cover title — must contain the primary keyword, ≤ 70 chars]
**[Cover subtitle — one sentence, between 20 and 160 characters, establishing the value promise of the ebook]**

> [Author note — one sentence about who this is for and what they'll walk away with. Mention ${ctx.companyName} once. Format as a blockquote.]

## Table of Contents
1. [Chapter 1 title]
2. [Chapter 2 title]
3. [Chapter 3 title]
4. [Chapter 4 title]
5. [Chapter 5 title]
(You must generate at least 5 chapters total, and list them in the Table of Contents.)

## Introduction
[Open with one verifiable, cited statistic in the first 80 words. Then an answer-first paragraph that names the problem, the reader, and the outcome. ≤ 300 words. You MUST mention the primary keyword "${ctx.primaryKeyword}" naturally inside these first 200 words of the Introduction.]

## Chapter 1 — [Chapter title]
[Each chapter MUST start with a 40–60 word answer-first summary, then dive into deeper sections marked with ###. Use bullets, numbered lists, and small comparison tables when they earn their place. Cite at least one external source per chapter using a Markdown link, drawn from the research block above. Reference ${ctx.companyName} naturally in 2–3 chapters total — never as filler. The ebook must contain at least 5 chapters total, averaging at least 700 words per chapter, and totaling at least 4,000 words. Use at least 4 H3 sub-headings (###) across the ebook body to break up chapters.]

### [Sub-section H3]
…
### [Sub-section H3]
…

## Chapter 2 — [Chapter title]
… (repeat the same shape for every chapter; mention the primary keyword naturally at least once per chapter, ensuring at least 5 chapters are generated)

## Frequently Asked Questions
### [Question 1 — drawn from research / PAA when available]
[Answer ≤ 60 words, answer-first, plain language.]
… (You must include at least 5 FAQ entries, up to 10)

## Key Takeaways
- [Bullet 1, ≤ 18 words]
- [Bullet 2]
… (5–8 bullets)

## Next Step — How ${ctx.companyName} Can Help
[One paragraph, ≤ 120 words. Connect the ebook outcome to ${ctx.companyName}'s products/offerings. End with a SINGLE clear call to action that maps to: ${ctx.ctaObjective}. Include at least 2 internal links from the pool.]

## References
- [Source title 1](https://...)
- [Source title 2](https://...)
… (You must list at least 5 distinct authoritative sources cited in the body of the ebook)

CRITICAL RULES — every bullet is enforced:
- Every chapter answers a real reader question implicit in the topic.
- No filler or AI clichés. Absolutely avoid: "in today's world", "in recent years", "navigating", "delving", "unlocking", "game-changer", "leveraging", "synergies", "cutting-edge", "best-in-class", "robust", "harnessing", "ever-evolving", "plethora", "tapestry", "realm", "comprehensive".
- Every claim of fact gets a source, either inline or in References.
- ${ctx.brandVoice ? `Strictly align the style and tone with the Brand Voice: ${ctx.brandVoice}.` : ctx.brief?.tone ? `Match the brand tone above.` : 'Use the requested tone (' + ctx.tone + ').'}
- Use Google Search to find SPECIFIC, deep-linked URLs pointing to the PRIMARY SOURCE of every claim (the actual research report, government dataset, academic paper, or official standard page — not a blog post summarising it). Preferred domains: .gov, .edu, PubMed/NCBI, WHO, CDC, McKinsey, Gartner, Deloitte, PwC, EY, Accenture, Forrester, Statista report pages, SHRM, IEEE, ISO, peer-reviewed journals. Never link to root domains. Never link to competitor blogs or vendor landing pages. No Wikipedia.
- Use at least 8 external Markdown links across the body, plus at least 2 internal links from the pool.
- Cover the semantic keyword cluster across multiple chapters. Never bullet-dump them.
- Keep paragraph length 3–4 lines. Sentences ≤ 22 words.
- No HTML, no JSON-LD schema blocks, no code blocks unless the topic is technical.

After the ebook output EXACTLY this block (no extra text, valid JSON, no trailing commas):
---META---
{
  "cover_title": "string",
  "cover_subtitle": "string (between 20 and 160 chars)",
  "meta_description": "150–160 chars marketing summary including primary keyword",
  "slug": "url-slug-from-cover-title",
  "table_of_contents": [
    { "number": 1, "title": "Chapter title", "summary": "1–2 sentence summary", "word_count": 950 }
  ],
  "faqs": [
    { "question": "string", "answer": "string ≤ 60 words" }
  ],
  "cta": "single sentence CTA shown in the right rail",
  "references": ["https://...", "https://..."],
  "external_links": ["https://...", "https://..."],
  "internal_links": ["https://... or /path"],
  "semantic_keywords": ["primary phrase", "phrase 2"]
}`;
}
