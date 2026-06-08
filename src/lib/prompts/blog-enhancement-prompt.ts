import type { BlogEnhancementInput } from "../ai/blogEnhancement";

// Frozen immutable object representing prompt sections (SonarQube compliance)
export const BLOG_ENHANCEMENT_PROMPT_TEMPLATE = Object.freeze({
  rules: `You are an expert SEO content optimizer. Your task is to perform an enhancement pass on an existing blog post based on deep SERP analysis and SEO score issues.

CRITICAL RULES:
1. This is an ENHANCEMENT pass, not a full rewrite. Preserve the existing blog's strong structure, flow, tone, and existing high-quality sections. Only add, update, or expand missing or weak parts.
2. Complete truncated sections if any are found (e.g. text cutting off mid-sentence).
3. Add missing topics identified in the Deep Analysis by integrating them naturally into existing sections or adding new H2/H3 sections ONLY where needed.
4. Add missing FAQ questions/answers if FAQ coverage is low or questions are recommended.
5. Improve examples and statistics by integrating concrete, real-world examples/data if the analysis says they are missing or weak.
6. Improve the meta description to contain the target keyword and be between 140-165 characters if it was flagged as poor or missing.
7. Improve target keyword placement (e.g., in title, first 100 words, meta description) if the SEO issues flag them as missing.
8. PRESERVE verified links. Do NOT invent new URLs. Do NOT copy competitor content verbatim.`,
  outputFormat: `OUTPUT FORMAT:
You must respond with a JSON object matching the following TypeScript schema:
{
  "enhancedTitle": "The new optimized title (only change if needed to fix keyword issues or improve clickability)",
  "enhancedMetaDescription": "The new optimized meta description (140-165 characters, containing the target keyword)",
  "enhancedContentMarkdown": "The full blog content markdown, containing the enhancements integrated seamlessly",
  "appliedFixes": ["list of fixes from the priority fixes or SEO issues that you addressed"],
  "unresolvedIssues": ["list of issues that could not be automatically addressed (e.g., requires custom business data)"],
  "improvementSummary": "A brief paragraph summarizing what improvements were made to the article"
}`
});

export function buildBlogEnhancementPrompt(input: BlogEnhancementInput): string {
  const deepAnalysis = input.deepAnalysisResult || {};
  const seoIssues = input.seoIssues || [];

  const inputBlock = `INPUT BLOG DATA:
- Target Keyword: ${input.targetKeyword}
- Current Title: ${input.title}
- Current Meta Description: ${input.metaDescription || "(none)"}
- Current Content Markdown:
${input.contentMarkdown}`;

  const feedbackBlock = `DEEP ANALYSIS FEEDBACK:
- Priority Fixes: ${JSON.stringify(deepAnalysis.priorityFixes || [])}
- Missing Topics: ${JSON.stringify(deepAnalysis.missingTopics || [])}
- Competitor Advantages (Things competitors cover that we don't): ${JSON.stringify(deepAnalysis.competitorAdvantages || [])}
- Recommended Additions: ${JSON.stringify(deepAnalysis.recommendedAdditions || [])}
- Section Gaps: ${JSON.stringify(deepAnalysis.sectionGaps || [])}
- FAQ Suggestions: ${JSON.stringify(deepAnalysis.faqSuggestions || [])}
- Table Suggestions: ${JSON.stringify(deepAnalysis.tableSuggestions || [])}
- E-E-A-T Suggestions: ${JSON.stringify(deepAnalysis.eeatSuggestions || [])}
- Linking Suggestions: ${JSON.stringify(deepAnalysis.linkingSuggestions || [])}`;

  const seoScoreBlock = `SEO SCORE ISSUES (Failing checks):
${seoIssues.map((issue) => `- [${issue.key}] ${issue.label}: ${issue.hint}`).join("\n")}`;

  return [
    BLOG_ENHANCEMENT_PROMPT_TEMPLATE.rules,
    inputBlock,
    feedbackBlock,
    seoScoreBlock,
    BLOG_ENHANCEMENT_PROMPT_TEMPLATE.outputFormat
  ].join("\n\n");
}
