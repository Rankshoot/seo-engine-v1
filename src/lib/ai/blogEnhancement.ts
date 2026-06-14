import { geminiGenerate } from "@/lib/gemini";
import { z } from "zod";
import { parseLooseJson } from "@/services/ai/providers";
import { buildBlogEnhancementPrompt } from "@/lib/prompts/blog-enhancement-prompt";

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

export const blogEnhancementResultSchema = z.object({
  enhancedTitle: z.string().min(1),
  enhancedMetaDescription: z.string(),
  enhancedContentMarkdown: z.string().min(1),
  appliedFixes: z.array(z.string()).default([]),
  unresolvedIssues: z.array(z.string()).default([]),
  improvementSummary: z.string().default("Successfully enhanced content using AI recommendations."),
});

/**
 * Robust JSON extraction utility. Attempts to match JSON markdown code fences
 * or locate the largest matching brace structure in a raw text payload.
 */
export function extractAndParseJson<T>(rawText: string): T {
  const result = parseLooseJson<T>(rawText);
  if (result !== null) {
    return result;
  }
  throw new Error("No parseable JSON structure could be extracted from the raw response.");
}

/**
 * Structural validation helper for BlogEnhancementResult schemas.
 */
export function isValidEnhancementResult(result: unknown, inputLength: number): boolean {
  const parsed = blogEnhancementResultSchema.safeParse(result);
  if (!parsed.success) return false;
  
  const content = parsed.data.enhancedContentMarkdown;
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
    responseText = await geminiGenerate(prompt, 3, false, "application/json", null, null, undefined, 180_000);
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
    const validation = blogEnhancementResultSchema.safeParse(parsed);
    
    if (validation.success && validation.data.enhancedContentMarkdown.length >= Math.min(100, input.contentMarkdown.length * 0.2)) {
      return validation.data;
    } else {
      console.warn(
        "[blog-enhancement] AI response parsed but failed structural validation criteria.",
        "Parsed object:",
        parsed,
        "Validation errors:",
        !validation.success ? validation.error.format() : "Content too short"
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
