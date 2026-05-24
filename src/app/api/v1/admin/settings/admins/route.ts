import { assertAdminApi } from "@/lib/admin/assert-admin-api";
import {
  grantPlatformAdmin,
  revokePlatformAdmin,
} from "@/app/actions/admin-settings-actions";
import type { PlatformAdminRole } from "@/constants/enums/platform-admin-role";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const gate = await assertAdminApi("admin");
  if (gate.response) return gate.response;

  let body: { email?: string; role?: PlatformAdminRole };
  try {
    body = (await req.json()) as { email?: string; role?: PlatformAdminRole };
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.email?.trim() || !body.role) {
    return apiJson(
      { success: false, error: "email and role are required" },
      { status: 400 }
    );
  }

  const result = await grantPlatformAdmin(body.email, body.role, gate.admin);
  if (!result.success) {
    return apiJson({ success: false, error: result.error }, { status: 400 });
  }
  return apiJson({ success: true });
}

export async function DELETE(req: Request) {
  const gate = await assertAdminApi("admin");
  if (gate.response) return gate.response;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return apiJson({ success: false, error: "id query param is required" }, { status: 400 });
  }

  const result = await revokePlatformAdmin(id, gate.admin);
  if (!result.success) {
    return apiJson({ success: false, error: result.error }, { status: 400 });
  }
  return apiJson({ success: true });
}
