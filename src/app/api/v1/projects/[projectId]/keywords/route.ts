import { currentUser } from "@clerk/nextjs/server";
import {
  deleteAllKeywords,
  discoverKeywords,
  getKeywords,
  refreshKeywordIntentsWithGemini,
  runKeywordDiscoveryPipeline,
} from "@/app/actions/keyword-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) {
    return apiJson({ success: false, error: "Not authenticated", data: [], total: 0 }, { status: 401 });
  }
  const { projectId } = await params;
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit");
  const offset = url.searchParams.get("offset");
  const includeApproved = url.searchParams.get("includeApproved");
  const result = await getKeywords(projectId, {
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
    includeApproved: includeApproved === "0" || includeApproved === "false" ? false : undefined,
  });
  return apiJson(result, { status: result.success ? 200 : 500 });
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId } = await params;
  try {
    const body = (await req.json()) as { action?: string; topN?: number };
    const action = body.action;
    if (!action || typeof action !== "string") {
      return apiJson(
        {
          success: false,
          error: "Missing action. Use discover | discover-pipeline | delete-all | refresh-ai-intent.",
        },
        { status: 400 }
      );
    }
    if (action === "refresh-ai-intent") {
      const result = await refreshKeywordIntentsWithGemini(projectId);
      return apiJson(result, { status: result.success ? 200 : 400 });
    }
    if (action === "discover-pipeline") {
      const result = await runKeywordDiscoveryPipeline(projectId, { topN: body.topN });
      return apiJson(result, { status: result.success ? 200 : 400 });
    }
    if (action === "discover") {
      const result = await discoverKeywords(projectId);
      return apiJson(result, { status: result.success ? 200 : 400 });
    }
    if (action === "delete-all") {
      const result = await deleteAllKeywords(projectId);
      return apiJson(result, { status: result.success ? 200 : 400 });
    }
    return apiJson(
      {
        success: false,
        error: "Unknown action. Use discover | discover-pipeline | delete-all | refresh-ai-intent.",
      },
      { status: 400 }
    );
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body (expected { action, ... })" }, { status: 400 });
  }
}
