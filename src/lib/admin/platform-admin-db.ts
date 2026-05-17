import { supabaseAdmin } from "@/lib/supabase";
import type { PlatformAdminRole } from "@/constants/enums/platform-admin-role";
import type { PlatformAdminRow } from "@/types/admin";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function fetchActivePlatformAdmin(
  userId: string,
  email: string
): Promise<PlatformAdminRow | null> {
  const normalized = normalizeEmail(email);

  const { data: byUserId, error: byUserErr } = await supabaseAdmin
    .from("platform_admins")
    .select("*")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();

  if (byUserErr) {
    console.error("[platform_admins] lookup by user_id failed:", byUserErr.message);
    return null;
  }
  if (byUserId) return byUserId as PlatformAdminRow;

  const { data: byEmail, error: byEmailErr } = await supabaseAdmin
    .from("platform_admins")
    .select("*")
    .ilike("email", normalized)
    .is("revoked_at", null)
    .maybeSingle();

  if (byEmailErr) {
    console.error("[platform_admins] lookup by email failed:", byEmailErr.message);
    return null;
  }

  return (byEmail as PlatformAdminRow | null) ?? null;
}

/** Attach Clerk user id to a bootstrap email row on first admin sign-in. */
export async function linkPlatformAdminUserId(
  userId: string,
  email: string
): Promise<void> {
  const normalized = normalizeEmail(email);

  const { error } = await supabaseAdmin
    .from("platform_admins")
    .update({ user_id: userId })
    .ilike("email", normalized)
    .is("revoked_at", null)
    .is("user_id", null);

  if (error) {
    console.warn("[platform_admins] link user_id failed:", error.message);
  }
}

export function rowToAdminSession(
  row: PlatformAdminRow,
  clerkUserId: string
): {
  id: string;
  userId: string;
  email: string;
  role: PlatformAdminRole;
} {
  return {
    id: row.id,
    userId: clerkUserId,
    email: row.email,
    role: row.role as PlatformAdminRole,
  };
}
