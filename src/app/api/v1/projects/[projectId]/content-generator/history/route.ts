import { currentUser } from "@clerk/nextjs/server";
import { getContentGeneratorHistoryForProject } from "@/app/actions/blog-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated", data: [] }, { status: 401 });
  const { projectId } = await params;
  const result = await getContentGeneratorHistoryForProject(projectId);
  return apiJson(result, { status: result.success ? 200 : 500 });
}
