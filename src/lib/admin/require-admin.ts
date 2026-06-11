import { auth, currentUser } from "@clerk/nextjs/server";
import type { User } from "@clerk/nextjs/server";
import type { PlatformAdminRole } from "@/constants/enums/platform-admin-role";
import { platformAdminMeetsMinRole } from "@/constants/enums/platform-admin-role";
import type { RequireAdminResult, PlatformAdminRow } from "@/types/admin";
import { supabaseAdmin } from "@/lib/supabase";
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

  // 1. Fast Path: Use local JWT auth() to avoid hitting Clerk APIs if user_id is already linked
  try {
    const { userId } = await auth();
    if (userId) {
      const { data: row, error: dbErr } = await supabaseAdmin
        .from("platform_admins")
        .select("*")
        .eq("user_id", userId)
        .is("revoked_at", null)
        .maybeSingle();

      if (!dbErr && row) {
        const role = row.role;
        if (!platformAdminMeetsMinRole(role, minRole)) {
          return { ok: false, status: 403, error: "Insufficient permissions" };
        }
        return {
          ok: true,
          admin: rowToAdminSession(row as PlatformAdminRow, userId),
        };
      }
    }
  } catch (err) {
    console.warn("[requireAdmin] auth() check failed, falling back to currentUser():", err);
  }

  // 2. Fallback Path: Fetch full Clerk user object if first-time sign-in or auth() check failed
  let user: User | null = null;
  try {
    user = await currentUser();
  } catch (err) {
    console.error("[requireAdmin] currentUser() fetch failed completely:", err);
  }

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
