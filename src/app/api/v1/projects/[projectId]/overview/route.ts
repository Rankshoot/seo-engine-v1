import { currentUser } from "@clerk/nextjs/server";
import { getProjectSiteExplorerSnapshot } from "@/app/actions/project-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) {
    return apiJson({ success: false, error: "Not authenticated", data: null, trace: [] }, { status: 401 });
  }
  const { projectId } = await params;
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
  const result = await getProjectSiteExplorerSnapshot(projectId, { force });
  return apiJson(result, { status: result.success ? 200 : 404 });
}
