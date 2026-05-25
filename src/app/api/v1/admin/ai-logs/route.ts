import { assertAdminApi } from "@/lib/admin/assert-admin-api";
import { listAdminAiLogs } from "@/app/actions/admin-ai-logs-actions";
import { parseAdminListParams } from "@/lib/admin/parse-list-params";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const gate = await assertAdminApi("support");
  if (gate.response) return gate.response;

  const params = parseAdminListParams(new URL(req.url).searchParams, {
    sort: "created",
    sortDir: "desc",
  });
  const result = await listAdminAiLogs(params);
  if (!result.success) {
    return apiJson({ success: false, error: result.error, data: [], total: 0 }, { status: 500 });
  }
  return apiJson({
    success: true,
    data: result.data.items,
    total: result.data.total,
    page: result.data.page,
    pageSize: result.data.pageSize,
  });
}
