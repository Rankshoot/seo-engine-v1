import { currentUser } from "@clerk/nextjs/server";
import { refreshProjectSiteExplorerSnapshot } from "@/app/actions/project-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) {
    return apiJson({ success: false, error: "Not authenticated", data: null, trace: [] }, { status: 401 });
  }
  const { projectId } = await params;
  const result = await refreshProjectSiteExplorerSnapshot(projectId);
  return apiJson(result, { status: result.success ? 200 : 404 });
}
