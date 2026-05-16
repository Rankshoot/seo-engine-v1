import { assertAdminApi } from "@/lib/admin/assert-admin-api";
import { getAdminAiLogDetail } from "@/app/actions/admin-ai-logs-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ logId: string }> }
) {
  const gate = await assertAdminApi("support");
  if (gate.response) return gate.response;

  const { logId } = await context.params;
  const result = await getAdminAiLogDetail(logId);
  if (!result.success) {
    return apiJson({ success: false, error: result.error }, { status: 404 });
  }
  return apiJson({ success: true, data: result.data });
}
