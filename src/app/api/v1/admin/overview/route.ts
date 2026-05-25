import { assertAdminApi } from "@/lib/admin/assert-admin-api";
import { getAdminOverview } from "@/app/actions/admin-overview-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function GET() {
  const gate = await assertAdminApi("support");
  if (gate.response) return gate.response;

  const result = await getAdminOverview();
  if (!result.success) {
    return apiJson({ success: false, error: result.error }, { status: 500 });
  }
  return apiJson({ success: true, data: result.data });
}
