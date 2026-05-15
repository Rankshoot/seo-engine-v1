import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { CalendarEntry } from "@/lib/types";

/**
 * Schedule an EXISTING blog (typically an Instant Article that has no calendar
 * row yet) onto a chosen date. Two cases:
 *
 *   1. blog.entry_id is null → create a new calendar_entries row with
 *      status='generated' (because the blog already exists) and patch
 *      blogs.entry_id to point at it. ai_source is set so the calendar UI can
 *      surface where the entry came from.
 *
 *   2. blog.entry_id is not null → just move the existing calendar row to the
 *      new date (effectively a reschedule). One entry per day per project.
 *
 * The flow uses the same vacant-date guard as add-custom-keyword to keep the
 * "one keyword per day per project" invariant.
 */

function localDayISOFromOffset(daysFromToday: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export interface ScheduleExistingBlogInput {
  projectId: string;
  blogId: string;
  targetDate: string;
  /** Free-text origin label stored on calendar_entries.ai_source. Default: "Instant Article". */
  source?: string;
}

export type ScheduleExistingBlogResult =
  | { success: true; data: CalendarEntry; scheduled_date: string; rescheduled: boolean }
  | { success: false; error: string };

export async function scheduleExistingBlog(
  input: ScheduleExistingBlogInput,
): Promise<ScheduleExistingBlogResult> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const dateNorm = String(input.targetDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateNorm)) {
    return { success: false, error: "Invalid date" };
  }
  const today = localDayISOFromOffset(0);
  if (dateNorm < today) return { success: false, error: "Cannot schedule in the past" };

  const { data: project, error: pErr } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", input.projectId)
    .eq("user_id", user.id)
    .single();
  if (pErr || !project) return { success: false, error: "Project not found" };

  const { data: blog, error: bErr } = await supabaseAdmin
    .from("blogs")
    .select("id, project_id, entry_id, title, target_keyword, article_type, slug, status")
    .eq("id", input.blogId)
    .eq("project_id", input.projectId)
    .maybeSingle();

  if (bErr) return { success: false, error: bErr.message };
  if (!blog) return { success: false, error: "Blog not found" };

  // Case 2: blog already linked to a calendar entry — just move the row.
  if (blog.entry_id) {
    const { data: existingEntry } = await supabaseAdmin
      .from("calendar_entries")
      .select("id, scheduled_date, status")
      .eq("id", blog.entry_id)
      .maybeSingle();

    if (!existingEntry) {
      // Stale FK; fall through to create a fresh entry.
    } else {
      if (existingEntry.status === "generating") {
        return { success: false, error: "Cannot move an entry while it is generating" };
      }
      if (String(existingEntry.scheduled_date).slice(0, 10) === dateNorm) {
        const { data: full } = await supabaseAdmin
          .from("calendar_entries").select("*").eq("id", blog.entry_id).single();
        if (!full) return { success: false, error: "Calendar entry not found" };
        return { success: true, data: full as CalendarEntry, scheduled_date: dateNorm, rescheduled: false };
      }
      const { data: conflict } = await supabaseAdmin
        .from("calendar_entries")
        .select("id")
        .eq("project_id", input.projectId)
        .eq("scheduled_date", dateNorm)
        .neq("id", blog.entry_id)
        .maybeSingle();
      if (conflict) {
        return { success: false, error: "Another keyword is already scheduled on this date" };
      }
      const { data: moved, error: uErr } = await supabaseAdmin
        .from("calendar_entries")
        .update({ scheduled_date: dateNorm })
        .eq("id", blog.entry_id)
        .select()
        .single();
      if (uErr || !moved) return { success: false, error: uErr?.message ?? "Failed to move entry" };
      return { success: true, data: moved as CalendarEntry, scheduled_date: dateNorm, rescheduled: true };
    }
  }

  // Case 1: no entry_id yet — block if the chosen date is already taken.
  const { data: conflict } = await supabaseAdmin
    .from("calendar_entries")
    .select("id")
    .eq("project_id", input.projectId)
    .eq("scheduled_date", dateNorm)
    .maybeSingle();
  if (conflict) {
    return { success: false, error: "Another keyword is already scheduled on this date" };
  }

  // Reuse the existing keyword if we can; otherwise spin up an anchor keyword.
  let keywordId: string | null = null;
  const kw = (blog.target_keyword as string | null)?.trim() || (blog.title as string).trim();
  if (kw) {
    const { data: existingKw } = await supabaseAdmin
      .from("keywords")
      .select("id")
      .eq("project_id", input.projectId)
      .ilike("keyword", kw.replace(/[%_]/g, "\\$&"))
      .maybeSingle();
    if (existingKw) {
      keywordId = existingKw.id as string;
    } else {
      const { data: newKw } = await supabaseAdmin
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
      if (newKw) keywordId = newKw.id as string;
    }
  }

  const articleType = (blog.article_type as string | null)?.trim() || "Blog Post";
  const slugBase = (blog.slug as string | null)?.trim() || slugify(kw || (blog.title as string));
  // Calendar row is born `generated` because the draft already exists.
  // BlogStatus and CalendarStatus share the same vocabulary for this value.
  const calendarStatus = "generated";

  const { data: entry, error: insErr } = await supabaseAdmin
    .from("calendar_entries")
    .insert({
      project_id: input.projectId,
      keyword_id: keywordId,
      scheduled_date: dateNorm,
      title: blog.title as string,
      article_type: articleType,
      slug: slugBase,
      focus_keyword: kw || (blog.title as string),
      secondary_keywords: [],
      status: calendarStatus,
      ai_source: input.source?.trim() || "Instant Article",
    })
    .select()
    .single();

  if (insErr || !entry) {
    return { success: false, error: insErr?.message ?? "Failed to create calendar entry" };
  }

  // Link the blog to the new calendar row so the calendar can deep-link back.
  const { error: linkErr } = await supabaseAdmin
    .from("blogs")
    .update({ entry_id: (entry as CalendarEntry).id })
    .eq("id", input.blogId);

  if (linkErr) {
    // Roll back the calendar entry to keep state consistent.
    await supabaseAdmin.from("calendar_entries").delete().eq("id", (entry as CalendarEntry).id);
    return { success: false, error: linkErr.message };
  }

  return { success: true, data: entry as CalendarEntry, scheduled_date: dateNorm, rescheduled: false };
}
