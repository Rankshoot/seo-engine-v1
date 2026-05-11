/**
 * User-facing copy + writer instructions for Instant Article (AI Web Research).
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
  articleTypeLabel: string;
  companyName: string;
  companyDomain: string;
  niche: string;
  briefBlock: string;
  internalLinksBlock: string;
  researchBlock: string;
};

/**
 * Builds the full Gemini user prompt. Callers append nothing after this except
 * optional model-specific wrappers — the output contract is included here.
 */
export function buildInstantWebResearchArticlePrompt(ctx: InstantWebResearchArticlePromptContext): string {
  const secondary =
    ctx.secondaryKeywordsLine.trim() ||
    "Derive 4–6 relevant secondary keywords from the topic and research; use them naturally.";

  return `Write a high-quality, SEO-optimized, human-written article on the topic:

"${ctx.topic}"

Primary SEO keyword (use in title, intro, headings where natural, and meta description):
"${ctx.primaryKeyword}"

Secondary keywords / phrases (from user or your research):
${secondary}

Target audience:
${ctx.targetAudienceLine}

Audience geography / market context: ${ctx.targetRegionName}
Article language: ${ctx.languageLabel}

Company grounding (voice and credibility — do not turn the piece into a sales brochure):
- Company: ${ctx.companyName} (${ctx.companyDomain})
- Niche: ${ctx.niche}
${ctx.briefBlock}

Goal:
Create a more valuable, polished, and authoritative article than a generic blog post. The article should educate the reader, provide practical insights, and explain the topic clearly with real-world relevance.

Tone and style:
${ctx.writingStyleLabel}. Professional, engaging, informative, and easy to read. Avoid fluff, repetition, and generic statements. Write in a natural human tone with smooth transitions and clear explanations.

Article length:
1,800–2,000 words unless the topic clearly needs a shorter or longer treatment. Stay within a tight, purposeful structure.

Article structure (use clear Markdown headings):

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

5. Practical Recommendations
Include actionable advice the reader can apply immediately (use a ## heading).

6. Key Takeaways
Add a short bullet-point summary of the most important points (use a ## heading).

7. FAQ section
Before the conclusion, include "## Frequently Asked Questions" with 7–10 questions as ### Question headings and concise answer-first answers (≤50 words each). Seed questions from the LIVE RESEARCH CONTEXT when possible.

8. Conclusion
End with a strong closing paragraph that reinforces the main message and gives the reader a clear final insight.

SEO requirements:
- Use one primary keyword: "${ctx.primaryKeyword}"
- Include 4–6 relevant secondary keywords (from the list above or from research).
- Use keywords naturally without keyword stuffing.
- Write SEO-friendly headings.
- Keep paragraphs short and readable.

Quality requirements:
- Make the article better than a standard AI-generated blog.
- Avoid vague claims.
- Include specific examples where useful.
- Explain complex ideas simply.
- Keep the article original, credible, and well-structured.
- Do not repeat the same points in multiple sections.
- Add depth, practical value, and expert-level insight.

Research and citations:
${ctx.researchBlock}

Use Google Search (you have the tool enabled) to verify facts and to cite credible, specific URLs (reports, articles, official pages). Prefer authoritative sources. Include statistics or references where they strengthen claims. Add a "## References" section at the end if you used distinct sources (list title + link).

Linking (required for our editor):
${ctx.internalLinksBlock}
- External: at least 5 credible external links total in the article body, as Markdown [anchor](https://...). Link to real pages you can verify — not competitor blogs, forums, or thin affiliate pages unless they are the primary authoritative source.
- Internal: use at least 2 links from the INTERNAL LINKING pool above, with exact URLs. If the pool is empty, skip internal links and mention none.

Images:
- Do NOT add image markdown, placeholders, or IMAGE_PLACEHOLDER.

OUTPUT FORMAT — your entire reply must be ONLY:
1) The full Markdown article beginning with a single line: # [Title]
2) Then EXACTLY this block at the end (no text after it, valid JSON):
---META---
{"meta_description":"150–160 chars, must include primary keyword","slug":"url-slug-from-title","external_links":["https://..."],"internal_links":["https://... or /path"]}

ARTICLE TYPE MODE: ${ctx.articleTypeLabel}
If the type is "AI Recommended", choose the best format for the topic. Otherwise, shape sections to match the selected type while keeping all requirements above.
`;
}
