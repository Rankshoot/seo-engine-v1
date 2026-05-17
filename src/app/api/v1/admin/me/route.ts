import { assertAdminApi } from "@/lib/admin/assert-admin-api";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

/** Returns current admin session (role, email). Used by client to show admin nav. */
export async function GET() {
  const gate = await assertAdminApi("support");
  if (gate.response) return gate.response;
  return apiJson({ success: true, data: gate.admin });
}
