import { redirect } from "next/navigation";
import type { PlatformAdminRole } from "@/constants/enums/platform-admin-role";
import { requireAdmin } from "@/lib/admin/require-admin";
import type { AdminSession } from "@/types/admin";

/** Server Component guard for admin pages with stricter role than layout default. */
export async function requireAdminPage(
  minRole: PlatformAdminRole = "support"
): Promise<AdminSession> {
  const result = await requireAdmin({ minRole });
  if (!result.ok) {
    if (result.status === 401) redirect("/sign-in");
    redirect("/admin/unauthorized");
  }
  return result.admin;
}
