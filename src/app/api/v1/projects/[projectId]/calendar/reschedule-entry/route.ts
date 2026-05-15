import { currentUser } from "@clerk/nextjs/server";
import { rescheduleCalendarEntryToDate } from "@/server/calendar/reschedule-calendar-entry";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });

  const { projectId } = await params;

  let body: { entryId?: string; date?: string };
  try {
    const raw = await req.text();
    if (!raw?.trim()) {
      return apiJson({ success: false, error: "Request body is required" }, { status: 400 });
    }
    body = JSON.parse(raw) as { entryId?: string; date?: string };
  } catch {
    return apiJson({ success: false, error: "Malformed JSON body" }, { status: 400 });
  }

  if (!body.entryId || !body.date) {
    return apiJson({ success: false, error: "Expected { entryId, date }" }, { status: 400 });
  }

  try {
    const result = await rescheduleCalendarEntryToDate(projectId, body.entryId, body.date);
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
  }
}
