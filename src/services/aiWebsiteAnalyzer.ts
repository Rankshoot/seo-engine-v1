import { geminiGenerate } from '@/lib/gemini';

export interface AIAnalysisResult {
  industry: string;
  niche: string;
  targetAudience: string;
  primaryKeywords: string[];
  longTailKeywords: string[];
  faqs: Array<{ question: string; answer: string }>;
}

export async function analyzeWebsiteWithAI(
  title: string,
  metaDescription: string,
  content: string
): Promise<AIAnalysisResult> {
  const prompt = `
You are an expert SEO and Business Analyst. I will provide you with the title, meta description, and the main text content of a website.
Your task is to analyze this content and return a structured JSON response containing the following fields:

1. "industry": The broad industry this website operates in (e.g., "Software", "Healthcare", "E-commerce").
2. "niche": The specific niche within the industry (e.g., "B2B SaaS HR Software", "Telehealth for Seniors").
3. "targetAudience": A short description of the ideal customer or target audience.
4. "primaryKeywords": An array of 3 to 5 highly relevant primary SEO keywords.
5. "longTailKeywords": An array of 3 to 5 highly relevant long-tail SEO keywords.
6. "faqs": An array of 2 to 4 Frequently Asked Questions (and their answers) that are either explicitly answered in the text or highly relevant to the core offering.

Here is the website data:
---
Title: ${title}
Meta Description: ${metaDescription}
---
Content Summary:
${content}
---

Return ONLY valid JSON matching this structure. Do not wrap in markdown blocks like \`\`\`json.
{
  "industry": "string",
  "niche": "string",
  "targetAudience": "string",
  "primaryKeywords": ["string"],
  "longTailKeywords": ["string"],
  "faqs": [{"question": "string", "answer": "string"}]
}
  `.trim();

  try {
    const rawRes = await geminiGenerate(prompt, 3);
    // Strip markdown formatting if Gemini accidentally adds it
    const jsonStr = rawRes.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr) as AIAnalysisResult;
  } catch (error) {
    console.error('[aiWebsiteAnalyzer] Failed to parse AI response:', error);
    return {
      industry: 'Unknown',
      niche: 'Unknown',
      targetAudience: 'Unknown',
      primaryKeywords: [],
      longTailKeywords: [],
      faqs: [],
    };
  }
}
