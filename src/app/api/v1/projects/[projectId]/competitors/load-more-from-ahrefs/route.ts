import { currentUser } from "@clerk/nextjs/server";
import { loadMoreCompetitorGapsFromAhrefs } from "@/app/actions/competitor-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId } = await params;
  const result = await loadMoreCompetitorGapsFromAhrefs(projectId);
  return apiJson(result, { status: result.success ? 200 : 400 });
}
