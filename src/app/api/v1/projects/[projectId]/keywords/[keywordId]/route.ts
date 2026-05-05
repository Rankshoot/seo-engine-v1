import { currentUser } from "@clerk/nextjs/server";
import { deleteKeyword } from "@/app/actions/keyword-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ projectId: string; keywordId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { keywordId } = await params;
  const result = await deleteKeyword(keywordId);
  return apiJson(result, { status: result.success ? 200 : 404 });
}
