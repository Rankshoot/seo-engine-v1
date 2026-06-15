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
  brandVoice?: string;
  brandValues?: string;
  brandDescription?: string;
}

/**
 * Type-guard to validate LinkedInPromptContext objects at runtime.
 */
export function isLinkedInPromptContext(obj: unknown): obj is LinkedInPromptContext {
  if (typeof obj !== 'object' || obj === null) return false;
  const c = obj as Record<string, unknown>;
  return (
    typeof c.topic === 'string' &&
    typeof c.postStyle === 'string' &&
    typeof c.audience === 'string' &&
    typeof c.tone === 'string' &&
    typeof c.primaryKeyword === 'string' &&
    typeof c.ctaObjective === 'string' &&
    (c.voicePerspective === 'first_person' || c.voicePerspective === 'company') &&
    typeof c.regionLabel === 'string' &&
    typeof c.languageLabel === 'string' &&
    typeof c.companyName === 'string' &&
    typeof c.companyDomain === 'string' &&
    typeof c.niche === 'string'
  );
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

// Frozen immutable object representing prompt sections (SonarQube compliance)
const LINKEDIN_PROMPT_TEMPLATE = Object.freeze({
  intro: `You are a senior LinkedIn ghostwriter who has shipped 1,000+ posts that pulled real engagement (>2% engagement rate) WITHOUT clickbait. Write ONE post.`,
  platformRules: `PLATFORM RULES — non-negotiable:
- Total length: 950–1,300 characters (LinkedIn collapses at 1,300; the hook + first line must be magnetic).
- First line is the HOOK — must work standalone above the fold. ≤ 12 words. No "In today's world", no "I'm excited to share".
- Use 1–2 sentences per paragraph. Generous whitespace. No walls of text.
- Use minimal emojis (at most 3 emojis total across the entire post, and never use them decoratively).
- Do NOT spam hashtags. End with 3–5 targeted hashtags only, on the last line. Format hashtags strictly as #camelCase or #lowercase without special characters or emojis.
- No "👇" / "DM me" / "P.S." cliché endings. You MUST close the post (either the final line of the body or the CTA block) with a direct, engaging question (ending with "?") or a clear CTA.
- No links inside the body (LinkedIn deprioritizes them). The CTA can mention "link in profile" if appropriate.
- Avoid generic AI phrasing ("delve", "leverage", "unlock", "navigating", "in today's fast-paced", "game-changer", "synergy", "robust").
- Ensure personal voice is clear: you MUST use first-person/collective pronouns (I, we, my, our, us, I'm) at least twice in the post.
- Active voice, plain words. Specific > vague every time.`,
  outputContract: `OUTPUT CONTRACT — produce exactly this Markdown shape, then the ---META--- block:`
});

export function buildLinkedInPostPrompt(ctx: LinkedInPromptContext): string {
  if (!isLinkedInPromptContext(ctx)) {
    console.error("Invalid LinkedInPromptContext passed to buildLinkedInPostPrompt:", ctx);
    throw new TypeError("Invalid prompt context configuration. See diagnostic logs for details.");
  }

  const brandPersonaBlock = (ctx.brandVoice || ctx.brandValues || ctx.brandDescription)
    ? `\nBRAND PERSONA & IDENTITY:\n${
        ctx.brandVoice ? `- Brand Voice/Tone: ${ctx.brandVoice}\n` : ''
      }${
        ctx.brandValues ? `- Core Values/Messaging: ${ctx.brandValues}\n` : ''
      }${
        ctx.brandDescription ? `- Personality/Description: ${ctx.brandDescription}\n` : ''
      }`
    : '';

  const briefBlock = ctx.brief
    ? `BRAND CONTEXT (use for voice, do NOT pitch):
- Company: ${ctx.companyName} (${ctx.companyDomain})
- Niche: ${ctx.niche}
- USPs: ${ctx.brief.usps.slice(0, 3).join(' | ') || '(none)'}
- Audience: ${ctx.brief.audiences.slice(0, 3).join(' | ') || ctx.audience}
- Tone bias: ${ctx.brief.tone || ctx.tone}
${brandPersonaBlock}`
    : `BRAND CONTEXT:\n- Company: ${ctx.companyName} (${ctx.companyDomain})\n- Niche: ${ctx.niche}\n${brandPersonaBlock}`;

  const voiceBlock =
    ctx.voicePerspective === 'first_person'
      ? `Write in first person as the ${ctx.authorRole || 'founder'} of ${ctx.companyName}. Use "I" / "we". Sound like a real human posting from their phone. ${ctx.brandVoice ? `Align the personality with the brand voice: ${ctx.brandVoice}` : ''}`
      : `Write as the ${ctx.companyName} brand voice. Use "we" sparingly. Stay human, not corporate. ${ctx.brandVoice ? `Align the personality and tone with: ${ctx.brandVoice}` : ''}`;

  return [
    LINKEDIN_PROMPT_TEMPLATE.intro,
    LINKEDIN_PROMPT_TEMPLATE.platformRules,
    `POST STYLE: ${ctx.postStyle.toUpperCase()} — ${STYLE_GUIDE[ctx.postStyle]}`,
    `TOPIC: ${ctx.topic}\nPRIMARY KEYWORD (must appear naturally somewhere — not stuffed): "${ctx.primaryKeyword}"\nAUDIENCE: ${ctx.audience}\nTONE: ${ctx.tone}\nCTA OBJECTIVE: ${ctx.ctaObjective}\nREGION: ${ctx.regionLabel} · LANGUAGE: ${ctx.languageLabel}`,
    voiceBlock,
    briefBlock,
    LINKEDIN_PROMPT_TEMPLATE.outputContract,
    `# [LinkedIn — ${ctx.postStyle}] ${ctx.companyName}

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
  "meta_description": "≤ 160 char description used inside Rankshoot history list",
  "slug": "short-url-slug-from-the-hook"
}`
  ].join('\n\n');
}
