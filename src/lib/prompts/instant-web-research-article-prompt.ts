/**
 * User-facing copy + writer instructions for Instant Article (AI Web Research + optional custom sources).
 * Server code merges project brief, Serper research, and internal-link pools on top of this.
 */

export type InstantWebResearchArticlePromptContext = {
  topic: string;
  primaryKeyword: string;
  secondaryKeywordsLine: string;
  targetAudienceLine: string;
  targetRegionName: string;
  languageLabel: string;
  writingStyleLabel: string;
  /** Stable id from the UI (e.g. `howto`, `news`). */
  articleTypeId: string;
  articleTypeLabel: string;
  companyName: string;
  companyDomain: string;
  niche: string;
  briefBlock: string;
  internalLinksBlock: string;
  researchBlock: string;
  /** Full markdown block from user uploads + links, or empty string. */
  customSourcesBlock: string;
  researchMethod: 'web' | 'custom';
};

/**
 * Type-guard to validate InstantWebResearchArticlePromptContext objects at runtime.
 */
export function isInstantWebResearchArticlePromptContext(
  obj: unknown
): obj is InstantWebResearchArticlePromptContext {
  if (typeof obj !== 'object' || obj === null) return false;
  const c = obj as Record<string, unknown>;
  return (
    typeof c.topic === 'string' &&
    typeof c.primaryKeyword === 'string' &&
    typeof c.secondaryKeywordsLine === 'string' &&
    typeof c.targetAudienceLine === 'string' &&
    typeof c.targetRegionName === 'string' &&
    typeof c.languageLabel === 'string' &&
    typeof c.writingStyleLabel === 'string' &&
    typeof c.articleTypeId === 'string' &&
    typeof c.articleTypeLabel === 'string' &&
    typeof c.companyName === 'string' &&
    typeof c.companyDomain === 'string' &&
    typeof c.niche === 'string' &&
    typeof c.briefBlock === 'string' &&
    typeof c.internalLinksBlock === 'string' &&
    typeof c.researchBlock === 'string' &&
    typeof c.customSourcesBlock === 'string' &&
    (c.researchMethod === 'web' || c.researchMethod === 'custom')
  );
}

// Immutable format instructions to prevent code duplication (SonarQube compliance)
const FORMAT_INSTRUCTIONS: Record<string, string> = {
  ai_recommended: `You choose the single best format for this topic and primary keyword (news vs guide vs comparison vs glossary, etc.). Pick one coherent shape and execute it fully.`,
  news: `Write as a timely news or news-analysis piece (not evergreen filler).
- Lead with the most newsworthy fact in the first ~80 words; use a journalistic inverted-pyramid structure.
- Use ## sections such as "What happened", "Who is affected", "What happens next", "Expert context" as appropriate.
- Attribute claims to named sources; prefer primary sources, regulators, company announcements, or reporting from established outlets (cite with links).
- Avoid sounding like a generic marketing blog; keep a factual, editorial tone aligned with News.`,
  blog: `Write as a thoughtful editorial blog: strong point of view, narrative flow, and relatable examples.
- Use a conversational but credible voice; vary sentence length; include one clear thesis the reader remembers.
- Structure with ## sections that feel like chapters in a story (still scannable with ### where needed).
- It is fine to be opinionated when backed by evidence; do not invent personal anecdotes.`,
  howto: `Write as a practical how-to or tutorial.
- Start with prerequisites, tools, or assumptions; then numbered steps or ordered ## phases the reader can follow.
- Include troubleshooting or "if this happens" notes where useful; use ### for substeps.
- Prefer imperative verbs ("Click…", "Open…", "Verify…"); one main action per step.
- Close with a short checklist or recap of the full procedure.`,
  listicle: `Write as a high-signal listicle (not clickbait).
- Use a clear numbered list in the H2/H3 structure (e.g. "## 1. …" through "## N. …" or a single "## Key ideas" with ### numbered items).
- Each item: bold takeaway line, 2–4 sentences of depth, and a concrete example or tip.
- Order items by reader impact (most valuable first unless a chronological order is clearer).`,
  comparison: `Write as a comparison or "vs" article.
- Early on, name what is being compared and the decision the reader is trying to make.
- Use ## sections such as "Overview", "Feature comparison", "Pricing and value", "Pros and cons", "Which should you choose?".
- Include a Markdown comparison table when it clarifies dimensions (limits, integrations, pricing models, etc.).
- Be fair and specific; avoid straw-manning; cite sources for factual claims.`,
  technical: `Write as a technical deep-dive for practitioners.
- Define terms precisely; cover architecture, constraints, trade-offs, edge cases, and failure modes.
- Use ## / ### for logical modules (spec-style); include fenced code blocks only when real syntax helps (config, CLI, pseudocode).
- Avoid hand-wavy buzzwords; prefer accurate vocabulary and measurable statements, with citations.`,
  product_review: `Write as a balanced product or solution review.
- Use ## sections such as "Overview", "What we tested", "Key features", "Pros", "Cons", "Verdict", "Who it is for / not for".
- Be explicit about evaluation criteria; separate facts (from docs or reputable sources) from interpretation.
- If you lack hands-on data, write as an "analysis" piece and be transparent; do not fake benchmarks.`,
  glossary: `Write as a glossary or definitions hub centered on the topic.
- Open with a short answer-first overview of why these terms matter together.
- For each important term, use ### Term name as heading, then a crisp definition, 1–2 sentences of context, and optional "Related terms" cross-links in prose.
- Optimize for clarity and snippet-style answers in each section.`,
};

function articleFormatContract(articleTypeId: string, articleTypeLabel: string): string {
  const common =
    'Follow the OUTPUT FORMAT and SEO rules later in this prompt. The selected format overrides generic "blog" pacing when they conflict.';
  const instruction =
    FORMAT_INSTRUCTIONS[articleTypeId] ||
    `Shape the article to match the label above while satisfying all global requirements.`;

  return `SELECTED ARTICLE FORMAT: ${articleTypeLabel} (${articleTypeId})\n${instruction}\n${common}`;
}

// Frozen immutable object representing prompt sections (SonarQube compliance)
const ARTICLE_PROMPT_TEMPLATE = Object.freeze({
  intro: `Write a high-quality, SEO-optimized, human-written article on the topic:`,
  goal: `Goal:
Create a more valuable, polished, and authoritative article than a generic blog post. The article should educate the reader, provide practical insights, and explain the topic clearly with real-world relevance.`,
  toneAndStyle: `Tone and style:
{writingStyleLabel}. Professional, engaging, informative, and easy to read. Avoid fluff, repetition, and generic statements. Write in a natural human tone with smooth transitions and clear explanations.`,
  length: `Article length:
1,800–2,000 words unless the topic clearly needs a shorter or longer treatment. Stay within a tight, purposeful structure.`,
  structure: `Article structure (use clear Markdown headings):

1. Compelling Title
Create a strong, SEO-friendly H1 as the first line of output (see OUTPUT FORMAT below).

2. Meta Description
You will also supply a 150–160 character meta description in the ---META--- block that encourages clicks and includes the primary keyword.

3. Introduction
Start with a strong opening that explains why the topic matters now. Clearly introduce the main idea and what the reader will learn. Put a direct, answer-first summary in the first ~80 words after the H1 (helpful for AI Overviews).

4. Main Body
Break the article into clear, logical sections with ## and ### headings. Cover:
- What the topic means
- Why it matters
- Key challenges or pain points
- Main benefits or opportunities
- Practical examples or use cases
- Best practices or strategies
- Common mistakes to avoid
- Future trends or outlook, if relevant
(Adapt depth and ordering to the SELECTED ARTICLE FORMAT above.)

5. Practical Recommendations
Include actionable advice the reader can apply immediately (use a ## heading).

6. Key Takeaways
Add a short bullet-point summary of the most important points (use a ## heading).

7. FAQ section
Before the conclusion, include "## Frequently Asked Questions" with 7–10 questions as ### Question headings and concise answer-first answers (≤50 words each). Seed questions from the LIVE RESEARCH CONTEXT when possible.

8. Conclusion
End with a strong closing paragraph that reinforces the main message and gives the reader a clear final insight.`,
  seo: `SEO requirements:
- Use one primary keyword: "{primaryKeyword}"
- Include 4–6 relevant secondary keywords (from the list above or from research).
- Use keywords naturally without keyword stuffing.
- Write SEO-friendly headings.
- Keep paragraphs short and readable.`,
  quality: `Quality requirements:
- Make the article better than a standard AI-generated blog.
- Avoid vague claims.
- Include specific examples where useful.
- Explain complex ideas simply.
- Keep the article original, credible, and well-structured.
- Do not repeat the same points in multiple sections.
- Add depth, practical value, and expert-level insight.`,
  linking: `Linking (required for our editor):
{internalLinksBlock}
- External: at least 5 credible external links total in the article body, as Markdown [anchor](https://...). Link to real pages you can verify — not competitor blogs, forums, or thin affiliate pages unless they are the primary authoritative source.
- Internal: use at least 2 links from the INTERNAL LINKING pool above, with exact URLs. If the pool is empty, skip internal links and mention none.`,
  outputFormat: `OUTPUT FORMAT — your entire reply must be ONLY:
1) The full Markdown article beginning with a single line: # [Title]
2) Then EXACTLY this block at the end (no text after it, valid JSON):
---META---
{"meta_description":"150–160 chars, must include primary keyword","slug":"url-slug-from-title","external_links":["https://..."],"internal_links":["https://... or /path"]}`
});

/**
 * Builds the full Gemini user prompt. Callers append nothing after this except
 * optional model-specific wrappers — the output contract is included here.
 */
export function buildInstantWebResearchArticlePrompt(ctx: InstantWebResearchArticlePromptContext): string {
  if (!isInstantWebResearchArticlePromptContext(ctx)) {
    console.error("Invalid InstantWebResearchArticlePromptContext passed to buildInstantWebResearchArticlePrompt:", ctx);
    throw new TypeError("Invalid prompt context configuration. See diagnostic logs for details.");
  }

  const secondary =
    ctx.secondaryKeywordsLine.trim() ||
    'Derive 4–6 relevant secondary keywords from the topic and research; use them naturally.';

  const formatBlock = articleFormatContract(ctx.articleTypeId, ctx.articleTypeLabel);

  const customBlock =
    ctx.customSourcesBlock.trim().length > 0
      ? `${ctx.customSourcesBlock.trim()}\n\n`
      : '';

  const researchIntro =
    ctx.researchMethod === 'custom' && ctx.customSourcesBlock.trim().length > 0
      ? `SUPPLEMENTARY LIVE RESEARCH (SERP / news / video snippets — use for angles, FAQ seeds, and extra credible external links. For facts about the user’s own products, policies, or proprietary claims, the USER-PROVIDED REFERENCE MATERIAL above wins on conflicts):\n\n${ctx.researchBlock}`
      : ctx.researchBlock;

  return [
    `${ARTICLE_PROMPT_TEMPLATE.intro}\n\n"${ctx.topic}"`,
    `Primary SEO keyword (use in title, intro, headings where natural, and meta description):\n"${ctx.primaryKeyword}"`,
    `Secondary keywords / phrases (from user or your research):\n${secondary}`,
    `Target audience:\n${ctx.targetAudienceLine}`,
    `Audience geography / market context: ${ctx.targetRegionName}\nArticle language: ${ctx.languageLabel}`,
    `Company grounding (voice and credibility — do not turn the piece into a sales brochure):\n- Company: ${ctx.companyName} (${ctx.companyDomain})\n- Niche: ${ctx.niche}\n${ctx.briefBlock}`,
    formatBlock,
    ARTICLE_PROMPT_TEMPLATE.goal,
    ARTICLE_PROMPT_TEMPLATE.toneAndStyle.replace('{writingStyleLabel}', ctx.writingStyleLabel),
    ARTICLE_PROMPT_TEMPLATE.length,
    ARTICLE_PROMPT_TEMPLATE.structure,
    ARTICLE_PROMPT_TEMPLATE.seo.replace('{primaryKeyword}', ctx.primaryKeyword),
    ARTICLE_PROMPT_TEMPLATE.quality,
    customBlock + `Research and citations:\n${researchIntro}\n\nUse Google Search (you have the tool enabled) to verify facts and to cite credible, specific URLs (reports, articles, official pages). Prefer authoritative sources. Include statistics or references where they strengthen claims. Add a "## References" section at the end if you used distinct sources (list title + link).`,
    ARTICLE_PROMPT_TEMPLATE.linking.replace('{internalLinksBlock}', ctx.internalLinksBlock),
    `Images:\n- Do NOT add image markdown, placeholders, or IMAGE_PLACEHOLDER.`,
    ARTICLE_PROMPT_TEMPLATE.outputFormat
  ].join('\n\n');
}
