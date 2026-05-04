import { currentUser } from "@clerk/nextjs/server";
import { loadMoreKeywords } from "@/app/actions/keyword-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated", data: [], total: 0 }, { status: 401 });
  const { projectId } = await params;
  try {
    const body = (await req.json()) as { offset: number; limit?: number };
    const result = await loadMoreKeywords(projectId, body.offset, body.limit);
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch {
    return apiJson({ success: false, error: "Invalid JSON (expected { offset, limit? })" }, { status: 400 });
  }
}
