import { currentUser } from "@clerk/nextjs/server";
import { addKeywordToCalendarOnDate } from "@/app/actions/calendar-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId } = await params;
  try {
    const body = (await req.json()) as {
      keywordId: string;
      date: string;
      contentHealthAudit?: Record<string, unknown> | null;
    };
    if (!body.keywordId || !body.date) {
      return apiJson({ success: false, error: "Expected { keywordId, date, contentHealthAudit? }" }, { status: 400 });
    }
    const result = await addKeywordToCalendarOnDate(body.keywordId, projectId, body.date, {
      contentHealthAudit: body.contentHealthAudit,
    });
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
}
