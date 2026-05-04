import { currentUser } from "@clerk/nextjs/server";
import { approveKeywordCluster } from "@/app/actions/keyword-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated", updated: 0 }, { status: 401 });
  const { projectId } = await params;
  try {
    const body = (await req.json()) as { phrases: string[] };
    if (!Array.isArray(body.phrases)) {
      return apiJson({ success: false, error: "Expected { phrases: string[] }", updated: 0 }, { status: 400 });
    }
    const result = await approveKeywordCluster(projectId, body.phrases);
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body", updated: 0 }, { status: 400 });
  }
}
