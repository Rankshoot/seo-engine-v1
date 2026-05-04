import { currentUser } from "@clerk/nextjs/server";
import { auditSelectedUrls } from "@/app/actions/audit-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) {
    return apiJson(
      { success: false, error: "Not authenticated", audited: 0, failed: 0, results: [] },
      { status: 401 }
    );
  }
  const { projectId } = await params;
  try {
    const body = (await req.json()) as { urls: string[] };
    if (!Array.isArray(body.urls)) {
      return apiJson(
        { success: false, error: "Expected { urls: string[] }", audited: 0, failed: 0, results: [] },
        { status: 400 }
      );
    }
    const result = await auditSelectedUrls(projectId, body.urls);
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch {
    return apiJson(
      { success: false, error: "Invalid JSON body", audited: 0, failed: 0, results: [] },
      { status: 400 }
    );
  }
}
