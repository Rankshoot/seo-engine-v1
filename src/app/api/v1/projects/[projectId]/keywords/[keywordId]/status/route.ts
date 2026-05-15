import { currentUser } from "@clerk/nextjs/server";
import { updateKeywordStatus } from "@/app/actions/keyword-actions";
import type { KeywordStatus } from "@/lib/types";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ projectId: string; keywordId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId, keywordId } = await params;
  try {
    const body = (await req.json()) as { status: KeywordStatus };
    if (!body.status) return apiJson({ success: false, error: "Expected { status }" }, { status: 400 });
    const result = await updateKeywordStatus(keywordId, body.status, projectId);
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch (e) {
    console.error("[PATCH /keywords/:id/status]", e);
    return apiJson(
      { success: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
