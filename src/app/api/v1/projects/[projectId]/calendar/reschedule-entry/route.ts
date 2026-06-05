import { currentUser } from "@clerk/nextjs/server";
import { rescheduleCalendarEntryToDate } from "@/server/calendar/reschedule-calendar-entry";
import { apiJson } from "@/server/http/json";
import { validateReschedulePayload, invalidateCalendarCache } from "@/utils/calendar-validation";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const startTime = Date.now();
  let userId = "anonymous";
  const { projectId } = await params;
  let success = false;

  try {
    const user = await currentUser();
    if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
    userId = user.id;

    let bodyObj: unknown;
    try {
      const raw = await req.text();
      if (!raw?.trim()) {
        return apiJson({ success: false, error: "Request body is required" }, { status: 400 });
      }
      bodyObj = JSON.parse(raw);
    } catch {
      return apiJson({ success: false, error: "Malformed JSON body" }, { status: 400 });
    }

    const payloadResult = validateReschedulePayload(bodyObj);
    if (!payloadResult.success) {
      return apiJson({ success: false, error: payloadResult.error }, { status: 400 });
    }

    const { entryId, date } = payloadResult.data;
    const result = await rescheduleCalendarEntryToDate(projectId, entryId, date);
    
    if (result.success) {
      success = true;
      invalidateCalendarCache();
    }
    
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch (e) {
    console.error("[calendar/reschedule-entry]", e);
    return apiJson(
      {
        success: false,
        error: e instanceof Error ? e.message : "Failed to reschedule calendar entry",
      },
      { status: 500 }
    );
  } finally {
    const duration = Date.now() - startTime;
    console.log(
      `[Telemetry] POST /api/v1/projects/${projectId}/calendar/reschedule-entry: userId=${userId} duration=${duration}ms success=${success}`
    );
  }
}
