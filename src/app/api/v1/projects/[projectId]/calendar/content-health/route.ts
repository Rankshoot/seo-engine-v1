import { currentUser } from "@clerk/nextjs/server";
import { addContentHealthKeywordToCalendar } from "@/app/actions/calendar-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId } = await params;
  try {
    const body = (await req.json()) as {
      focusKeyword: string;
      auditUrl?: string;
      contentHealthAudit?: Record<string, unknown> | null;
    };
    if (!body.focusKeyword?.trim()) {
      return apiJson({ success: false, error: "Expected { focusKeyword, auditUrl?, contentHealthAudit? }" }, { status: 400 });
    }
    const result = await addContentHealthKeywordToCalendar(projectId, {
      focusKeyword: body.focusKeyword,
      auditUrl: body.auditUrl,
      contentHealthAudit: body.contentHealthAudit,
    });
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
}
