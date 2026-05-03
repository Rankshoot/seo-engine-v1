/**
 * Blog Agent — chatbot planning companion to the blog generation pipeline.
 *
 * Two modes:
 *  ① DATE QUERIES — "what's on April 3rd?", "what's scheduled tomorrow?"
 *      Detect a date in the prompt → answer with the calendar entry on that
 *      date plus its current blog status, no card flood.
 *
 *  ② STRATEGY QUERIES — "what should I write next?", "improve this blog"
 *      Build candidate pools (scheduled / new opportunity / improve), pass
 *      to the LLM with full calendar awareness so the summary references
 *      real dates and statuses.
 *
 * DATA SOURCES (mirrors what generateBlog() uses server-side)
 *   ① DataForSEO — keyword.secondary_keywords, volume, kd, cpc, intent
 *   ② Ahrefs    — fetched live during generateBlog() (matching terms,
 *                  questions, SERP); not in chatbot context
 *   ③ Serper    — fetched live during generateBlog() (PAA, top articles)
 */

import { geminiGenerate } from "@/lib/gemini";
import type {
  AIContext,
  ContextualAction,
  ContextualAgentOutput,
  ContextualSuggestion,
} from "@/features/ai-assistant/types";
import type { CalendarEntry, Keyword } from "@/lib/types";
import {
  buildOutput,
  buildSuggestion,
  clamp,
  evaluateBrandFit,
  extractRequestedCount,
  extractRequestedDate,
  funnelStage,
  parseJsonObject,
  scoreRow,
  type CandidateRow,
} from "./common";

// ─── Types ─────────────────────────────────────────────────────────────────

interface BlogCandidate extends CandidateRow {
  /** DataForSEO secondary keywords — used as H2 seeds in the preview. */
  secondaryKeywords: string[];
  /** Pool label. */
  pool: "scheduled" | "new_opportunity" | "improve";
  /** Calendar metadata when the candidate is on the calendar. */
  scheduledDate?: string;
  calendarStatus?: string;
  calendarTitle?: string;
  brandCategory: string;
  brandReason: string;
}

// ─── Actions ───────────────────────────────────────────────────────────────

export function blogActions(): ContextualAction[] {
  return [
    {
      type: "GENERATE_BLOG",
      label: "Generate Blog",
      description: "Generate the highest-priority queued blog (Ahrefs + Serper research applied).",
    },
    {
      type: "IMPROVE_BLOG",
      label: "Improve Blog SEO",
      description: "Improve an underperforming blog's structure, depth, and on-page SEO.",
    },
    {
      type: "OPEN_CALENDAR",
      label: "Open Calendar",
      description: "Jump to the content calendar to schedule, reschedule, or generate.",
    },
  ];
}

// ─── Date-query mode ───────────────────────────────────────────────────────

function dateAnswer(context: AIContext, isoDate: string): ContextualAgentOutput {
  const entries = context.calendarData.filter(e => e.scheduled_date === isoDate);
  const niceDate = new Date(isoDate + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (!entries.length) {
    return buildOutput(
      context,
      `Nothing is scheduled on **${niceDate}** (${isoDate}). The slot is open — you can ask me to suggest a keyword for that date, or open the Calendar to schedule manually.`,
      [],
      blogActions()
    );
  }

  const lines = entries.map(e => {
    const status = e.status ?? "scheduled";
    const title = e.title || e.focus_keyword;
    return `• **${title}** (keyword: "${e.focus_keyword}") — status: ${status}${
      e.article_type ? ` · ${e.article_type}` : ""
    }`;
  });

  const summary = `On **${niceDate}** (${isoDate}) you have ${entries.length} scheduled item(s):\n\n${lines.join(
    "\n"
  )}\n\nAsk me to generate any of them, or to reschedule.`;

  return buildOutput(context, summary, [], blogActions());
}

// ─── Candidate builder ─────────────────────────────────────────────────────

function buildBlogCandidates(context: AIContext): BlogCandidate[] {
  const projectDomain = context.businessContext.projectDomain ?? "";
  const competitorDomains = context.businessContext.competitorDomains ?? [];
  const scheduledKeywordIds = new Set(
    context.calendarData.map(e => e.keyword_id).filter(Boolean)
  );

  function kwFor(keywordId: string | null): Keyword | undefined {
    if (!keywordId) return undefined;
    return context.keywords.find(k => k.id === keywordId);
  }

  function fromCalendar(e: CalendarEntry, pool: BlogCandidate["pool"], boost: number): BlogCandidate {
    const kw = kwFor(e.keyword_id);
    const vol = kw?.volume ?? (e.keywords as { volume?: number } | undefined)?.volume ?? 0;
    const kd = kw?.kd ?? (e.keywords as { kd?: number } | undefined)?.kd ?? 0;
    const cpc = kw?.cpc ?? (e.keywords as { cpc?: number } | undefined)?.cpc ?? 0;
    const intent = kw?.intent ?? (e.keywords as { intent?: string } | undefined)?.intent ?? "";
    const fit = evaluateBrandFit(e.focus_keyword, intent, projectDomain, competitorDomains);
    const baseScore = scoreRow(vol, kd, intent, e.focus_keyword, boost);
    return {
      id: kw?.id ?? e.keyword_id ?? undefined,
      keyword: e.focus_keyword,
      source: "blog",
      volume: vol,
      kd,
      cpc,
      intent,
      longTail: e.focus_keyword.trim().split(/\s+/).length >= 4,
      lowCompetition: kd > 0 && kd <= 35,
      secondaryKeywords: kw?.secondary_keywords ?? e.secondary_keywords ?? [],
      pool,
      scheduledDate: e.scheduled_date,
      calendarStatus: e.status,
      calendarTitle: e.title,
      brandCategory: fit.category,
      brandReason: fit.reason,
      score: Math.max(1, Math.round(baseScore * fit.penaltyFactor)),
    };
  }

  // Pool A: Scheduled (waiting to be generated)
  const poolA = context.calendarData
    .filter(e => e.status === "scheduled")
    .map(e => fromCalendar(e, "scheduled", 20));

  // Pool B: Approved keywords not on calendar yet
  const poolB: BlogCandidate[] = context.keywords
    .filter(k => k.status === "approved" && !scheduledKeywordIds.has(k.id))
    .map(k => {
      const fit = evaluateBrandFit(k.keyword, k.intent ?? "", projectDomain, competitorDomains);
      const baseScore = scoreRow(k.volume ?? 0, k.kd ?? 0, k.intent ?? "", k.keyword, 15);
      return {
        id: k.id,
        keyword: k.keyword,
        source: "blog" as const,
        volume: k.volume ?? 0,
        kd: k.kd ?? 0,
        cpc: k.cpc ?? 0,
        intent: k.intent ?? "",
        longTail: k.keyword.trim().split(/\s+/).length >= 4,
        lowCompetition: (k.kd ?? 0) > 0 && (k.kd ?? 0) <= 35,
        secondaryKeywords: k.secondary_keywords ?? [],
        pool: "new_opportunity" as const,
        brandCategory: fit.category,
        brandReason: fit.reason,
        score: Math.max(1, Math.round(baseScore * fit.penaltyFactor)),
      };
    });

  // Pool C: Generated/published (improvement candidates)
  const poolC = context.calendarData
    .filter(e => e.status === "generated" || e.status === "published" || e.status === "approved")
    .map(e => fromCalendar(e, "improve", 10));

  // Dedupe
  const seen = new Set<string>();
  return [...poolA, ...poolB, ...poolC]
    .filter(r => {
      const k = r.keyword.toLowerCase().trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    // Drop competitor-brand keywords entirely from blog suggestions
    .filter(r => r.brandCategory !== "competitor_brand")
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
}

// ─── LLM reasoning ─────────────────────────────────────────────────────────

async function addBlogReasoningWithLLM(
  context: AIContext,
  prompt: string,
  rows: BlogCandidate[],
  fallbackSummary: string
): Promise<{ summary: string; suggestions: ContextualSuggestion[] }> {
  const requestedCount = extractRequestedCount(prompt);
  const count = requestedCount > 0 ? Math.min(requestedCount, 20) : 8;
  const limited = rows.slice(0, count);
  const memoryLines = context.memory.recentQueries.slice(-4).join(" | ") || "(none)";

  const blogContext = limited.map((r, i) => ({
    rank: i + 1,
    keyword: r.keyword,
    pool: r.pool,
    intent: r.intent || "unknown",
    volume: r.volume,
    kd: r.kd,
    scheduledDate: r.scheduledDate ?? null,
    calendarStatus: r.calendarStatus ?? null,
    calendarTitle: r.calendarTitle ?? null,
    brandFit: r.brandReason,
    h2_seeds_from_dataforseo: r.secondaryKeywords.slice(0, 8),
  }));

  const cardList = limited.map((r, i) => `#${i + 1} "${r.keyword}" (${r.pool})`).join(", ");

  // Calendar overview — top 12 upcoming entries with dates
  const upcoming = context.calendarData
    .slice()
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
    .slice(0, 12)
    .map(e => `${e.scheduled_date} · "${e.focus_keyword}" · ${e.status}`)
    .join("\n");

  const dynamicPrompt = `You are an expert SEO content planner inside a content engine. Answer the user's EXACT question using the data below.

PROJECT CONTEXT:
- Niche: ${context.businessContext.niche || "(unknown)"}
- Audience: ${context.businessContext.audience || "(unknown)"}
- Region: ${context.businessContext.region || "(unknown)"}
- Project domain: ${context.businessContext.projectDomain || "(unknown)"}
- Competitor domains: ${(context.businessContext.competitorDomains ?? []).join(", ") || "(none)"}
- Recent queries: ${memoryLines}

CALENDAR OVERVIEW (date · keyword · status):
${upcoming || "(empty)"}

THE FOLLOWING ${limited.length} CANDIDATES WILL BE SHOWN AS CARDS, IN THIS EXACT ORDER:
${cardList}

POOL TYPES:
  • scheduled       — already queued, ready to generate (highest priority)
  • new_opportunity — approved keyword, not yet scheduled
  • improve         — existing generated/published blog, refresh candidate

Full data:
${JSON.stringify(blogContext, null, 2)}

NOTE FOR GENERATION: When the user clicks Generate Blog, the system additionally calls Ahrefs Matching Terms (richer H2 seeds), Ahrefs Questions, Serper PAA, and Serper top articles. The chatbot preview uses DataForSEO subtopics only — the generated article will be richer.

USER QUESTION: "${prompt || "What should I write next?"}"

ABSOLUTE RULES — your summary will be displayed directly above these cards:
1. Your "summary" MUST reference these exact ${limited.length} candidates by name, in the same order, in 2–4 sentences.
2. Mention the SCHEDULED DATE when relevant (e.g. "#1 \\"<kw>\\" is queued for <date>"). Mention the brand-fit reason if it's interesting.
3. NEVER praise or mention any keyword that isn't in the list above.
4. Tie picks to the niche/audience/business brief — explain WHY this is a good blog for THIS company.
5. "whyThisMatters" must combine: a) what the topic targets, b) why it fits this business, c) calendar status / scheduled date when present, d) any caveats from brand-fit notes, e) a short H2 preview from h2_seeds_from_dataforseo (when available, prefix with "Suggested H2 topics: …").
6. "actionStep" must be a concrete next step (e.g. "Generate now from the calendar", "Approve to calendar then generate", "Run the Blog Repair tool").

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
      const datedHint = r.scheduledDate ? ` · scheduled ${r.scheduledDate}` : "";
      return buildSuggestion(
        r,
        typeof x.whyThisMatters === "string"
          ? x.whyThisMatters
          : `${r.keyword} — ${
              r.pool === "scheduled"
                ? `queued${datedHint}`
                : r.pool === "new_opportunity"
                ? "approved keyword awaiting blog"
                : "published blog that could be refreshed"
            }.`,
        typeof x.actionStep === "string"
          ? x.actionStep
          : r.pool === "scheduled"
          ? "Open Calendar and click Generate Blog."
          : r.pool === "new_opportunity"
          ? "Add to Calendar from the keyword card, then generate."
          : "Use Blog Repair, or update content manually.",
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
    const funnel = (r: BlogCandidate) => funnelStage(r.intent, r.keyword);
    return {
      summary: fallbackSummary,
      suggestions: limited.map(r => {
        const stage = funnel(r);
        const h2Preview =
          r.secondaryKeywords.length > 0
            ? ` Suggested H2 topics: ${r.secondaryKeywords.slice(0, 4).join(", ")}.`
            : "";
        const datedHint = r.scheduledDate ? ` (scheduled ${r.scheduledDate}, status ${r.calendarStatus})` : "";
        const rankChance = clamp(Math.round(0.55 * r.score + 0.45 * (100 - (r.kd || 45))));
        return {
          id: r.id,
          keyword: r.keyword,
          source: r.source,
          score: r.score,
          metrics: { volume: r.volume, kd: r.kd, cpc: r.cpc ?? 0, intent: r.intent },
          trafficType:
            stage === "BOFU"
              ? "high-intent conversion traffic"
              : stage === "MOFU"
              ? "comparison and consideration traffic"
              : "top-of-funnel informational traffic",
          estimatedMonthlyTraffic: Math.max(
            0,
            Math.round(r.volume * (stage === "BOFU" ? 0.12 : stage === "MOFU" ? 0.16 : 0.2) * (rankChance / 100))
          ),
          rankingChance: rankChance,
          funnelStage: stage,
          whyThisMatters: `${r.keyword}${datedHint} — ${
            r.pool === "scheduled" ? "queued" : r.pool === "new_opportunity" ? "new opportunity" : "existing post"
          }.${h2Preview}`,
          actionStep:
            r.pool === "scheduled"
              ? "Open Calendar and click Generate Blog."
              : r.pool === "new_opportunity"
              ? "Add to Calendar, then generate."
              : "Use Blog Repair to refresh.",
          lowCompetition: r.lowCompetition,
          longTail: r.longTail,
        };
      }),
    };
  }
}

// ─── Main export ───────────────────────────────────────────────────────────

export async function runBlogAgent(context: AIContext, prompt: string): Promise<ContextualAgentOutput> {
  // ── Mode 1: Date-specific question ────────────────────────────────────────
  const isoDate = extractRequestedDate(prompt);
  if (isoDate) {
    return dateAnswer(context, isoDate);
  }

  // ── Mode 2: Strategy question ────────────────────────────────────────────
  const candidates = buildBlogCandidates(context);

  if (!candidates.length) {
    return buildOutput(
      context,
      "No blog candidates yet. Approve some keywords on the Keywords page or schedule entries on the Calendar — then I can suggest what to write and preview the outline.",
      [],
      blogActions()
    );
  }

  const scheduledCount = candidates.filter(c => c.pool === "scheduled").length;
  const newCount = candidates.filter(c => c.pool === "new_opportunity").length;
  const improveCount = candidates.filter(c => c.pool === "improve").length;

  const fallbackSummary =
    `Found ${candidates.length} blog candidate(s): ` +
    [
      scheduledCount ? `${scheduledCount} queued` : "",
      newCount ? `${newCount} new opportunit${newCount === 1 ? "y" : "ies"}` : "",
      improveCount ? `${improveCount} could be refreshed` : "",
    ]
      .filter(Boolean)
      .join(", ") +
    ". Full generation enriches H2s with Ahrefs matching terms and Serper PAA.";

  const enriched = await addBlogReasoningWithLLM(context, prompt, candidates, fallbackSummary);

  return buildOutput(context, enriched.summary, enriched.suggestions, blogActions());
}
