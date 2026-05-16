import { assertAdminApi } from "@/lib/admin/assert-admin-api";
import {
  getAdminSettings,
  updateAdminSettings,
} from "@/app/actions/admin-settings-actions";
import type { AdminSettingsPatch } from "@/types/admin-settings";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function GET() {
  const gate = await assertAdminApi("admin");
  if (gate.response) return gate.response;

  const result = await getAdminSettings();
  if (!result.success) {
    return apiJson({ success: false, error: result.error }, { status: 500 });
  }
  return apiJson({ success: true, data: result.data });
}

export async function PATCH(req: Request) {
  const gate = await assertAdminApi("owner");
  if (gate.response) return gate.response;

  let body: AdminSettingsPatch;
  try {
    body = (await req.json()) as AdminSettingsPatch;
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await updateAdminSettings(body, gate.admin);
  if (!result.success) {
    return apiJson({ success: false, error: result.error }, { status: 400 });
  }
  return apiJson({ success: true });
}
