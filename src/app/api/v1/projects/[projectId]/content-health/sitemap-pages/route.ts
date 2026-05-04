import { currentUser } from "@clerk/nextjs/server";
import { getAllSitemapPages } from "@/app/actions/audit-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) {
    return apiJson({ success: false, error: "Not authenticated", pages: [], basePaths: [], total: 0 }, { status: 401 });
  }
  const { projectId } = await params;
  const url = new URL(req.url);
  const basePath = url.searchParams.get("basePath") ?? undefined;
  const result = await getAllSitemapPages(projectId, basePath);
  return apiJson(result, { status: result.success ? 200 : 400 });
}
