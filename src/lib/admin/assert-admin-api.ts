import type { NextResponse } from "next/server";
import type { PlatformAdminRole } from "@/constants/enums/platform-admin-role";
import type { AdminSession } from "@/types/admin";
import { apiJson } from "@/server/http/json";
import { requireAdmin } from "@/lib/admin/require-admin";

export type AssertAdminApiResult =
  | { admin: AdminSession; response: null }
  | { admin: null; response: NextResponse };

/**
 * Use at the top of every `/api/v1/admin/*` route handler.
 * Returns a ready 401/403 JSON response when access is denied.
 */
export async function assertAdminApi(
  minRole: PlatformAdminRole = "support"
): Promise<AssertAdminApiResult> {
  const result = await requireAdmin({ minRole });
  if (!result.ok) {
    return {
      admin: null,
      response: apiJson(
        { success: false, error: result.error },
        { status: result.status }
      ),
    };
  }
  return { admin: result.admin, response: null };
}
