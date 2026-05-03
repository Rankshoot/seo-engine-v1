import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { geminiGenerate } from "@/lib/gemini";
import { runContextualAgent } from "@/features/ai-assistant/agent/contextualAgent";
import { runAssistantTurn, type AssistantTurnOutput } from "@/features/ai-assistant/tools/orchestratorV2";
import type { AIContext, ContextualAgentOutput, ContextualAgentRequestBody } from "@/features/ai-assistant/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Patterns that indicate the user is asking a conversational or meta question
// rather than requesting a keyword analysis / page-specific deep-dive.
const CONVERSATIONAL_PATTERNS = [
  /^(hi|hello|hey|greetings|good\s+\w+)\b/i,
  /^(thanks|thank\s+you|cheers)\b/i,
  /^what\s+can\s+(you|this)\b/i,
  /^(who|what|how)\s+(are|is)\s+you\b/i,
  /^tell\s+me\s+about\s+yourself\b/i,
  /^(help|what\s+do\s+you\s+do|what\s+does\s+this\s+do)\b/i,
  /^(describe|explain|give\s+me\s+an?\s+overview|overview|summarize)\s*(this|the\s+page|yourself)?\b/i,
  /^can\s+you\s+(help|explain|tell|give)\b/i,
  /^(what\s+(is|are)\s+this|what\s+page\s+is\s+this)\b/i,
];

// Patterns that ask about the user's own project / business / brand context.
// These should be answered conversationally from `businessContext` — never
// trigger keyword discovery.
const PROJECT_INFO_PATTERNS = [
  /\b(my|our|the)\s+(business\s+brief|brief|niche|audience|company|domain|business|brand|project|product|target\s+region|region)\b/i,
  /\b(business\s+brief|company\s+overview|project\s+overview|business\s+overview)\b/i,
  /\bwhat\s+(is|are|do|does)\s+(my|our|the)\s+(brief|niche|audience|domain|company|business|brand|project|competitors?)\b/i,
  /\b(who\s+(am|are)\s+(i|we))\b/i,
  /\bwho\s+is\s+(my|our|the)\s+(audience|target|competitor)/i,
  /\b(list|show|tell)\s+me\s+(my|our|the)\s+(competitors?|audience|brief|niche|products?)\b/i,
  /\bwhat'?s?\s+(my|our|the)\s+(brief|niche|audience|domain|company|brand|business|project|competitor|region)\b/i,
];

function isConversational(prompt: string): boolean {
  const trimmed = prompt.trim();
  return CONVERSATIONAL_PATTERNS.some(p => p.test(trimmed));
}

function isProjectInfoQuery(prompt: string): boolean {
  return PROJECT_INFO_PATTERNS.some(p => p.test(prompt));
}

/**
 * Answer a question about the user's project (brief, niche, audience,
 * competitors, etc.) from `businessContext` — no keyword analysis.
 */
async function buildProjectInfoResponse(
  context: AIContext,
  prompt: string
): Promise<ContextualAgentOutput> {
  const niche = context.businessContext.niche || "(not set)";
  const audience = context.businessContext.audience || "(not set)";
  const region = context.businessContext.region || "us";
  const projectDomain = context.businessContext.projectDomain || "(not set)";
  const competitorDomains = context.businessContext.competitorDomains ?? [];
  const brief = context.businessContext.businessBrief || "";

  // Truncate the brief to keep the LLM prompt focused.
  const briefForPrompt = brief.slice(0, 2400);

  const systemPrompt = `You are a friendly assistant inside SerpCraft. The user is asking about their OWN project / business — not for keyword suggestions. Answer in plain conversational text using only the data below. Do NOT recommend keywords unless they explicitly asked for keywords.

Project data:
- Domain: ${projectDomain}
- Niche: ${niche}
- Target audience: ${audience}
- Target region: ${region}
- Competitors: ${competitorDomains.length ? competitorDomains.join(", ") : "(none configured)"}
- Business brief (raw, may include JSON):
${briefForPrompt || "(no brief saved yet — the user can refresh it from the project)"}

User asked: "${prompt}"

Rules:
1. Answer the user's specific question about their project in 2–5 sentences (or a short bullet list if they asked to "list" something).
2. Pull values from the data above. NEVER invent niche, audience, products, or competitor names.
3. If the brief is empty, say so plainly and tell them they can refresh the brief from the project header.
4. Plain conversational text only — no JSON, no SEO advice unless asked.
5. End with a single short follow-up offer (e.g. "Want me to find keywords that match this audience?") to keep the conversation natural.`;

  try {
    const reply = await geminiGenerate(systemPrompt, 1);
    const summary =
      reply.trim() ||
      `Your project targets **${niche}** for **${audience}** in **${region.toUpperCase()}**, on domain **${projectDomain}**. Competitors: ${competitorDomains.join(", ") || "(none)"}.`;
    return {
      page: context.page,
      summary,
      suggestions: [],
      actions: [],
      filters: {
        suggestedKeywordIds: [],
        suggestedGapKeywords: [],
        lowCompetitionKeywordIds: [],
        longTailKeywordIds: [],
      },
    };
  } catch {
    return {
      page: context.page,
      summary: `Here's what I know about your project:\n\n• **Domain**: ${projectDomain}\n• **Niche**: ${niche}\n• **Audience**: ${audience}\n• **Region**: ${region.toUpperCase()}\n• **Competitors**: ${competitorDomains.join(", ") || "(none configured)"}\n\nWant me to find keywords that match this audience?`,
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
}

async function buildConversationalResponse(context: AIContext, prompt: string): Promise<ContextualAgentOutput> {
  const pageDescriptions: Record<string, string> = {
    keywords: "discover and analyse keyword opportunities, filter by competition level, identify long-tail targets, and apply AI-powered recommendations to your keyword table",
    competitors: "analyse competitor keyword gaps, surface untapped content opportunities, and compare your coverage against rival domains",
    calendar: "plan and schedule your content calendar by filling empty slots with the highest-upside keywords",
    blogs: "suggest which blog posts to create next, identify content that needs SEO improvement, and flag old articles for a refresh",
    audit: "identify the highest-severity content health issues, prioritise pages for repair, and track your site's content quality over time",
  };

  const pageCapability = pageDescriptions[context.page] ?? "help you with your SEO strategy";
  const systemPrompt = `You are a friendly, knowledgeable SEO assistant embedded inside SerpCraft, an SEO content platform.

Context:
- Current page: ${context.page}
- Project niche: ${context.businessContext.niche || "not specified"}
- Target audience: ${context.businessContext.audience || "not specified"}
- Region: ${context.businessContext.region || "US"}

The user is on the "${context.page}" page and asked: "${prompt}"

Respond naturally in 2-4 sentences. Be warm, helpful, and specific to the current page.
- If they ask what you can do: explain you can ${pageCapability}.
- If they greet you: greet back and mention one or two things you can help with on this page.
- If they ask for an overview: briefly explain what the ${context.page} page is for and offer to help.
- For any other conversational question: answer helpfully and concisely with the page context in mind.

Do NOT return JSON. Write plain conversational text only. No bullet lists, no markdown headers.`;

  try {
    const reply = await geminiGenerate(systemPrompt, 1);
    const summary = reply.trim() || `I'm your AI assistant on the ${context.page} page. I can help you ${pageCapability}. Just ask!`;
    return {
      page: context.page,
      summary,
      suggestions: [],
      actions: [],
      filters: {
        suggestedKeywordIds: [],
        suggestedGapKeywords: [],
        lowCompetitionKeywordIds: [],
        longTailKeywordIds: [],
      },
    };
  } catch {
    return {
      page: context.page,
      summary: `I'm your AI assistant for the ${context.page} page. I can help you ${pageCapability}. What would you like to know?`,
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
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanKeywords(value: unknown): AIContext["keywords"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row): AIContext["keywords"][number] | null => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const keyword = stringOrEmpty(r.keyword);
      if (!keyword) return null;
      const statusRaw = stringOrEmpty(r.status);
      return {
        id: stringOrEmpty(r.id),
        keyword,
        volume: typeof r.volume === "number" ? r.volume : Number(r.volume ?? 0) || 0,
        kd: typeof r.kd === "number" ? r.kd : Number(r.kd ?? 0) || 0,
        cpc: typeof r.cpc === "number" ? r.cpc : Number(r.cpc ?? 0) || 0,
        intent: stringOrEmpty(r.intent) || null,
        trend: stringOrEmpty(r.trend),
        status:
          statusRaw === "approved" || statusRaw === "rejected" || statusRaw === "pending"
            ? statusRaw
            : "pending",
        source_type: stringOrEmpty(r.source_type) || null,
        project_id: "",
        monthly_searches: [],
        secondary_keywords: Array.isArray(r.secondary_keywords)
          ? (r.secondary_keywords as unknown[])
              .filter((s): s is string => typeof s === "string")
              .slice(0, 12)
          : [],
        ai_score: 0,
        created_at: "",
      };
    })
    .filter((row): row is AIContext["keywords"][number] => row !== null)
    .slice(0, 80);
}

function cleanCompetitorKeywords(value: unknown): AIContext["competitorKeywords"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x): AIContext["competitorKeywords"][number] | null => {
      if (typeof x === "string") {
        const keyword = x.trim();
        if (!keyword) return null;
        return {
          id: "",
          competitor_id: "",
          project_id: "",
          keyword,
          kind: "primary",
          freq: 0,
          source_url: "",
          source_title: "",
          created_at: "",
        };
      }
      if (!x || typeof x !== "object") return null;
      const r = x as Record<string, unknown>;
      const keyword = stringOrEmpty(r.keyword);
      if (!keyword) return null;
      return {
        id: stringOrEmpty(r.id),
        competitor_id: stringOrEmpty(r.competitor_id),
        project_id: stringOrEmpty(r.project_id),
        keyword,
        kind: "primary",
        freq: typeof r.freq === "number" ? r.freq : Number(r.freq ?? 0) || 0,
        source_url: stringOrEmpty(r.source_url),
        source_title: stringOrEmpty(r.source_title),
        created_at: stringOrEmpty(r.created_at),
      };
    })
    .filter((row): row is AIContext["competitorKeywords"][number] => row !== null)
    .slice(0, 100);
}

function cleanContentGaps(value: unknown): AIContext["contentGaps"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x): AIContext["contentGaps"][number] | null => {
      if (!x || typeof x !== "object") return null;
      const r = x as Record<string, unknown>;
      const keyword = stringOrEmpty(r.keyword);
      if (!keyword) return null;
      return {
        id: stringOrEmpty(r.id),
        project_id: stringOrEmpty(r.project_id),
        keyword,
        gap_type:
          r.gap_type === "missing" || r.gap_type === "weak" || r.gap_type === "untapped"
            ? r.gap_type
            : "missing",
        opportunity_score:
          typeof r.opportunity_score === "number" ? r.opportunity_score : Number(r.opportunity_score ?? 0) || 0,
        volume: typeof r.volume === "number" ? r.volume : Number(r.volume ?? 0) || 0,
        kd: typeof r.kd === "number" ? r.kd : Number(r.kd ?? 0) || 0,
        trend: stringOrEmpty(r.trend),
        trend_pct: typeof r.trend_pct === "number" ? r.trend_pct : Number(r.trend_pct ?? 0) || 0,
        competitor_weakness:
          typeof r.competitor_weakness === "number" ? r.competitor_weakness : Number(r.competitor_weakness ?? 0) || 0,
        top_competitor_domain: stringOrEmpty(r.top_competitor_domain),
        top_competitor_url: stringOrEmpty(r.top_competitor_url),
        reasoning: stringOrEmpty(r.reasoning),
        created_at: stringOrEmpty(r.created_at),
        updated_at: stringOrEmpty(r.updated_at),
      };
    })
    .filter((row): row is AIContext["contentGaps"][number] => row !== null)
    .slice(0, 80);
}

function cleanDomainKeywords(value: unknown): AIContext["domainKeywords"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x): AIContext["domainKeywords"][number] | null => {
      if (!x || typeof x !== "object") return null;
      const r = x as Record<string, unknown>;
      const keyword = stringOrEmpty(r.keyword);
      if (!keyword) return null;
      const intentRaw = stringOrEmpty(r.intent).toLowerCase();
      const intent = (intentRaw === "informational" || intentRaw === "navigational" || intentRaw === "commercial" || intentRaw === "transactional"
        ? intentRaw
        : "informational") as AIContext["domainKeywords"][number]["intent"];
      return {
        keyword,
        volume: typeof r.volume === "number" ? r.volume : Number(r.volume ?? 0) || 0,
        kd: typeof r.kd === "number" ? r.kd : Number(r.kd ?? 0) || 0,
        cpc: typeof r.cpc === "number" ? r.cpc : Number(r.cpc ?? 0) || 0,
        intent,
        competitor_position: 0,
        competitor_url: stringOrEmpty(r.competitor_url),
      };
    })
    .filter((row): row is AIContext["domainKeywords"][number] => row !== null)
    .slice(0, 80);
}

function cleanCalendarData(value: unknown): AIContext["calendarData"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x): AIContext["calendarData"][number] | null => {
      if (!x || typeof x !== "object") return null;
      const r = x as Record<string, unknown>;
      const focusKeyword = stringOrEmpty(r.focus_keyword);
      if (!focusKeyword) return null;
      return {
        id: stringOrEmpty(r.id),
        project_id: stringOrEmpty(r.project_id),
        keyword_id: stringOrEmpty(r.keyword_id) || null,
        scheduled_date: stringOrEmpty(r.scheduled_date),
        title: stringOrEmpty(r.title),
        article_type: stringOrEmpty(r.article_type),
        slug: stringOrEmpty(r.slug),
        focus_keyword: focusKeyword,
        secondary_keywords: Array.isArray(r.secondary_keywords)
          ? (r.secondary_keywords as unknown[])
              .filter((s): s is string => typeof s === "string")
              .slice(0, 12)
          : [],
        status:
          r.status === "scheduled" ||
          r.status === "generating" ||
          r.status === "generated" ||
          r.status === "downloaded" ||
          r.status === "published" ||
          r.status === "approved"
            ? r.status
            : "scheduled",
        created_at: stringOrEmpty(r.created_at),
      };
    })
    .filter((row): row is AIContext["calendarData"][number] => row !== null)
    .slice(0, 120);
}

function cleanAudits(value: unknown): AIContext["audits"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x): AIContext["audits"][number] | null => {
      if (!x || typeof x !== "object") return null;
      const r = x as Record<string, unknown>;
      const url = stringOrEmpty(r.url);
      if (!url) return null;
      const severityRaw = stringOrEmpty(r.severity).toLowerCase();
      return {
        url,
        title: stringOrEmpty(r.title),
        health_score: typeof r.health_score === "number" ? r.health_score : Number(r.health_score ?? 0) || 0,
        severity: severityRaw === "high" || severityRaw === "medium" || severityRaw === "low" ? severityRaw : "low",
        primary_keyword: stringOrEmpty(r.primary_keyword),
        analysis_summary: stringOrEmpty(r.analysis_summary),
      };
    })
    .filter((row): row is AIContext["audits"][number] => row !== null)
    .slice(0, 80);
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  let body: ContextualAgentRequestBody;
  try {
    body = (await req.json()) as ContextualAgentRequestBody;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = stringOrEmpty(body.projectId);
  if (!projectId) {
    return NextResponse.json({ success: false, error: "projectId is required" }, { status: 400 });
  }

  const { data: project, error: pErr } = await supabaseAdmin
    .from("projects")
    .select("id, niche, target_audience, target_region, domain, project_competitors(domain)")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (pErr) {
    return NextResponse.json({ success: false, error: pErr.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }

  let businessBrief = stringOrEmpty(body.context?.businessContext?.businessBrief);
  if (!businessBrief) {
    const { data: briefRow } = await supabaseAdmin
      .from("project_briefs")
      .select("brief")
      .eq("project_id", projectId)
      .maybeSingle();
    if (briefRow?.brief) {
      businessBrief = JSON.stringify(briefRow.brief).slice(0, 4000);
    }
  }

  const memory = body.context?.memory;
  const projectDomain = (project.domain as string | undefined) ?? "";
  const competitorDomains = Array.isArray(
    (project as { project_competitors?: Array<{ domain?: string }> }).project_competitors
  )
    ? (project as { project_competitors: Array<{ domain?: string }> }).project_competitors
        .map(c => (c.domain ?? "").trim())
        .filter(Boolean)
    : [];

  const context: AIContext = {
    projectId,
    page: body.page ?? body.context?.page ?? "keywords",
    keywords: cleanKeywords(body.context?.keywords ?? []),
    domainKeywords: cleanDomainKeywords(body.context?.domainKeywords ?? []),
    competitorKeywords: cleanCompetitorKeywords(body.context?.competitorKeywords ?? []),
    contentGaps: cleanContentGaps(body.context?.contentGaps ?? []),
    calendarData: cleanCalendarData(body.context?.calendarData ?? []),
    blogs: [],
    audits: cleanAudits(body.context?.audits ?? []),
    businessContext: {
      niche:
        stringOrEmpty(body.context?.businessContext?.niche) ||
        stringOrEmpty(body.project?.niche) ||
        (project.niche as string) ||
        "",
      audience:
        stringOrEmpty(body.context?.businessContext?.audience) ||
        stringOrEmpty(body.project?.target_audience) ||
        (project.target_audience as string) ||
        "",
      region:
        stringOrEmpty(body.context?.businessContext?.region) ||
        stringOrEmpty(body.project?.target_region) ||
        (project.target_region as string) ||
        "us",
      businessBrief,
      projectDomain,
      competitorDomains,
    },
    memory: {
      lastAction: stringOrEmpty(memory?.lastAction) || null,
      selectedKeywordIds: Array.isArray(memory?.selectedKeywordIds)
        ? memory.selectedKeywordIds.filter((id): id is string => typeof id === "string").slice(0, 80)
        : [],
      preferredFilter:
        memory?.preferredFilter === "low_competition" ||
        memory?.preferredFilter === "long_tail" ||
        memory?.preferredFilter === "ai"
          ? memory.preferredFilter
          : "all",
      recentQueries: Array.isArray(memory?.recentQueries)
        ? memory.recentQueries.filter((q): q is string => typeof q === "string").slice(-12)
        : [],
      chatHistory: Array.isArray(memory?.chatHistory)
        ? memory.chatHistory
            .filter(
              (m): m is { role: "user" | "assistant"; text: string; page: AIContext["page"]; timestamp: string } =>
                !!m &&
                typeof m === "object" &&
                ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "assistant") &&
                typeof (m as { text?: unknown }).text === "string" &&
                typeof (m as { timestamp?: unknown }).timestamp === "string"
            )
            .map(m => ({
              role: m.role,
              text: m.text.slice(0, 500),
              page: m.page,
              timestamp: m.timestamp,
            }))
            .slice(-40)
        : [],
    },
  };

  const prompt = stringOrEmpty(body.prompt);
  const blogId = stringOrEmpty((body as { blogId?: unknown }).blogId) || undefined;
  // When the UI sends `awaitConfirmation: false`, mutating tools auto-run.
  const awaitConfirmation =
    (body as { awaitConfirmation?: boolean }).awaitConfirmation === undefined
      ? true
      : Boolean((body as { awaitConfirmation?: boolean }).awaitConfirmation);
  // Allow the UI to opt out of the new agent for debugging.
  const useToolAgent = (body as { useToolAgent?: boolean }).useToolAgent !== false;

  // Routing priority:
  //   1. Pure greeting / meta-about-the-bot → conversational reply (cheap, no tools).
  //   2. Question about the project itself (brief, niche, audience, etc.)
  //      → answer from businessContext, NEVER recommend keywords.
  //   3. Otherwise → new tool-calling orchestrator (or legacy strategist as fallback).
  let result: ContextualAgentOutput | AssistantTurnOutput;
  if (isConversational(prompt)) {
    result = await buildConversationalResponse(context, prompt);
  } else if (isProjectInfoQuery(prompt)) {
    result = await buildProjectInfoResponse(context, prompt);
  } else if (useToolAgent) {
    result = await runAssistantTurn(context, prompt, { blogId, awaitConfirmation });
  } else {
    result = await runContextualAgent(context, prompt);
  }
  return NextResponse.json({
    success: true,
    data: result,
    meta: {
      page: context.page,
      analyzed: context.keywords.length + context.contentGaps.length + context.calendarData.length,
      generatedAt: new Date().toISOString(),
    },
  });
}
