import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { CalendarEntry } from "@/lib/types";
import { isPastDate } from "@/utils/calendar-validation";

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
  const startTime = Date.now();
  let userId = "anonymous";
  let status = "failure";
  let errorMsg = "";

  try {
    const user = await currentUser();
    if (!user) {
      errorMsg = "Not authenticated";
      return { success: false, error: errorMsg };
    }
    userId = user.id;

    const { data: project, error: pErr } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (pErr || !project) {
      errorMsg = "Project not found";
      return { success: false, error: errorMsg };
    }

    const dateNorm = String(date).slice(0, 10);

    const { data: entry, error: eErr } = await supabaseAdmin
      .from("calendar_entries")
      .select("id, project_id, scheduled_date, keyword_id, status")
      .eq("id", entryId)
      .eq("project_id", projectId)
      .single();

    if (eErr || !entry) {
      errorMsg = "Calendar entry not found";
      return { success: false, error: errorMsg };
    }

    if (entry.status === "generating") {
      errorMsg = "Cannot move an entry while it is generating";
      return { success: false, error: errorMsg };
    }

    if (String(entry.scheduled_date).slice(0, 10) === dateNorm) {
      const { data: full } = await supabaseAdmin.from("calendar_entries").select("*").eq("id", entryId).single();
      if (!full) {
        errorMsg = "Calendar entry not found";
        return { success: false, error: errorMsg };
      }
      status = "success";
      return { success: true, data: full as CalendarEntry, rescheduled: false };
    }

    if (isPastDate(dateNorm)) {
      errorMsg = "Cannot schedule in the past";
      return { success: false, error: errorMsg };
    }

    const { data: conflict } = await supabaseAdmin
      .from("calendar_entries")
      .select("id")
      .eq("project_id", projectId)
      .eq("scheduled_date", dateNorm)
      .neq("id", entryId)
      .maybeSingle();

    if (conflict) {
      errorMsg = "Another keyword is already scheduled on this date";
      return { success: false, error: errorMsg };
    }

    const { data, error } = await supabaseAdmin
      .from("calendar_entries")
      .update({ scheduled_date: dateNorm })
      .eq("id", entryId)
      .select()
      .single();

    if (error) {
      errorMsg = error.message;
      return { success: false, error: errorMsg };
    }
    status = "success";
    return { success: true, data: data as CalendarEntry, rescheduled: true };
  } catch (err: unknown) {
    errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  } finally {
    const duration = Date.now() - startTime;
    console.log(
      `[Telemetry] rescheduleCalendarEntryToDate: userId=${userId} projectId=${projectId} entryId=${entryId} date=${date} duration=${duration}ms status=${status} error=${errorMsg || "none"}`
    );
  }
}
