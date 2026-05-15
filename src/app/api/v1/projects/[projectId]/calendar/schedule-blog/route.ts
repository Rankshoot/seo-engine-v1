import { currentUser } from "@clerk/nextjs/server";
import { scheduleExistingBlog } from "@/server/calendar/schedule-existing-blog";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });

  const { projectId } = await params;

  let body: { blogId?: string; targetDate?: string; source?: string };
  try {
    const raw = await req.text();
    if (!raw?.trim()) {
      return apiJson({ success: false, error: "Request body is required" }, { status: 400 });
    }
    body = JSON.parse(raw) as typeof body;
  } catch {
    return apiJson({ success: false, error: "Malformed JSON body" }, { status: 400 });
  }

  if (!body.blogId?.trim() || !body.targetDate?.trim()) {
    return apiJson(
      { success: false, error: "Expected { blogId, targetDate }" },
      { status: 400 },
    );
  }

  try {
    const result = await scheduleExistingBlog({
      projectId,
      blogId: body.blogId.trim(),
      targetDate: body.targetDate.trim(),
      source: body.source,
    });
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch (e) {
    console.error("[calendar/schedule-blog]", e);
    return apiJson(
      { success: false, error: e instanceof Error ? e.message : "Failed to schedule blog" },
      { status: 500 },
    );
  }
}
