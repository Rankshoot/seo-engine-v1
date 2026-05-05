import { currentUser } from "@clerk/nextjs/server";
import { generateCalendar } from "@/app/actions/calendar-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId } = await params;
  try {
    const body = (await req.json()) as { startDate: string };
    if (!body.startDate) return apiJson({ success: false, error: "Expected { startDate }" }, { status: 400 });
    const result = await generateCalendar(projectId, body.startDate);
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
}
