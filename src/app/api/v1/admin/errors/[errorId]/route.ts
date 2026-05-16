import { assertAdminApi } from "@/lib/admin/assert-admin-api";
import { resolveAdminError } from "@/app/actions/admin-errors-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ errorId: string }> }
) {
  const gate = await assertAdminApi("admin");
  if (gate.response) return gate.response;

  const { errorId } = await context.params;
  let body: { status?: string } = {};
  try {
    body = (await req.json()) as { status?: string };
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status !== "resolved") {
    return apiJson(
      { success: false, error: 'Only { "status": "resolved" } is supported' },
      { status: 400 }
    );
  }

  const result = await resolveAdminError(errorId, gate.admin);
  if (!result.success) {
    return apiJson({ success: false, error: result.error }, { status: 404 });
  }
  return apiJson({ success: true });
}
