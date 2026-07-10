import { currentUser } from "@clerk/nextjs/server";
import { bulkUpdateKeywordStatus } from "@/app/actions/keyword-actions";
import type { KeywordStatus } from "@/lib/types";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId } = await params;
  try {
    const body = (await req.json()) as {
      keywordIds: string[];
      status: KeywordStatus;
      contentTypes?: Record<string, string>;
    };
    if (!Array.isArray(body.keywordIds) || !body.status) {
      return apiJson({ success: false, error: "Expected { keywordIds: string[], status }" }, { status: 400 });
    }
    const result = await bulkUpdateKeywordStatus(body.keywordIds, body.status, projectId, body.contentTypes);
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch (e) {
    console.error("[POST /keywords/bulk-status]", e);
    return apiJson(
      { success: false, error: e instanceof Error ? e.message : "Invalid JSON body" },
      { status: 400 }
    );
  }
}
