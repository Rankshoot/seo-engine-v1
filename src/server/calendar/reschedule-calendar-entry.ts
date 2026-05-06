import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { CalendarEntry } from "@/lib/types";

function localDayISOFromOffset(daysFromToday: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromToday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Move a calendar row to another date (used by API routes — not a Server Action).
 * One entry per day per project; cannot move while `generating`.
 */
export async function rescheduleCalendarEntryToDate(
  projectId: string,
  entryId: string,
  date: string
): Promise<
  { success: true; data: CalendarEntry; rescheduled: boolean } | { success: false; error: string }
> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: project, error: pErr } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (pErr || !project) return { success: false, error: "Project not found" };

  const dateNorm = String(date).slice(0, 10);

  const { data: entry, error: eErr } = await supabaseAdmin
    .from("calendar_entries")
    .select("id, project_id, scheduled_date, keyword_id, status")
    .eq("id", entryId)
    .eq("project_id", projectId)
    .single();

  if (eErr || !entry) return { success: false, error: "Calendar entry not found" };

  if (entry.status === "generating") {
    return { success: false, error: "Cannot move an entry while it is generating" };
  }

  if (String(entry.scheduled_date).slice(0, 10) === dateNorm) {
    const { data: full } = await supabaseAdmin.from("calendar_entries").select("*").eq("id", entryId).single();
    if (!full) return { success: false, error: "Calendar entry not found" };
    return { success: true, data: full as CalendarEntry, rescheduled: false };
  }

  const today = localDayISOFromOffset(0);
  if (dateNorm < today) {
    return { success: false, error: "Cannot schedule in the past" };
  }

  const { data: conflict } = await supabaseAdmin
    .from("calendar_entries")
    .select("id")
    .eq("project_id", projectId)
    .eq("scheduled_date", dateNorm)
    .neq("id", entryId)
    .maybeSingle();

  if (conflict) {
    return { success: false, error: "Another keyword is already scheduled on this date" };
  }

  const { data, error } = await supabaseAdmin
    .from("calendar_entries")
    .update({ scheduled_date: dateNorm })
    .eq("id", entryId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as CalendarEntry, rescheduled: true };
}
