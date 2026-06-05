import { currentUser } from "@clerk/nextjs/server";
import { getCalendarEntries } from "@/app/actions/calendar-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await currentUser();
    if (!user) {
      return apiJson(
        { success: false, error: "Not authenticated", data: [] },
        { status: 401 }
      );
    }

    const { projectId } = await params;
    if (!projectId) {
      return apiJson(
        { success: false, error: "Missing projectId", data: [] },
        { status: 400 }
      );
    }

    const result = await getCalendarEntries(projectId);
    return apiJson(result, { status: result.success ? 200 : 500 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    console.error("[calendar/entries GET]", message);
    return apiJson(
      { success: false, error: message, data: [] },
      { status: 500 }
    );
  }
}
