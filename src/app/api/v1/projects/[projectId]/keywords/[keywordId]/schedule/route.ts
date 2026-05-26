import { currentUser } from "@clerk/nextjs/server";
import { scheduleKeyword } from "@/app/actions/keyword-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string; keywordId: string }> }
) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });

  const { projectId, keywordId } = await params;
  try {
    const body = await req.json();
    const result = await scheduleKeyword(projectId, keywordId, body);
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch (e) {
    console.error("[POST /projects/:projectId/keywords/:keywordId/schedule]", e);
    return apiJson(
      { success: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
