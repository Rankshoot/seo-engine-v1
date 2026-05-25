import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { deterministicFunnelStage } from "@/lib/keyword-funnel";
import type { CalendarEntry } from "@/lib/types";

function localDayISOFromOffset(daysFromToday: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function nextVacantDate(projectId: string, preferredDate?: string): Promise<string | null> {
  const { data: rows } = await supabaseAdmin
    .from("calendar_entries")
    .select("scheduled_date")
    .eq("project_id", projectId);
  const taken = new Set((rows ?? []).map((r) => String(r.scheduled_date).slice(0, 10)));

  if (preferredDate) {
    const d = String(preferredDate).slice(0, 10);
    if (!taken.has(d)) return d;
  }

  for (let i = 0; i < 500; i++) {
    const key = localDayISOFromOffset(i);
    if (!taken.has(key)) return key;
  }
  return null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export interface AddCustomKeywordInput {
  projectId: string;
  keyword: string;
  /** Optional blog title override. Defaults to the keyword. */
  title?: string;
  /** Article type, e.g. "How-to Guide". Defaults to "Blog Post". */
  articleType?: string;
  /** Writer notes / extra instructions stored on the calendar row (passed to LLM). */
  writerNotes?: string;
  /** Pre-selected date from grid click; falls back to next vacant date. */
  targetDate?: string;
}

export async function addCustomKeywordToCalendar(
  input: AddCustomKeywordInput
): Promise<
  | { success: true; data: CalendarEntry; scheduled_date: string }
  | { success: false; error: string }
> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const kw = input.keyword.trim();
  if (!kw) return { success: false, error: "Keyword is required" };

  const { data: project, error: pErr } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", input.projectId)
    .eq("user_id", user.id)
    .single();

  if (pErr || !project) return { success: false, error: "Project not found" };

  const normKw = (s: string) => s.toLowerCase().trim();

  const { data: existing } = await supabaseAdmin
    .from("calendar_entries")
    .select("id, scheduled_date, focus_keyword")
    .eq("project_id", input.projectId)
    .ilike("focus_keyword", kw.replace(/[%_]/g, "\\$&"));

  const dup = (existing ?? []).find(
    (e) => normKw(e.focus_keyword as string) === normKw(kw)
  );
  if (dup) {
    return {
      success: false,
      error: `"${kw}" is already on the calendar for ${String(dup.scheduled_date).slice(0, 10)}.`,
    };
  }

  const scheduledDate = await nextVacantDate(input.projectId, input.targetDate);
  if (!scheduledDate) return { success: false, error: "No free calendar date found" };

  const titleToUse = (input.title ?? kw).trim().slice(0, 200) || kw;
  const articleType = input.articleType ?? "Blog Post";
  const writerNotes = input.writerNotes?.trim() ?? "";

  const today = localDayISOFromOffset(0);
  if (scheduledDate < today) {
    return { success: false, error: "Target date is in the past" };
  }

  /* Upsert into `keywords` so the calendar row can link to it */
  let keywordId: string | null = null;
  const { data: existingKw } = await supabaseAdmin
    .from("keywords")
    .select("id")
    .eq("project_id", input.projectId)
    .ilike("keyword", kw.replace(/[%_]/g, "\\$&"))
    .maybeSingle();

  if (existingKw) {
    keywordId = existingKw.id as string;
  } else {
    const res = await supabaseAdmin
      .from("keywords")
      .insert({
        project_id: input.projectId,
        keyword: kw,
        status: "approved",
        secondary_keywords: [],
        source_type: "manual",
        funnel_stage: deterministicFunnelStage("", kw),
      })
      .select("id")
      .single();

    let newKw = res.data;
    const insErr = res.error;

    if (insErr && insErr.message.includes("funnel_stage") && insErr.message.includes("schema cache")) {
      const retryRes = await supabaseAdmin
        .from("keywords")
        .insert({
          project_id: input.projectId,
          keyword: kw,
          status: "approved",
          secondary_keywords: [],
          source_type: "manual",
        })
        .select("id")
        .single();
      newKw = retryRes.data;
    }

    if (newKw) keywordId = newKw.id as string;
  }

  const { data, error } = await supabaseAdmin
    .from("calendar_entries")
    .insert({
      project_id: input.projectId,
      keyword_id: keywordId,
      scheduled_date: scheduledDate,
      title: titleToUse,
      article_type: articleType,
      slug: slugify(kw),
      focus_keyword: kw,
      secondary_keywords: [],
      status: "scheduled",
      ...(writerNotes ? { content_health_audit: { writer_notes: writerNotes } } : {}),
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as CalendarEntry, scheduled_date: scheduledDate };
}
