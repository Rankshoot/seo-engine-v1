import { currentUser } from "@clerk/nextjs/server";
import { auditExistingBlogs } from "@/app/actions/audit-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId } = await params;
  let opts: { force?: boolean; limit?: number } = {};
  try {
    const body = (await req.json()) as { force?: boolean; limit?: number } | null;
    if (body && typeof body === "object") opts = body;
  } catch {
    /* empty body */
  }
  const result = await auditExistingBlogs(projectId, opts);
  return apiJson(result, { status: result.success ? 200 : 400 });
}
