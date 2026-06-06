import type { BusinessContextForIntent, KeywordIntentClassifyRow } from "../gemini";

export function buildKeywordIntentPrompt(
  ctx: BusinessContextForIntent,
  rows: KeywordIntentClassifyRow[]
): string {
  const lines = rows.map(
    (r, i) => `${i + 1}. id=${r.id} | keyword="${String(r.keyword).replace(/"/g, '\\"')}"`
  );

  return `You are an SEO analyst. For each keyword below, assign EXACTLY ONE primary search intent for how ${ctx.company || 'this business'} (${ctx.domain}) should think about the query in their industry — not a generic dictionary guess.

BUSINESS CONTEXT
- Company: ${ctx.company || 'Unknown'}
- Domain: ${ctx.domain || 'Unknown'}
- Industry / niche: ${ctx.niche || 'Unknown'}
- Target audience: ${ctx.targetAudience || 'Unknown'}
- Region: ${ctx.targetRegion || 'Unknown'}
${ctx.briefContext ? `\nSITE / OFFERING CONTEXT (from scraped brief — use to interpret services and jargon):\n${ctx.briefContext}\n` : ''}

INTENT LABELS (pick one per keyword)
- informational: learning, definitions, how/what/why, early research; not actively choosing a vendor.
- commercial: comparing providers/services/solutions, "best", "top", "vs", reviews, or category shopping where the user is evaluating options before buying or hiring.
- transactional: ready to act now — purchase, sign up, pricing, demo, quote, apply, download a gated asset tied to conversion, or hire immediately.
- navigational: trying to reach a specific brand, product name, or web destination (including obvious brand + "login" / "portal").

Rules:
- Interpret each keyword in light of THIS company's niche. A broad term may be commercial for a B2B service provider even if it looks informational in isolation.
- If a query is ambiguous, prefer informational over commercial.

FUNNEL STAGE (one per keyword, must align with intent + phrasing)
- TOFU: early research — how/what/why, broad education, awareness, definitions, ideas, tips; user is not comparing vendors yet.
- MOFU: evaluation — best/top/vs/reviews/alternatives/compare, shortlists, "which X", category shopping before a final decision.
- BOFU: ready to convert or navigate — buy/pricing/demo/signup/download/hire/apply, transactional or clear brand/site navigation.

- Return JSON ONLY: one array. Each element: {"id":"<exact uuid from input>","intent":"informational"|"commercial"|"navigational"|"transactional","funnel_stage":"TOFU"|"MOFU"|"BOFU"}.
- Same number of elements as input, same order as listed.

KEYWORDS:
${lines.join('\n')}
`;
}
