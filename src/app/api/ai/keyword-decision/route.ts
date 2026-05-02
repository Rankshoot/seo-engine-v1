import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { runContextualAgent } from "@/features/ai-assistant/agent/contextualAgent";
import type { AIContext, ContextualAgentRequestBody } from "@/features/ai-assistant/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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
        secondary_keywords: [],
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
        secondary_keywords: [],
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
    .select("id, niche, target_audience, target_region")
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
  const context: AIContext = {
    projectId,
    page: body.page ?? body.context?.page ?? "keywords",
    keywords: cleanKeywords(body.context?.keywords ?? []),
    competitorKeywords: cleanCompetitorKeywords(body.context?.competitorKeywords ?? []),
    contentGaps: cleanContentGaps(body.context?.contentGaps ?? []),
    calendarData: cleanCalendarData(body.context?.calendarData ?? []),
    blogs: [],
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
    },
  };

  const result = await runContextualAgent(context, stringOrEmpty(body.prompt));
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
