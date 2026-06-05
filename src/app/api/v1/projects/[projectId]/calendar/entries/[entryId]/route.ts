import { currentUser } from "@clerk/nextjs/server";
import { vacateCalendarSlot } from "@/app/actions/calendar-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ projectId: string; entryId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId, entryId } = await params;
  const result = await vacateCalendarSlot({ entryId, projectId });
  return apiJson(result, { status: result.success ? 200 : 500 });
}
