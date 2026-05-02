import { geminiGenerate } from "@/lib/gemini";
import type {
  AIContext,
  AIPage,
  ContextualAction,
  ContextualAgentOutput,
  ContextualSuggestion,
} from "@/features/ai-assistant/types";

interface CandidateRow {
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

function clamp(n: number, min = 0, max = 100): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function funnelStage(intentRaw: string, keyword: string): "TOFU" | "MOFU" | "BOFU" {
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

function trafficType(stage: "TOFU" | "MOFU" | "BOFU"): string {
  if (stage === "BOFU") return "high-intent conversion traffic";
  if (stage === "MOFU") return "comparison and consideration traffic";
  return "top-of-funnel informational traffic";
}

function estimateTraffic(volume: number, rankChance: number, stage: "TOFU" | "MOFU" | "BOFU"): number {
  const ctr = stage === "BOFU" ? 0.12 : stage === "MOFU" ? 0.16 : 0.2;
  return Math.max(0, Math.round(volume * ctr * (rankChance / 100)));
}

function scoreRow(volume: number, kd: number, intent: string, keyword: string, sourceBoost = 0): number {
  const volumeScore = clamp(Math.log10(volume + 1) * 22);
  const difficultyScore = kd > 0 ? clamp(100 - kd) : 55;
  const stage = funnelStage(intent, keyword);
  const intentScore = stage === "BOFU" ? 90 : stage === "MOFU" ? 82 : 70;
  return clamp(Math.round(volumeScore * 0.35 + difficultyScore * 0.35 + intentScore * 0.2 + sourceBoost * 0.1));
}

function candidatesByPage(context: AIContext): CandidateRow[] {
  if (context.page === "keywords") {
    return context.keywords.map(k => {
      const longTail = k.keyword.trim().split(/\s+/).length >= 4;
      const lowCompetition = (k.kd ?? 0) > 0 && (k.kd ?? 0) <= 35;
      return {
        id: k.id,
        keyword: k.keyword,
        source: "keyword",
        volume: k.volume ?? 0,
        kd: k.kd ?? 0,
        cpc: k.cpc ?? 0,
        intent: k.intent ?? "",
        longTail,
        lowCompetition,
        score: scoreRow(k.volume ?? 0, k.kd ?? 0, k.intent ?? "", k.keyword),
      };
    });
  }

  if (context.page === "competitors") {
    return context.contentGaps.map(g => {
      const boost = g.gap_type === "missing" ? 30 : g.gap_type === "untapped" ? 22 : 15;
      const longTail = g.keyword.trim().split(/\s+/).length >= 4;
      const lowCompetition = (g.kd ?? 0) > 0 && (g.kd ?? 0) <= 35;
      return {
        keyword: g.keyword,
        source: "competitor_gap",
        volume: g.volume ?? 0,
        kd: g.kd ?? 0,
        cpc: 0,
        intent: "commercial",
        longTail,
        lowCompetition,
        score: scoreRow(g.volume ?? 0, g.kd ?? 0, "commercial", g.keyword, boost),
      };
    });
  }

  if (context.page === "calendar") {
    const scheduled = new Set(context.calendarData.map(e => e.keyword_id).filter(Boolean));
    return context.keywords
      .filter(k => k.status === "approved" && !scheduled.has(k.id))
      .map(k => {
        const longTail = k.keyword.trim().split(/\s+/).length >= 4;
        const lowCompetition = (k.kd ?? 0) > 0 && (k.kd ?? 0) <= 35;
        return {
          id: k.id,
          keyword: k.keyword,
          source: "calendar_slot",
          volume: k.volume ?? 0,
          kd: k.kd ?? 0,
          cpc: k.cpc ?? 0,
          intent: k.intent ?? "",
          longTail,
          lowCompetition,
          score: scoreRow(k.volume ?? 0, k.kd ?? 0, k.intent ?? "", k.keyword, 20),
        };
      });
  }

  return context.calendarData
    .filter(e => e.status === "generated" || e.status === "published" || e.status === "approved")
    .map(e => ({
      id: e.keyword_id ?? undefined,
      keyword: e.focus_keyword,
      source: "blog",
      volume: e.keywords?.volume ?? 0,
      kd: e.keywords?.kd ?? 0,
      cpc: e.keywords?.cpc ?? 0,
      intent: e.keywords?.intent ?? "",
      longTail: e.focus_keyword.trim().split(/\s+/).length >= 4,
      lowCompetition: (e.keywords?.kd ?? 0) > 0 && (e.keywords?.kd ?? 0) <= 35,
      score: scoreRow(e.keywords?.volume ?? 0, e.keywords?.kd ?? 0, e.keywords?.intent ?? "", e.focus_keyword, 12),
    }));
}

function actionsForPage(page: AIPage): ContextualAction[] {
  if (page === "keywords") {
    return [
      { type: "ANALYZE_KEYWORDS", label: "Analyze Keywords", description: "Re-rank keyword opportunities for this page." },
      { type: "FILTER_LOW_COMPETITION", label: "Filter Low Competition", description: "Focus on easier-to-rank opportunities." },
      { type: "SUGGEST_LONG_TAIL", label: "Suggest Long-tail", description: "Focus on specific high-intent long-tail terms." },
    ];
  }
  if (page === "competitors") {
    return [
      { type: "FIND_GAPS", label: "Find Gaps", description: "Prioritize missing competitor terms first." },
      { type: "COMPARE_KEYWORDS", label: "Compare Keywords", description: "Compare your coverage vs competitors." },
      { type: "ADD_OPPORTUNITIES", label: "Add Opportunities", description: "Move top gap opportunities to your plan." },
    ];
  }
  if (page === "calendar") {
    return [
      { type: "AUTO_FILL_CALENDAR", label: "Auto Fill Calendar", description: "Fill open slots with best approved terms." },
      { type: "ANALYZE_KEYWORDS", label: "Analyze Keywords", description: "Re-rank approved terms for scheduling order." },
    ];
  }
  return [
    { type: "GENERATE_BLOG", label: "Generate Blog", description: "Generate a blog from highest opportunity terms." },
    { type: "IMPROVE_BLOG", label: "Improve Blog SEO", description: "Improve underperforming content and structure." },
    { type: "UPDATE_OLD_BLOG", label: "Update Old Content", description: "Refresh older content to regain traffic." },
  ];
}

function parseJsonObject(text: string): unknown | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function fallback(context: AIContext, rows: CandidateRow[]): ContextualAgentOutput {
  const top = rows
    .slice(0, 10)
    .map<ContextualSuggestion>(r => {
      const stage = funnelStage(r.intent, r.keyword);
      const rankChance = clamp(Math.round(0.55 * r.score + 0.45 * (100 - (r.kd || 45))));
      return {
        id: r.id,
        keyword: r.keyword,
        source: r.source,
        score: r.score,
        metrics: {
          volume: r.volume,
          kd: r.kd,
          cpc: r.cpc ?? 0,
          intent: r.intent || "",
        },
        trafficType: trafficType(stage),
        estimatedMonthlyTraffic: estimateTraffic(r.volume, rankChance, stage),
        rankingChance: rankChance,
        funnelStage: stage,
        whyThisMatters: `${r.keyword} aligns with ${stage} intent and has practical upside in ${context.businessContext.region}.`,
        actionStep:
          stage === "BOFU"
            ? "Create a conversion-focused page with pricing/demo CTA."
            : stage === "MOFU"
              ? "Publish comparison-style content and include clear differentiators."
              : "Publish an answer-first educational guide with internal links.",
        lowCompetition: r.lowCompetition,
        longTail: r.longTail,
      };
    });

  return {
    page: context.page,
    summary: `Analyzed ${rows.length} opportunities for the ${context.page} page and prioritized the strongest traffic bets.`,
    suggestions: top,
    actions: actionsForPage(context.page),
    filters: {
      suggestedKeywordIds: top.map(t => t.id).filter((id): id is string => Boolean(id)),
      suggestedGapKeywords: top.filter(t => t.source === "competitor_gap").map(t => t.keyword.toLowerCase()),
      lowCompetitionKeywordIds: top.filter(t => t.lowCompetition).map(t => t.id).filter((id): id is string => Boolean(id)),
      longTailKeywordIds: top.filter(t => t.longTail).map(t => t.id).filter((id): id is string => Boolean(id)),
    },
  };
}

function rowsByPrompt(rows: CandidateRow[], prompt: string): CandidateRow[] {
  const p = prompt.toLowerCase();
  if (/\blow\b/.test(p) && /\bcompetition\b/.test(p)) {
    const filtered = rows.filter(r => r.lowCompetition);
    return filtered.length ? filtered : rows;
  }
  if (/\blong\b/.test(p) && /\btail\b/.test(p)) {
    const filtered = rows.filter(r => r.longTail);
    return filtered.length ? filtered : rows;
  }
  return rows;
}

export async function runContextualAgent(context: AIContext, prompt = ""): Promise<ContextualAgentOutput> {
  const baseRows = candidatesByPage(context).sort((a, b) => b.score - a.score);
  const rows = rowsByPrompt(baseRows, prompt).slice(0, 50);
  if (!rows.length) {
    return {
      page: context.page,
      summary: `No eligible data available on ${context.page} yet. Run the relevant workflow first.`,
      suggestions: [],
      actions: actionsForPage(context.page),
      filters: {
        suggestedKeywordIds: [],
        suggestedGapKeywords: [],
        lowCompetitionKeywordIds: [],
        longTailKeywordIds: [],
      },
    };
  }

  const topBase = rows.slice(0, 10);
  const dynamicPrompt = `You are an SEO strategist.

Context:
Page: ${context.page}
Niche: ${context.businessContext.niche || "(unknown)"}
Audience: ${context.businessContext.audience || "(unknown)"}
Region: ${context.businessContext.region || "(unknown)"}
User prompt: ${prompt || "Recommend best actions for this page"}

Allowed keywords (MUST use only these exact keywords, no new keywords):
${JSON.stringify(topBase.map(r => r.keyword))}

For EACH allowed keyword, return only reasoning fields.
Do not return KD/volume/CPC values; those are fixed from source data.

Return ONLY JSON in this exact shape:
{
  "summary": "string",
  "reasoningByKeyword": {
    "<exact keyword from allowed list>": {
      "rankingChance": 0,
      "funnelStage": "TOFU",
      "trafficType": "string",
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
    const reasoningByKeyword = parsed?.reasoningByKeyword ?? {};
    const suggestions: ContextualSuggestion[] = topBase.map(base => {
      const reasoning = reasoningByKeyword[base.keyword] ?? {};
      const stage = (typeof reasoning.funnelStage === "string" ? reasoning.funnelStage.toUpperCase() : "") as
        | "TOFU"
        | "MOFU"
        | "BOFU";
      const funnel = stage === "BOFU" || stage === "MOFU" || stage === "TOFU" ? stage : funnelStage(base.intent, base.keyword);
      const derivedRankChance = clamp(Math.round(0.55 * base.score + 0.45 * (100 - (base.kd || 45))));
      const rankChance = clamp(
        Math.round(
          typeof reasoning.rankingChance === "number" ? reasoning.rankingChance : derivedRankChance
        )
      );
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
        rankingChance: rankChance,
        estimatedMonthlyTraffic: estimateTraffic(base.volume, rankChance, funnel),
        funnelStage: funnel,
        trafficType:
          typeof reasoning.trafficType === "string" && reasoning.trafficType.trim()
            ? reasoning.trafficType
            : trafficType(funnel),
        whyThisMatters:
          typeof reasoning.whyThisMatters === "string"
            ? reasoning.whyThisMatters
            : `${base.keyword} has practical upside on this page.`,
        actionStep:
          typeof reasoning.actionStep === "string"
            ? reasoning.actionStep
            : "Turn this into a publishable asset with clear intent alignment.",
        lowCompetition: base.lowCompetition,
        longTail: base.longTail,
      };
    });
    const top = suggestions.sort((a, b) => b.score - a.score).slice(0, 10);
    return {
      page: context.page,
      summary:
        typeof parsed?.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : `Contextual analysis complete for the ${context.page} page.`,
      suggestions: top,
      actions: actionsForPage(context.page),
      filters: {
        suggestedKeywordIds: top.map(t => t.id).filter((id): id is string => Boolean(id)),
        suggestedGapKeywords: top.filter(t => t.source === "competitor_gap").map(t => t.keyword.toLowerCase()),
        lowCompetitionKeywordIds: top.filter(t => t.lowCompetition).map(t => t.id).filter((id): id is string => Boolean(id)),
        longTailKeywordIds: top.filter(t => t.longTail).map(t => t.id).filter((id): id is string => Boolean(id)),
      },
    };
  } catch {
    return fallback(context, rows);
  }
}
