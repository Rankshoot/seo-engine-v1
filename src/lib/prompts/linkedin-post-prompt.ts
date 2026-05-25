/**
 * LinkedIn post prompt — feed-native, hook-first, founder-grade.
 * Targets Gemini 2.5 Pro (deep prompts) for depth without losing brevity.
 */

import type { BusinessBrief } from '@/lib/business-brief';
import type { LinkedInPostStyle } from '@/lib/types';

export interface LinkedInPromptContext {
  topic: string;
  postStyle: LinkedInPostStyle;
  audience: string;
  tone: string;
  primaryKeyword: string;
  ctaObjective: string;
  /** "first_person" feels like a founder writing; "company" feels like the brand. */
  voicePerspective: 'first_person' | 'company';
  authorRole?: string;
  regionLabel: string;
  languageLabel: string;
  companyName: string;
  companyDomain: string;
  niche: string;
  brief: BusinessBrief | null;
}

const STYLE_GUIDE: Record<LinkedInPostStyle, string> = {
  educational:
    'Educational explainer. Lead with a counter-intuitive insight, deliver one frame the reader can use today, and close with a sharp question.',
  founder:
    'Founder story. Lead with a real, specific moment ("Two years ago, …"). Show the lesson, not just the win. Avoid humble-brags.',
  industry_insight:
    'Industry insight. Lead with a fresh data point or pattern. Explain what most people miss. End with a prediction or question.',
  storytelling:
    'Story arc. Three short scenes: setup, tension, resolution. The lesson is implicit. Make the reader feel something.',
  list:
    'List post. Promise a tight list of 5–8 items. Each item = one line, plus an optional micro-explanation. End with a meta lesson.',
  carousel:
    'Carousel-style text post. Plan 6–9 slide-sized chunks separated by blank lines. Each chunk = one heading + 1–2 lines, suitable for repurposing into a carousel.',
};

export function buildLinkedInPostPrompt(ctx: LinkedInPromptContext): string {
  const briefBlock = ctx.brief
    ? `BRAND CONTEXT (use for voice, do NOT pitch):
- Company: ${ctx.companyName} (${ctx.companyDomain})
- Niche: ${ctx.niche}
- USPs: ${ctx.brief.usps.slice(0, 3).join(' | ') || '(none)'}
- Audience: ${ctx.brief.audiences.slice(0, 3).join(' | ') || ctx.audience}
- Tone bias: ${ctx.brief.tone || ctx.tone}`
    : `BRAND CONTEXT:\n- Company: ${ctx.companyName} (${ctx.companyDomain})\n- Niche: ${ctx.niche}`;

  const voiceBlock =
    ctx.voicePerspective === 'first_person'
      ? `Write in first person as the ${ctx.authorRole || 'founder'} of ${ctx.companyName}. Use "I" / "we". Sound like a real human posting from their phone.`
      : `Write as the ${ctx.companyName} brand voice. Use "we" sparingly. Stay human, not corporate.`;

  return `You are a senior LinkedIn ghostwriter who has shipped 1,000+ posts that pulled real engagement (>2% engagement rate) WITHOUT clickbait. Write ONE post.

PLATFORM RULES — non-negotiable:
- Total length: 950–1,300 characters (LinkedIn collapses at 1,300; the hook + first line must be magnetic).
- First line is the HOOK — must work standalone above the fold. ≤ 12 words. No "In today's world", no "I'm excited to share".
- Use 1–2 sentences per paragraph. Generous whitespace. No walls of text.
- No emojis (unless the topic genuinely demands one — never decorative).
- Do NOT spam hashtags. End with 3–5 targeted hashtags only, on the last line.
- No "👇" / "DM me" / "P.S." cliché endings. End with a real question, an observation, or a CTA tied to the objective.
- No links inside the body (LinkedIn deprioritizes them). The CTA can mention "link in profile" if appropriate.
- Avoid generic AI phrasing ("delve", "leverage", "unlock", "navigating", "in today's fast-paced", "game-changer", "synergy", "robust").
- Active voice, plain words. Specific > vague every time.

POST STYLE: ${ctx.postStyle.toUpperCase()} — ${STYLE_GUIDE[ctx.postStyle]}
TOPIC: ${ctx.topic}
PRIMARY KEYWORD (must appear naturally somewhere — not stuffed): "${ctx.primaryKeyword}"
AUDIENCE: ${ctx.audience}
TONE: ${ctx.tone}
CTA OBJECTIVE: ${ctx.ctaObjective}
REGION: ${ctx.regionLabel} · LANGUAGE: ${ctx.languageLabel}

${voiceBlock}

${briefBlock}

OUTPUT CONTRACT — produce exactly this Markdown shape, then the ---META--- block:

# [LinkedIn — ${ctx.postStyle}] ${ctx.companyName}

## Hook
[The hook line. ≤ 12 words. Must make a scroller stop.]

## Body
[The body of the post — 6–10 short paragraphs. No labels. No headings inside. This is what the user will copy-paste into LinkedIn.]

## Call to Action
[One short paragraph (≤ 2 sentences) that maps to: ${ctx.ctaObjective}.]

## Hashtags
[3–5 hashtags, space-separated, lowercase camel case, NO emoji.]

After the post, output EXACTLY this block (valid JSON, no trailing commas):
---META---
{
  "post_style": "${ctx.postStyle}",
  "hook": "the hook line",
  "body": "the body block as plain text — newlines preserved as \\n",
  "cta": "the cta block as plain text",
  "hashtags": ["#hashtag1", "#hashtag2"],
  "audience": "${ctx.audience}",
  "tone": "${ctx.tone}",
  "primary_keyword": "${ctx.primaryKeyword}",
  "meta_description": "≤ 160 char description used inside Rankit history list",
  "slug": "short-url-slug-from-the-hook"
}`;
}
