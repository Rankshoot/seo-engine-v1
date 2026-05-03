import { geminiGenerate } from "@/lib/gemini";
import type { AIContext, ContextualAgentOutput, ContextualSuggestion } from "@/features/ai-assistant/types";

export interface CandidateRow {
  id?: string;
  keyword: string;
  source: ContextualSuggestion["source"];
  volume: number;
  kd: number;
  cpc?: number;
  intent: string;
  score: number;
  longTail: boolean;
  lowCompetition: boolean;
}

export function clamp(n: number, min = 0, max = 100): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function funnelStage(intentRaw: string, keyword: string): "TOFU" | "MOFU" | "BOFU" {
  const intent = intentRaw.toLowerCase();
  const k = keyword.toLowerCase();
  if (intent === "transactional" || /\b(buy|price|pricing|cost|demo|trial|download|sign up|signup)\b/.test(k)) {
    return "BOFU";
  }
  if (intent === "commercial" || /\b(best|top|vs|review|alternative|compare|comparison|rating)\b/.test(k)) {
    return "MOFU";
  }
  return "TOFU";
}

export function trafficType(stage: "TOFU" | "MOFU" | "BOFU"): string {
  if (stage === "BOFU") return "high-intent conversion traffic";
  if (stage === "MOFU") return "comparison and consideration traffic";
  return "top-of-funnel informational traffic";
}

export function estimateTraffic(volume: number, rankChance: number, stage: "TOFU" | "MOFU" | "BOFU"): number {
  const ctr = stage === "BOFU" ? 0.12 : stage === "MOFU" ? 0.16 : 0.2;
  return Math.max(0, Math.round(volume * ctr * (rankChance / 100)));
}

export function scoreRow(volume: number, kd: number, intent: string, keyword: string, sourceBoost = 0): number {
  const volumeScore = clamp(Math.log10(volume + 1) * 22);
  const difficultyScore = kd > 0 ? clamp(100 - kd) : 55;
  const stage = funnelStage(intent, keyword);
  const intentScore = stage === "BOFU" ? 90 : stage === "MOFU" ? 82 : 70;
  return clamp(Math.round(volumeScore * 0.35 + difficultyScore * 0.35 + intentScore * 0.2 + sourceBoost * 0.1));
}

// ─── Brand / blog-suitability heuristics ────────────────────────────────────

/** Strip a domain to its bare brand token: "randstad.in" → "randstad". */
export function domainToBrandToken(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(".")[0]
    .trim();
}

export interface BrandFitResult {
  /** True when the keyword is a sensible blog topic for the project owner. */
  suitable: boolean;
  /** Down-weighting factor applied to the score: 1 = full, 0.1 = severely penalised. */
  penaltyFactor: number;
  /** Human-readable reason exposed to the LLM and the user. */
  reason: string;
  /** Categorical tag for filtering / display. */
  category:
    | "ok"
    | "own_brand_navigational"
    | "competitor_brand"
    | "navigational_intent"
    | "company_lookup";
}

/**
 * Decide whether a keyword is a good blog target for *this* project.
 *
 * Why this exists: raw volume × KD scoring elevates competitor brand searches
 * (e.g. "randstad.in", "naukri jobs") above content-suitable terms (e.g.
 * "how to hire AI engineers"). For a content engine that wants traffic to
 * the user's *own* domain, those are useless: nobody who searches a
 * competitor's brand will ever click our blog.
 */
export function evaluateBrandFit(
  keyword: string,
  intent: string,
  projectDomain: string,
  competitorDomains: string[]
): BrandFitResult {
  const k = keyword.toLowerCase().trim();
  const ownBrand = domainToBrandToken(projectDomain);
  const competitorBrands = competitorDomains
    .map(domainToBrandToken)
    .filter(b => b.length >= 3);

  // Own brand is OK — branded queries to your own site can convert.
  if (ownBrand && ownBrand.length >= 3 && k.includes(ownBrand)) {
    return {
      suitable: true,
      penaltyFactor: 1,
      reason: `Branded query for your own domain "${ownBrand}" — useful for branded landing pages.`,
      category: "ok",
    };
  }

  // Competitor brand → terrible blog target. Searcher wants the competitor.
  for (const cb of competitorBrands) {
    if (k.includes(cb)) {
      return {
        suitable: false,
        penaltyFactor: 0.15,
        reason: `Brand-navigational query for competitor "${cb}" — searchers want their site, not your blog. Skip for content.`,
        category: "competitor_brand",
      };
    }
  }

  // Pure navigational intent without our brand.
  if (intent.toLowerCase() === "navigational") {
    return {
      suitable: false,
      penaltyFactor: 0.35,
      reason: `Navigational intent — user is looking for a specific site, not informational content. Weak blog target.`,
      category: "navigational_intent",
    };
  }

  // Heuristic: strings that look like company lookups (e.g. multi-token phrases
  // ending in "private limited", "ltd", "inc", "corporation", "pvt").
  if (/(private\s+limited|pvt\.?\s+ltd|\bltd\.?$|\binc\.?$|\bcorp(oration)?\b)/i.test(keyword)) {
    return {
      suitable: false,
      penaltyFactor: 0.3,
      reason: `Reads as a specific company lookup — unlikely to drive blog traffic to your site.`,
      category: "company_lookup",
    };
  }

  return {
    suitable: true,
    penaltyFactor: 1,
    reason: `Topic fits informational/commercial content writing.`,
    category: "ok",
  };
}

/**
 * Detect a date inside a user prompt. Recognises:
 *   • ISO  : 2026-04-03
 *   • Numeric: 04/03/2026, 4/3/26
 *   • Natural: "april 3", "3rd april", "april 3rd 2026"
 * Returns ISO string YYYY-MM-DD or null.
 */
export function extractRequestedDate(prompt: string, fallbackYear?: number): string | null {
  const p = prompt.trim();
  const year = fallbackYear ?? new Date().getFullYear();

  // ISO match
  const iso = p.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const y = iso[1];
    const m = iso[2].padStart(2, "0");
    const d = iso[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Numeric m/d/y
  const num = p.match(/\b(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?\b/);
  if (num) {
    const m = num[1].padStart(2, "0");
    const d = num[2].padStart(2, "0");
    let y = num[3] ? parseInt(num[3], 10) : year;
    if (y < 100) y += 2000;
    if (parseInt(m, 10) >= 1 && parseInt(m, 10) <= 12 && parseInt(d, 10) >= 1 && parseInt(d, 10) <= 31) {
      return `${y}-${m}-${d}`;
    }
  }

  // Natural language month names
  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const monthRe = months.join("|");
  const natural1 = new RegExp(`\\b(${monthRe})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "i");
  const natural2 = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthRe})(?:,?\\s+(\\d{4}))?\\b`, "i");
  const m1 = p.match(natural1);
  const m2 = p.match(natural2);
  if (m1 || m2) {
    const monthName = (m1 ? m1[1] : m2![2]).toLowerCase();
    const day = (m1 ? m1[2] : m2![1]).padStart(2, "0");
    const yearStr = (m1 ? m1[3] : m2![3]) || String(year);
    const monthIdx = months.indexOf(monthName);
    if (monthIdx >= 0 && parseInt(day, 10) >= 1 && parseInt(day, 10) <= 31) {
      return `${yearStr}-${String(monthIdx + 1).padStart(2, "0")}-${day}`;
    }
  }

  return null;
}

/**
 * Extract how many results the user is requesting from their prompt.
 * Returns the number if explicitly stated, or 0 to signal "AI decides".
 */
export function extractRequestedCount(prompt: string): number {
  const p = prompt.toLowerCase().trim();

  if (/\b(a single|just one|only one)\b/.test(p)) return 1;
  if (/\b(one|single)\b/.test(p) && /\b(keyword|kw|result|pick|suggestion)\b/.test(p)) return 1;
  if (/\ba few\b|\ba couple\b/.test(p)) return 3;

  // "top 10", "best 10 keywords", "10 keywords"
  const topN = p.match(/\b(?:top|first|best)\s+(\d{1,2})\b/);
  if (topN) {
    const n = parseInt(topN[1], 10);
    if (n >= 1 && n <= 20) return n;
  }

  const nKeywords = p.match(/\b(\d{1,2})\s+keywords?\b/);
  if (nKeywords) {
    const n = parseInt(nKeywords[1], 10);
    if (n >= 1 && n <= 20) return n;
  }

  const giveMe = p.match(/\bgive\s+me\s+(?:the\s+)?(?:top\s+)?(\d{1,2})\b/);
  if (giveMe) {
    const n = parseInt(giveMe[1], 10);
    if (n >= 1 && n <= 20) return n;
  }

  const numMatch = p.match(
    /\b(?:top|best|give\s+me|show\s+me|find\s+me|suggest|list|only|just)?\s*(\d{1,2})\s*(?:keyword|kw|result|suggestion|pick|item)?s?\b/
  );
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    if (n >= 1 && n <= 20) return n;
  }

  return 0;
}

/**
 * Extract an explicit intent filter from the user's prompt.
 * Returns the lowercase intent string, or null if none specified.
 */
export function extractRequestedIntent(prompt: string): string | null {
  const p = prompt.toLowerCase();
  if (/\bcommercial(\s+intent)?\b/.test(p)) return "commercial";
  if (/\btransactional(\s+intent)?\b/.test(p)) return "transactional";
  if (/\binformational(\s+intent)?\b/.test(p)) return "informational";
  if (/\bnavigational(\s+intent)?\b/.test(p)) return "navigational";
  // Implicit commercial: "buy intent", "purchase intent", "buyer intent"
  if (/\b(buy(er)?|purchase|high[\s-]intent|money)\s+intent\b/.test(p)) return "commercial";
  return null;
}

/**
 * Composite of all dimension filters extracted from a single prompt.
 */
export interface QueryFilters {
  intent: string | null;
  count: number;
  lowCompetitionOnly: boolean;
  longTailOnly: boolean;
}

export function extractQueryFilters(prompt: string): QueryFilters {
  return {
    intent: extractRequestedIntent(prompt),
    count: extractRequestedCount(prompt),
    lowCompetitionOnly: /\blow[\s-](competition|kd|difficulty)\b/i.test(prompt),
    longTailOnly: /\blong[\s-]?tail\b/i.test(prompt),
  };
}

export function parseJsonObject(text: string): unknown | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export function buildSuggestion(base: CandidateRow, why: string, step: string, rankChanceRaw?: number, stageRaw?: string): ContextualSuggestion {
  const funnel = stageRaw === "TOFU" || stageRaw === "MOFU" || stageRaw === "BOFU"
    ? stageRaw
    : funnelStage(base.intent, base.keyword);
  const defaultRank = clamp(Math.round(0.55 * base.score + 0.45 * (100 - (base.kd || 45))));
  const rankChance = clamp(Math.round(rankChanceRaw ?? defaultRank));
  return {
    id: base.id,
    keyword: base.keyword,
    source: base.source,
    score: base.score,
    metrics: {
      volume: base.volume,
      kd: base.kd,
      cpc: base.cpc ?? 0,
      intent: base.intent || "",
    },
    trafficType: trafficType(funnel),
    estimatedMonthlyTraffic: estimateTraffic(base.volume, rankChance, funnel),
    rankingChance: rankChance,
    funnelStage: funnel,
    whyThisMatters: why,
    actionStep: step,
    lowCompetition: base.lowCompetition,
    longTail: base.longTail,
  };
}

export async function addReasoningWithLLM(
  context: AIContext,
  prompt: string,
  rows: CandidateRow[],
  fallbackSummary: string,
  /** Optional extra context lines (brand fit notes, page facts) included verbatim. */
  extraContext?: string
): Promise<{ summary: string; suggestions: ContextualSuggestion[] }> {
  const requestedCount = extractRequestedCount(prompt);
  const count = requestedCount > 0 ? Math.min(requestedCount, 20) : 8;
  const limited = rows.slice(0, count);
  const memoryLines = context.memory.recentQueries.slice(-4).join(" | ") || "(none)";

  const strategistRubric = `SCORING MINDSET (human content strategist):
- Prioritise terms where an HR / TA / operations leader would actually read a long article (thought leadership, workforce change, hiring strategy, emerging roles), not navigational company lookups.
- Reward clear informational or commercial intent that supports answer-first articles and AI Overview snippets.
- Penalise (in your written rationale only) keywords that are too generic, too branded to a competitor, or unlikely to earn clicks to the user's own domain.`;

  // Pass rich context to the LLM with stable index so the summary can
  // reference the EXACT cards in the EXACT order they will be rendered.
  const keywordContext = limited.map((r, i) => ({
    rank: i + 1,
    keyword: r.keyword,
    intent: r.intent || "unknown",
    volume: r.volume,
    kd: r.kd,
  }));
  const keywordList = limited.map((r, i) => `#${i + 1} "${r.keyword}"`).join(", ");

  const dynamicPrompt = `You are a senior SEO strategist working inside a content engine. Answer the user's EXACT question. Be specific, brand-aware, and concise.

${strategistRubric}

PROJECT CONTEXT:
- Page: ${context.page}
- Niche: ${context.businessContext.niche || "(unknown)"}
- Audience: ${context.businessContext.audience || "(unknown)"}
- Region: ${context.businessContext.region || "(unknown)"}
- Recent queries: ${memoryLines}
${context.businessContext.businessBrief ? `- Business brief: ${context.businessContext.businessBrief.slice(0, 800)}` : ""}
${extraContext ? `\nADDITIONAL FACTS:\n${extraContext}` : ""}

USER QUESTION: "${prompt || "Analyse these keywords"}"

THE FOLLOWING ${limited.length} KEYWORDS WILL BE SHOWN AS CARDS, IN THIS EXACT ORDER:
${keywordList}

Full data:
${JSON.stringify(keywordContext)}

ABSOLUTE RULES — your summary will be displayed directly above these cards:
1. Your "summary" MUST reference these exact ${limited.length} keywords by name, in the same order, in 1–3 sentences. Example: "For your goal, the top picks are #1 \\"<kw1>\\" (because…), #2 \\"<kw2>\\" (because…), and #3 \\"<kw3>\\" (because…)."
2. NEVER praise a keyword in the summary that isn't in the list above — that is a contradiction the user will see.
3. The summary must address WHY these picks fit the user's NICHE, AUDIENCE, and BUSINESS BRIEF — not just metrics. A high-volume brand-navigational keyword is a BAD blog target even with great metrics; explain that honestly.
4. "whyThisMatters" must explain (a) what the keyword targets, (b) why it fits this specific business, (c) any caveats (brand bias, intent mismatch). Reference the niche/audience explicitly when useful.
5. "actionStep" must be a concrete next step the user can take from the chat.
6. Never invent keywords — use only the ${limited.length} provided.
7. If the user asked for filtering (intent/competition/long-tail) and these results don't satisfy, say so plainly in the summary.

Return JSON ONLY:
{
  "summary": "string — must reference the exact cards above, in order",
  "reasoningByKeyword": {
    "<exact keyword>": {
      "rankingChance": 0,
      "funnelStage": "TOFU|MOFU|BOFU",
      "whyThisMatters": "string",
      "actionStep": "string"
    }
  }
}`;

  try {
    const raw = await geminiGenerate(dynamicPrompt, 2);
    const parsed = parseJsonObject(raw) as
      | { summary?: string; reasoningByKeyword?: Record<string, Record<string, unknown>> }
      | null;
    const byKeyword = parsed?.reasoningByKeyword ?? {};
    const suggestions = limited.map(r => {
      const x = byKeyword[r.keyword] ?? {};
      return buildSuggestion(
        r,
        typeof x.whyThisMatters === "string" ? x.whyThisMatters : `${r.keyword} is relevant for this project.`,
        typeof x.actionStep === "string" ? x.actionStep : "Create a focused asset for this query.",
        typeof x.rankingChance === "number" ? x.rankingChance : undefined,
        typeof x.funnelStage === "string" ? x.funnelStage.toUpperCase() : undefined
      );
    });
    return {
      summary:
        typeof parsed?.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : fallbackSummary,
      suggestions,
    };
  } catch {
    return {
      summary: fallbackSummary,
      suggestions: limited.map(r =>
        buildSuggestion(
          r,
          `${r.keyword} aligns with current business context and on-page dataset.`,
          "Build or optimize content directly targeting this keyword."
        )
      ),
    };
  }
}

export function buildOutput(
  context: AIContext,
  summary: string,
  suggestions: ContextualSuggestion[],
  actions: ContextualAgentOutput["actions"]
): ContextualAgentOutput {
  // Sort by score; keep however many addReasoningWithLLM decided to process
  const top = suggestions.sort((a, b) => b.score - a.score);
  return {
    page: context.page,
    summary,
    suggestions: top,
    actions,
    filters: {
      suggestedKeywordIds: top.map(t => t.id).filter((id): id is string => Boolean(id)),
      suggestedGapKeywords: top.filter(t => t.source === "competitor_gap").map(t => t.keyword.toLowerCase()),
      lowCompetitionKeywordIds: top.filter(t => t.lowCompetition).map(t => t.id).filter((id): id is string => Boolean(id)),
      longTailKeywordIds: top.filter(t => t.longTail).map(t => t.id).filter((id): id is string => Boolean(id)),
    },
  };
}
