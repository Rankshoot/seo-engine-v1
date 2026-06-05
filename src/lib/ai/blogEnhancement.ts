import { geminiGenerate } from "@/lib/gemini";

export interface SeoIssue {
  key: string;
  label: string;
  hint: string;
}

export interface DeepAnalysisResult {
  priorityFixes?: string[];
  missingTopics?: string[];
  competitorAdvantages?: string[];
  recommendedAdditions?: string[];
  sectionGaps?: string[];
  faqSuggestions?: string[];
  tableSuggestions?: string[];
  eeatSuggestions?: string[];
  linkingSuggestions?: string[];
}

export interface BlogEnhancementInput {
  title: string;
  metaDescription: string;
  contentMarkdown: string;
  targetKeyword: string;
  deepAnalysisResult: DeepAnalysisResult | null | undefined;
  seoIssues: SeoIssue[];
}

export interface BlogEnhancementResult {
  enhancedTitle: string;
  enhancedMetaDescription: string;
  enhancedContentMarkdown: string;
  appliedFixes: string[];
  unresolvedIssues: string[];
  improvementSummary: string;
}

/**
 * Type-guard to validate BlogEnhancementInput at runtime.
 */
export function isBlogEnhancementInput(obj: unknown): obj is BlogEnhancementInput {
  if (typeof obj !== 'object' || obj === null) return false;
  const c = obj as Record<string, unknown>;
  return (
    typeof c.title === 'string' &&
    typeof c.metaDescription === 'string' &&
    typeof c.contentMarkdown === 'string' &&
    typeof c.targetKeyword === 'string' &&
    (c.deepAnalysisResult === undefined || c.deepAnalysisResult === null || typeof c.deepAnalysisResult === 'object') &&
    (c.seoIssues === undefined || c.seoIssues === null || Array.isArray(c.seoIssues))
  );
}

// Frozen immutable object representing prompt sections (SonarQube compliance)
const BLOG_ENHANCEMENT_PROMPT_TEMPLATE = Object.freeze({
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
  if (!isBlogEnhancementInput(input)) {
    console.error("Invalid BlogEnhancementInput passed to buildBlogEnhancementPrompt:", input);
    throw new TypeError("Invalid input format for blog enhancement. See logs for details.");
  }

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

/**
 * Robust JSON extraction utility. Attempts to match JSON markdown code fences
 * or locate the largest matching brace structure in a raw text payload.
 */
export function extractAndParseJson<T>(rawText: string): T {
  const cleaned = rawText.trim();
  
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Ignore and try extractors
  }

  const markdownJsonRegex = /```json\s*([\s\S]*?)\s*```/i;
  const match = rawText.match(markdownJsonRegex);
  if (match && match[1]) {
    try {
      return JSON.parse(match[1].trim()) as T;
    } catch {
      // Ignore
    }
  }

  const startIdx = rawText.indexOf('{');
  const endIdx = rawText.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const jsonCandidate = rawText.slice(startIdx, endIdx + 1);
    try {
      return JSON.parse(jsonCandidate) as T;
    } catch {
      // Ignore
    }
  }

  throw new Error("No parseable JSON structure could be extracted from the raw response.");
}

/**
 * Structural validation helper for BlogEnhancementResult schemas.
 */
export function isValidEnhancementResult(result: unknown, inputLength: number): boolean {
  if (!result || typeof result !== 'object') return false;
  
  const r = result as Record<string, unknown>;
  const title = r.enhancedTitle;
  const meta = r.enhancedMetaDescription;
  const content = r.enhancedContentMarkdown;

  if (typeof title !== 'string' || !title.trim()) return false;
  if (typeof meta !== 'string') return false;
  if (typeof content !== 'string' || !content.trim()) return false;

  // If the content is unexpectedly short (truncated response), treat it as invalid.
  if (content.length < Math.min(100, inputLength * 0.2)) return false;

  return true;
}

/**
 * Recovery fallback pipeline for blog enhancement generation.
 */
function createFallbackResult(input: BlogEnhancementInput, reason: string): BlogEnhancementResult {
  return {
    enhancedTitle: input.title,
    enhancedMetaDescription: input.metaDescription,
    enhancedContentMarkdown: input.contentMarkdown,
    appliedFixes: [],
    unresolvedIssues: [`AI enhancement fallback triggered. Reason: ${reason}`],
    improvementSummary: "No changes applied. The optimization pipeline encountered a parsing issue and fell back to the original content."
  };
}

export async function enhanceBlogFromDeepAnalysis(
  input: BlogEnhancementInput
): Promise<BlogEnhancementResult> {
  if (!isBlogEnhancementInput(input)) {
    console.error("Invalid BlogEnhancementInput passed to enhanceBlogFromDeepAnalysis:", input);
    throw new TypeError("Invalid input format for blog enhancement. See logs for details.");
  }

  let responseText = "";
  try {
    const prompt = buildBlogEnhancementPrompt(input);
    responseText = await geminiGenerate(prompt, 3, false, "application/json");
  } catch (apiError) {
    console.error(
      "[blog-enhancement] API generate call failed or promise rejected:",
      apiError,
      "Input context:",
      JSON.stringify({
        title: input.title,
        targetKeyword: input.targetKeyword,
        seoIssuesCount: input.seoIssues?.length ?? 0
      })
    );
    return createFallbackResult(input, `Gemini API call failed: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
  }

  try {
    const parsed = extractAndParseJson<unknown>(responseText);
    
    if (isValidEnhancementResult(parsed, input.contentMarkdown.length)) {
      const resultObj = parsed as Record<string, unknown>;
      return {
        enhancedTitle: String(resultObj.enhancedTitle).trim(),
        enhancedMetaDescription: String(resultObj.enhancedMetaDescription).trim(),
        enhancedContentMarkdown: String(resultObj.enhancedContentMarkdown).trim(),
        appliedFixes: Array.isArray(resultObj.appliedFixes) ? (resultObj.appliedFixes as string[]) : [],
        unresolvedIssues: Array.isArray(resultObj.unresolvedIssues) ? (resultObj.unresolvedIssues as string[]) : [],
        improvementSummary: typeof resultObj.improvementSummary === 'string' ? resultObj.improvementSummary : "Successfully enhanced content using AI recommendations.",
      };
    } else {
      console.warn(
        "[blog-enhancement] AI response parsed but failed structural validation criteria.",
        "Parsed object:",
        parsed
      );
      return createFallbackResult(input, "AI response failed structural validation (invalid schema structure or truncated content).");
    }
  } catch (parseError) {
    console.error(
      "[blog-enhancement] Failed to parse AI response JSON.",
      "Parse error:",
      parseError,
      "Raw response:",
      responseText
    );
    return createFallbackResult(input, `Failed to parse AI JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
  }
}
