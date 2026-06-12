/**
 * Whitepaper prompt — research-driven, enterprise-leaning, EEAT-heavy.
 * Targets Gemini 2.5 Pro with Google Search grounding for real citations.
 */

import type { ResearchContext } from '@/lib/research';
import { formatResearchForPrompt } from '@/lib/research';
import type { BusinessBrief } from '@/lib/business-brief';

export interface WhitepaperPromptContext {
  topic: string;
  industry: string;
  problemStatement: string;
  audience: string;
  technicalDepth: 'executive' | 'analyst' | 'engineering';
  researchAngle: string;
  businessObjective: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  semanticKeywords: string[];
  regionLabel: string;
  languageLabel: string;
  companyName: string;
  companyDomain: string;
  brief: BusinessBrief | null;
  research: ResearchContext | null;
  internalLinks: string[];
  brandVoice?: string;
  brandValues?: string;
  brandDescription?: string;
}

const DEPTH_GUIDE: Record<WhitepaperPromptContext['technicalDepth'], string> = {
  executive:
    'Optimize for C-suite / VP readers. Plain English first, jargon explained inline, business outcomes lead every section.',
  analyst:
    'Optimize for analysts and senior managers. Show methodology, data ranges, and trade-offs; cite primary sources.',
  engineering:
    'Optimize for technical practitioners. Architecture-level detail, named standards, edge cases, failure modes; still cite sources.',
};

export function buildWhitepaperPrompt(ctx: WhitepaperPromptContext): string {
  const brandPersonaBlock = (ctx.brandVoice || ctx.brandValues || ctx.brandDescription)
    ? `\nBRAND PERSONA & IDENTITY:
${ctx.brandVoice ? `- Brand Voice/Tone: ${ctx.brandVoice}\n` : ''}${ctx.brandValues ? `- Core Values/Messaging: ${ctx.brandValues}\n` : ''}${ctx.brandDescription ? `- Personality/Description: ${ctx.brandDescription}\n` : ''}`
    : '';

  const briefBlock = ctx.brief
    ? `COMPANY GROUNDING (voice + credibility, NOT a sales brochure):
- Summary: ${ctx.brief.summary || '(none)'}
- Products / offerings: ${ctx.brief.products.slice(0, 8).join(', ') || '(none)'}
- Audiences: ${ctx.brief.audiences.slice(0, 4).join(' | ') || ctx.audience}
- USPs: ${ctx.brief.usps.slice(0, 4).join(' | ') || '(none)'}
- Tone bias: ${ctx.brief.tone || 'analytical, evidence-led, credible'}
${brandPersonaBlock}`
    : `(No cached brief — match the requested technical depth and the company name.)
${brandPersonaBlock}`;

  const researchBlock = ctx.research ? formatResearchForPrompt(ctx.research) : '';
  const semanticBlock = ctx.semanticKeywords.length
    ? `Semantic / topical authority cluster (cover across sections):\n${ctx.semanticKeywords.slice(0, 24).map(k => `• ${k}`).join('\n')}`
    : '';
  const internalLinksBlock = ctx.internalLinks.length
    ? `Internal link pool (use 2–3 verbatim where they extend the argument):\n${ctx.internalLinks.slice(0, 14).map(u => `- ${u}`).join('\n')}`
    : '(No internal link pool available — skip internal links.)';

  return `You are a senior industry analyst at ${ctx.companyName} writing an enterprise-grade whitepaper. The reader is making a high-stakes decision; treat every claim as if it will be cited by procurement, legal, or a board pack.

DEPTH MODE: ${ctx.technicalDepth.toUpperCase()} — ${DEPTH_GUIDE[ctx.technicalDepth]}
INDUSTRY: ${ctx.industry}
PRIMARY KEYWORD: "${ctx.primaryKeyword}"
SECONDARY KEYWORDS: ${ctx.secondaryKeywords.join(', ') || '(derive 4–6 from research)'}
TOPIC: ${ctx.topic}
PROBLEM STATEMENT: ${ctx.problemStatement}
AUDIENCE: ${ctx.audience}
RESEARCH ANGLE: ${ctx.researchAngle}
BUSINESS OBJECTIVE: ${ctx.businessObjective}
REGION: ${ctx.regionLabel} · LANGUAGE: ${ctx.languageLabel}
DOMAIN: ${ctx.companyDomain}

${briefBlock}

${semanticBlock}

${internalLinksBlock}

${researchBlock}

LENGTH: 3,500–6,500 words depending on depth. Never pad.

OUTPUT CONTRACT — Markdown only, then the ---META--- block.

Structure (use these heading levels exactly):
# [Whitepaper title — credible, includes primary keyword, no clickbait]
**[Subtitle — one line establishing the problem and the reader, between 20 and 160 characters]**

> [Authorship + credibility line: published by ${ctx.companyName}, with the date as ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}, citing data through that period.]

## Executive Summary
[3–5 short paragraphs. Must be between 100 and 600 words total. State the problem, the framework you propose, the headline finding, and the recommendation. The first 80 words must answer the topic question directly — this is the AI Overview anchor.]

## Industry Context
[Frame the macro problem with cited data. Link to at least 3 authoritative sources here (regulators, McKinsey/Gartner/Deloitte/IEEE/ISO/government/peer-reviewed). Show what changed recently. ${ctx.industry === 'general' ? '' : `Center the discussion in ${ctx.industry}.`}]

## Problem Definition
[Make the pain explicit: stakeholders, costs, decision pressure, regulatory drivers. Cite operational data where available.]

## Methodology / Research Angle
[Be transparent about how the analysis was constructed: sources consulted, time window, scope, limitations. Honesty here builds EEAT.]

## Findings
[3–5 ### sub-sections, each headed by a specific finding. Each finding must have:
• A one-sentence headline.
• 1–2 supporting paragraphs with cited evidence.
• A clear "so what" line that connects to business outcomes.]

## Strategic Analysis
[Synthesize the findings. You MUST include at least one data comparison table in Markdown format comparing approaches, vendors, or scenarios. Link to specific sources.]

## Recommendations
[Numbered list of 5–8 recommendations. You must have at least 5 recommendations. Each recommendation = action verb + measurable outcome + horizon (90 days / 12 months / 24 months). No filler.]

## Implementation Roadmap
[Sequence the recommendations into 3 horizons (immediate / mid-term / long-term). Use a Markdown table or bulleted phases.]

## Risks and Considerations
[Bullet list of 4–6 risks with one-line mitigations. This is non-negotiable for credibility.]

## Conclusion — Why This Matters for ${ctx.companyName}
[One short section, ≤ 200 words. Connect the recommendations to ${ctx.companyName}'s offerings without sales pitch language. End with one sentence that maps to: ${ctx.businessObjective}.]

## References
- [Source 1](https://...)
- [Source 2](https://...)
… (10–18 distinct authoritative sources cited in-body)

CRITICAL RULES — every bullet is enforced:
- EEAT first: every quantitative claim has a source, every recommendation is testable.
- Use Google Search to find SPECIFIC, deep-linked URLs. Never link to root domains. Never cite Wikipedia.
- Required citations: at least 10 across the body.
- Required internal links: at least 2 internal links from the pool, used verbatim.
- No filler or AI clichés ("in today's world", "in recent years", "navigating", "delving", "leverage", "unlock"). Absolutely avoid marketing adjectives/fluff ("best-in-class", "world-class", "industry-leading", "cutting-edge", "game-changer", "robust").
- Active voice, average sentence ≤ 22 words.
- No HTML, no schema JSON-LD, no fenced code blocks unless engineering depth.
- Write at least 5 distinct numbered sections or H2 headings.

After the whitepaper output EXACTLY this block (valid JSON, no trailing commas):
---META---
{
  "cover_title": "string",
  "cover_subtitle": "string (between 20 and 160 chars)",
  "meta_description": "150–160 chars summary including primary keyword",
  "slug": "url-slug-from-cover-title",
  "executive_summary": "≤ 600 char distillation of the executive summary",
  "sections": [
    { "number": 1, "title": "Industry Context", "summary": "1–2 sentence summary" }
  ],
  "recommendations": ["string", "string"],
  "references": ["https://...", "https://..."],
  "external_links": ["https://...", "https://..."],
  "internal_links": ["https://... or /path"],
  "semantic_keywords": ["primary phrase", "phrase 2"]
}
- ${ctx.brandVoice ? `Strictly align the style and tone with the Brand Voice: ${ctx.brandVoice}.` : ctx.brief?.tone ? `Match the brand tone above.` : 'Use an analytical, evidence-led, credible tone.'}`;
}
