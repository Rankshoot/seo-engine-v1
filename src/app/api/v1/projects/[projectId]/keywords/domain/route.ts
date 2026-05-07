import { currentUser } from "@clerk/nextjs/server";
import {
  getDomainKeywords,
  refreshDomainKeywordsFromDataForSEO,
  upsertKeywordFromDomainSite,
} from "@/app/actions/keyword-actions";
import type { CompetitorKeywordsForSiteRow } from "@/lib/dataforseo";
import type { KeywordStatus } from "@/lib/types";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 120;

const STATUSES: KeywordStatus[] = ["pending", "approved", "rejected"];

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated", data: [] }, { status: 401 });
  const { projectId } = await params;
  const result = await getDomainKeywords(projectId);
  return apiJson(result, { status: result.success ? 200 : 400 });
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId } = await params;
  try {
    const body = (await req.json()) as { action?: unknown; status?: unknown; row?: unknown };
    if (body.action === "refresh") {
      const result = await refreshDomainKeywordsFromDataForSEO(projectId);
      return apiJson(result, { status: result.success ? 200 : 400 });
    }
    const status = body.status;
    const row = body.row as
      | Pick<
          CompetitorKeywordsForSiteRow,
          "keyword" | "volume" | "kd" | "cpc" | "intent" | "estimated_monthly_traffic"
        >
      | undefined;
    if (!STATUSES.includes(status as KeywordStatus)) {
      return apiJson({ success: false, error: "Invalid status" }, { status: 400 });
    }
    if (!row || typeof row.keyword !== "string") {
      return apiJson({ success: false, error: "Invalid row" }, { status: 400 });
    }
    const result = await upsertKeywordFromDomainSite(projectId, row, status as KeywordStatus);
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
}
