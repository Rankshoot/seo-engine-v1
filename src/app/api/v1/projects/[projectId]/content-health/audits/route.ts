import { currentUser } from "@clerk/nextjs/server";
import { deleteBlogAudits, getBlogAudits } from "@/app/actions/audit-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) {
    return apiJson(
      {
        success: false,
        error: "Not authenticated",
        data: [],
        coverage: {
          blogs_found: 0,
          blogs_audited: 0,
          last_updated_at: null,
          avg_health: 0,
          high_severity: 0,
          severity_counts: { high: 0, medium: 0, low: 0 },
        },
        total: 0,
        hasMore: false,
        limit: 0,
        offset: 0,
      },
      { status: 401 }
    );
  }
  const { projectId } = await params;
  const { searchParams } = new URL(req.url);
  const limitRaw = searchParams.get("limit");
  const offsetRaw = searchParams.get("offset");
  const limit = limitRaw ? Math.min(100, Math.max(1, parseInt(limitRaw, 10) || 0)) : undefined;
  const offset = offsetRaw ? Math.max(0, parseInt(offsetRaw, 10) || 0) : 0;
  const result = await getBlogAudits(projectId, limit != null ? { limit, offset } : undefined);
  return apiJson(result, { status: result.success ? 200 : 500 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId } = await params;
  const result = await deleteBlogAudits(projectId);
  return apiJson(result, { status: result.success ? 200 : 400 });
}
