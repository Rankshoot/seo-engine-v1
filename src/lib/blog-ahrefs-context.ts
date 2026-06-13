/**
 * Blog Ahrefs Context.
 * 
 * Fetches Ahrefs keyword data for blog generation based on user's plan.
 * Only makes API calls if the user's plan has the feature enabled.
 */

import {
  ahrefsMatchingTermsAll,
  ahrefsMatchingTermsQuestions,
  type AhrefsKeywordIdea,
} from "./ahrefs";
import {
  canUseBlogHeadingsApi,
  canUseBlogFaqsApi,
} from "./plan-api-access";

export interface BlogSecondaryKeyword {
  keyword: string;
  volume: number;
  difficulty: number | null;
}

export interface BlogFaqKeyword {
  keyword: string;
  volume: number;
  difficulty: number | null;
}

export interface BlogAhrefsContext {
  /** Secondary keywords for blog headings (limit=7) */
  secondaryKeywords: BlogSecondaryKeyword[];
  /** FAQ keywords for blog FAQ section (limit=5) */
  faqKeywords: BlogFaqKeyword[];
  /** Whether the API calls were actually made */
  fromAhrefs: boolean;
}

/**
 * Empty context for when APIs are disabled.
 */
export const EMPTY_BLOG_AHREFS_CONTEXT: BlogAhrefsContext = {
  secondaryKeywords: [],
  faqKeywords: [],
  fromAhrefs: false,
};

/**
 * Fetch blog-specific Ahrefs context for a focus keyword.
 * 
 * This function:
 * 1. Checks if the user's plan allows each API
 * 2. Calls ahrefsMatchingTermsAll with limit=7 if enabled (for headings)
 * 3. Calls ahrefsMatchingTermsQuestions with limit=5 if enabled (for FAQs)
 * 4. Returns formatted context for prompt injection
 * 
 * @param focusKeyword - The primary keyword for the blog
 * @param region - Target region (e.g., 'us', 'uk', 'in')
 * @param userId - The user ID to check plan permissions
 * @returns BlogAhrefsContext with secondary keywords and FAQ keywords
 */
export async function fetchBlogAhrefsContext(
  focusKeyword: string,
  region: string,
  userId: string
): Promise<BlogAhrefsContext> {
  console.log("[blog-ahrefs-context] Fetching context for keyword:", focusKeyword, "region:", region);

  // Check plan permissions
  const [canUseHeadings, canUseFaqs] = await Promise.all([
    canUseBlogHeadingsApi(userId),
    canUseBlogFaqsApi(userId),
  ]);

  console.log("[blog-ahrefs-context] Plan permissions:", {
    headings: canUseHeadings,
    faqs: canUseFaqs,
  });

  // If neither API is enabled, return empty context
  if (!canUseHeadings && !canUseFaqs) {
    console.log("[blog-ahrefs-context] Both APIs disabled for user plan, returning empty context");
    return EMPTY_BLOG_AHREFS_CONTEXT;
  }

  // Prepare parallel API calls
  const promises: Array<Promise<AhrefsKeywordIdea[]> | null> = [
    canUseHeadings
      ? ahrefsMatchingTermsAll(focusKeyword, region, 7, 0)
      : Promise.resolve([]),
    canUseFaqs
      ? ahrefsMatchingTermsQuestions(focusKeyword, region, 5, 0)
      : Promise.resolve([]),
  ];

  // Execute calls
  const [headingsResults, faqsResults] = await Promise.all(promises);

  // Format results
  const secondaryKeywords: BlogSecondaryKeyword[] =
    headingsResults?.map((item) => ({
      keyword: item.keyword,
      volume: item.volume,
      difficulty: item.difficulty,
    })) ?? [];

  const faqKeywords: BlogFaqKeyword[] =
    faqsResults?.map((item) => ({
      keyword: item.keyword,
      volume: item.volume,
      difficulty: item.difficulty,
    })) ?? [];

  console.log("[blog-ahrefs-context] Results:", {
    secondaryKeywords: secondaryKeywords.length,
    faqKeywords: faqKeywords.length,
  });

  return {
    secondaryKeywords,
    faqKeywords,
    fromAhrefs: true,
  };
}

/**
 * Format blog Ahrefs context for prompt injection.
 * 
 * Returns a string that can be inserted into the blog generation prompt
 * to guide the AI on which secondary keywords and FAQs to include.
 */
export function formatBlogAhrefsForPrompt(context: BlogAhrefsContext): string {
  if (!context.fromAhrefs) {
    return "";
  }

  const parts: string[] = [];

  // Secondary keywords for headings
  if (context.secondaryKeywords.length > 0) {
    const keywordsList = context.secondaryKeywords
      .map((k) => `- ${k.keyword} (vol: ${k.volume}${k.difficulty !== null ? `, KD: ${k.difficulty}` : ""})`)
      .join("\n");

    parts.push(`SECONDARY KEYWORDS FOR HEADINGS:
Include these keywords naturally in H2/H3 subheadings where relevant:
${keywordsList}`);
  }

  // FAQ keywords
  if (context.faqKeywords.length > 0) {
    const faqsList = context.faqKeywords
      .map((k) => `- ${k.keyword} (vol: ${k.volume}${k.difficulty !== null ? `, KD: ${k.difficulty}` : ""})`)
      .join("\n");

    parts.push(`FAQ KEYWORDS TO ANSWER:
Include a FAQ section answering these specific questions:
${faqsList}`);
  }

  return parts.join("\n\n");
}
