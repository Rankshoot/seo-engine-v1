import type {
  AIContext,
  AIPageExtended,
  ContextualAction,
  ContextualAgentOutput,
} from "@/features/ai-assistant/types";
import { runKeywordsAgent } from "./keywordsAgent";
import { runCompetitorAgent } from "./competitorAgent";
import { runContentAuditAgent } from "./contentAuditAgent";
import { runBlogAgent } from "./blogAgent";
import {
  addReasoningWithLLM,
  buildOutput,
  evaluateBrandFit,
  extractRequestedDate,
  scoreRow,
  type CandidateRow,
} from "./common";

// ─── Intent Pattern Sets ───────────────────────────────────────────────────

const KEYWORD_PATTERNS: RegExp[] = [
  /\b(keyword|search\s+term|long[- ]tail|kd\b|keyword\s+difficult|search\s+volume|cpc\b)\b/i,
  /\b(find|show|give|suggest|best|top|rankable)(\s+me)?\s+(keyword|kw|term)s?\b/i,
  /\b(low\s+competition|high\s+volume|easy\s+to\s+rank|low\s+kd)\b/i,
  /\b(keyword\s+(opportunit|idea|list|target|strategy|research))\b/i,
  /\bwhat\s+(keyword|term|phrase)\b/i,
];

const COMPETITOR_PATTERNS: RegExp[] = [
  /\b(competitor|content\s+gap|keyword\s+gap|gap\s+analysis|rival)\b/i,
  /\b(what\s+(am|are|do|did)\s+(i|we)\s+miss|what\s+they\s+rank|they\s+rank\s+for)\b/i,
  /\b(untapped|missing\s+keyword|competitor\s+keyword|competitor\s+analys)\b/i,
  /\b(vs\.?\s+competitor|against\s+competitor|compared?\s+(to|with)\s+competitor)\b/i,
  /\b(gap\s+between|our\s+gap|content\s+we\s+miss|keyword\s+we\s+miss)\b/i,
];

const AUDIT_PATTERNS: RegExp[] = [
  /\b(audit|content\s+health|health\s+score|low\s+health|content\s+score|site\s+health)\b/i,
  /\b(fix|repair|broken|need(s)?\s+(fix|repair)|what\s+needs\s+fixing)\b/i,
  /\b(severity|high\s+severity|critical\s+issue|page\s+issue|underperform|poorly\s+perform)\b/i,
  /\b(audit\s+(score|result|report)|low\s+performing\s+page|page\s+that\s+needs)\b/i,
  /\b(what\s+(is|are)\s+(the\s+)?audit|content\s+that\s+needs)\b/i,
];

const CALENDAR_PATTERNS: RegExp[] = [
  /\b(calendar|content\s+(calendar|plan|schedule)|scheduled?\s+content)\b/i,
  /\b(fill\s+(calendar|slot|gaps?)|empty\s+slot|plan\s+content)\b/i,
  /\b(when\s+to\s+(post|publish|schedule)|upcoming\s+content|content\s+pipeline)\b/i,
  /\b(next\s+publish|publishing\s+schedule|what\s+to\s+schedule)\b/i,
];

const BLOG_PATTERNS: RegExp[] = [
  /\b(blog|article|post|content\s+idea|blog\s+idea|write\s+about)\b/i,
  /\b(generate\s+(a\s+)?(blog|article|post|content)|blog\s+topic|next\s+blog)\b/i,
  /\b(update\s+(old|existing)\s+(blog|article|content)|refresh\s+(blog|content))\b/i,
  /\b(improve\s+(blog|article|content)|blog\s+SEO)\b/i,
];

// ─── Intent Classifier ────────────────────────────────────────────────────

export type AgentIntent = AIPageExtended;

function scorePatterns(prompt: string, patterns: RegExp[]): number {
  return patterns.reduce((total, re) => {
    const hits = prompt.match(new RegExp(re.source, "gi"));
    return total + (hits ? hits.length : 0);
  }, 0);
}

export interface IntentResult {
  intent: AgentIntent;
  confidence: "high" | "medium" | "low";
  scores: Record<AgentIntent, number>;
}

export function detectAgentIntent(prompt: string, currentPage: AIPageExtended): IntentResult {
  const scores: Record<AgentIntent, number> = {
    keywords: scorePatterns(prompt, KEYWORD_PATTERNS),
    competitors: scorePatterns(prompt, COMPETITOR_PATTERNS),
    audit: scorePatterns(prompt, AUDIT_PATTERNS),
    calendar: scorePatterns(prompt, CALENDAR_PATTERNS),
    blogs: scorePatterns(prompt, BLOG_PATTERNS),
  };

  const entries = Object.entries(scores).sort(([, a], [, b]) => b - a) as [AgentIntent, number][];
  const [topIntent, topScore] = entries[0];
  const [, secondScore] = entries[1];

  if (topScore === 0) {
    return { intent: currentPage, confidence: "low", scores };
  }
  if (topScore > secondScore) {
    return { intent: topIntent, confidence: "high", scores };
  }
  // Tied — fall back to current page
  return { intent: currentPage, confidence: "medium", scores };
}

// ─── Calendar Agent ───────────────────────────────────────────────────────

function calendarActions(): ContextualAction[] {
  return [
    { type: "AUTO_FILL_CALENDAR", label: "Auto Fill Calendar", description: "Fill open slots with best approved terms." },
    { type: "ANALYZE_KEYWORDS", label: "Analyze Keywords", description: "Re-rank approved terms for scheduling order." },
  ];
}

function calendarRows(context: AIContext): CandidateRow[] {
  const projectDomain = context.businessContext.projectDomain ?? "";
  const competitorDomains = context.businessContext.competitorDomains ?? [];
  const scheduled = new Set(context.calendarData.map(e => e.keyword_id).filter(Boolean));
  return context.keywords
    .filter(k => k.status === "approved" && !scheduled.has(k.id))
    .map(k => {
      const fit = evaluateBrandFit(k.keyword, k.intent ?? "", projectDomain, competitorDomains);
      const baseScore = scoreRow(k.volume ?? 0, k.kd ?? 0, k.intent ?? "", k.keyword, 18);
      return {
        id: k.id,
        keyword: k.keyword,
        source: "calendar_slot" as const,
        volume: k.volume ?? 0,
        kd: k.kd ?? 0,
        cpc: k.cpc ?? 0,
        intent: k.intent ?? "",
        longTail: k.keyword.trim().split(/\s+/).length >= 4,
        lowCompetition: (k.kd ?? 0) > 0 && (k.kd ?? 0) <= 35,
        score: Math.max(1, Math.round(baseScore * fit.penaltyFactor)),
        _brandCategory: fit.category,
      } as CandidateRow & { _brandCategory: string };
    })
    .filter(r => (r as { _brandCategory?: string })._brandCategory !== "competitor_brand")
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
}

/**
 * Date-specific answer: if the user asked about a particular date, list the
 * entries scheduled on that day (or say the slot is open) without flooding
 * cards.
 */
function calendarDateAnswer(context: AIContext, isoDate: string): ContextualAgentOutput {
  const entries = context.calendarData.filter(e => e.scheduled_date === isoDate);
  const niceDate = new Date(isoDate + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  if (!entries.length) {
    return buildOutput(
      context,
      `Nothing is scheduled on **${niceDate}** (${isoDate}). The slot is open — ask me to suggest a keyword for that date, or open the Calendar to schedule manually.`,
      [],
      calendarActions()
    );
  }
  const lines = entries.map(e =>
    `• **${e.title || e.focus_keyword}** (keyword "${e.focus_keyword}") — status: ${e.status}${e.article_type ? ` · ${e.article_type}` : ""}`
  );
  return buildOutput(
    context,
    `On **${niceDate}** (${isoDate}) you have ${entries.length} scheduled item(s):\n\n${lines.join("\n")}\n\nAsk me to generate any of them, or to reschedule.`,
    [],
    calendarActions()
  );
}

async function runCalendarAgent(context: AIContext, prompt: string): Promise<ContextualAgentOutput> {
  // Date-aware shortcut — same UX as blog agent
  const isoDate = extractRequestedDate(prompt);
  if (isoDate) {
    return calendarDateAnswer(context, isoDate);
  }

  const rows = calendarRows(context);
  if (!rows.length) {
    return buildOutput(context, "No unscheduled approved keywords available for calendar autofill.", [], calendarActions());
  }
  const upcoming = context.calendarData
    .slice()
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
    .slice(0, 10)
    .map(e => `${e.scheduled_date} · "${e.focus_keyword}" · ${e.status}`)
    .join("\n");
  const extraContext = `Upcoming scheduled entries (date · keyword · status):\n${upcoming || "(empty)"}`;

  const enriched = await addReasoningWithLLM(
    context,
    prompt,
    rows,
    `Analyzed ${rows.length} approved keywords and prioritized what to schedule next.`,
    extraContext
  );
  return buildOutput(context, enriched.summary, enriched.suggestions, calendarActions());
}

// ─── No-data graceful response ─────────────────────────────────────────────

function noDataResponse(context: AIContext, domain: string, pageName: string): ContextualAgentOutput {
  return {
    page: context.page,
    summary: `I need ${domain} data to answer that. Please open the **${pageName}** page once so the data loads, then ask me again — I'll have full context.`,
    suggestions: [],
    actions: [],
    filters: {
      suggestedKeywordIds: [],
      suggestedGapKeywords: [],
      lowCompetitionKeywordIds: [],
      longTailKeywordIds: [],
    },
  };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────

/**
 * Tool-calling orchestrator. Reads the user's prompt, classifies which agent
 * should handle it, then delegates — regardless of which page is currently open.
 *
 * Data availability check: if the detected agent needs data that hasn't loaded
 * yet (e.g. audit records when the user hasn't visited /audit), returns a
 * graceful nudge instead of an empty analysis.
 */
export async function runOrchestratorAgent(
  context: AIContext,
  prompt: string
): Promise<ContextualAgentOutput> {
  // Date queries take priority over all other intents — if the user asks
  // "what's on April 3rd?" we always answer with the calendar/blog view,
  // regardless of which page they're on.
  const isoDate = extractRequestedDate(prompt);
  if (isoDate) {
    const datePage: AIContext = { ...context, page: context.page === "blogs" ? "blogs" : "calendar" };
    if (datePage.page === "blogs") {
      return runBlogAgent(datePage, prompt);
    }
    return runCalendarAgent(datePage, prompt);
  }

  const { intent, confidence, scores } = detectAgentIntent(prompt, context.page);

  // Log for debugging
  console.log("[orchestrator]", { prompt: prompt.slice(0, 60), intent, confidence, scores });

  // Build agent context with the detected page so each agent labels output correctly
  const agentCtx: AIContext = { ...context, page: intent };

  switch (intent) {
    case "keywords": {
      if (!context.keywords.length) {
        return noDataResponse(context, "keyword", "Keywords");
      }
      return runKeywordsAgent(agentCtx, prompt);
    }

    case "competitors": {
      if (context.contentGaps.length === 0 && context.competitorKeywords.length === 0) {
        return noDataResponse(context, "competitor gap", "Competitors");
      }
      return runCompetitorAgent(agentCtx, prompt);
    }

    case "audit": {
      if (!context.audits.length) {
        return noDataResponse(context, "content audit", "Content Health");
      }
      return runContentAuditAgent(agentCtx, prompt);
    }

    case "calendar": {
      return runCalendarAgent(agentCtx, prompt);
    }

    case "blogs": {
      return runBlogAgent(agentCtx, prompt);
    }

    default: {
      // Confidence is low / no intent detected — use current page as fallback
      return runKeywordsAgent(context, prompt);
    }
  }
}
