import { currentUser } from "@clerk/nextjs/server";
import type { User } from "@clerk/nextjs/server";
import type { PlatformAdminRole } from "@/constants/enums/platform-admin-role";
import { platformAdminMeetsMinRole } from "@/constants/enums/platform-admin-role";
import type { RequireAdminResult } from "@/types/admin";
import {
  fetchActivePlatformAdmin,
  linkPlatformAdminUserId,
  rowToAdminSession,
} from "@/lib/admin/platform-admin-db";

export type { PlatformAdminRole } from "@/constants/enums/platform-admin-role";
export type { RequireAdminResult, AdminSession } from "@/types/admin";

export interface RequireAdminOptions {
  /** Minimum role required. Default `support` (any active admin). */
  minRole?: PlatformAdminRole;
}

export function resolvePrimaryEmail(user: User): string | null {
  const primary = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId
  );
  const addr = primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  return addr ? addr.trim().toLowerCase() : null;
}

/**
 * Server-side admin gate. Checks `platform_admins` (active, not revoked).
 * Links `user_id` on first successful match by email.
 */
export async function requireAdmin(
  options: RequireAdminOptions = {}
): Promise<RequireAdminResult> {
  const minRole = options.minRole ?? "support";

  const user = await currentUser();
  if (!user) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }

  const email = resolvePrimaryEmail(user);
  if (!email) {
    return { ok: false, status: 403, error: "No email on account" };
  }

  await linkPlatformAdminUserId(user.id, email);

  const row = await fetchActivePlatformAdmin(user.id, email);
  if (!row) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const role = row.role;
  if (!platformAdminMeetsMinRole(role, minRole)) {
    return { ok: false, status: 403, error: "Insufficient permissions" };
  }

  return {
    ok: true,
    admin: rowToAdminSession(row, user.id),
  };
}
