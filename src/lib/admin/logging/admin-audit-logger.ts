import type { LogAdminAuditInput } from "@/types/admin-logging";
import { redactMetadata } from "@/lib/admin/logging/redact";

/** Known admin audit actions — use these constants at call sites. */
export const AdminAuditAction = {
  adminGrant: "admin.grant",
  adminRevoke: "admin.revoke",
  settingsUpdate: "settings.update",
  errorResolve: "error.resolve",
  viewUser: "admin.view_user",
  viewProject: "admin.view_project",
  providerToggle: "settings.provider_toggle",
  limitsUpdate: "settings.limits_update",
} as const;

export type AdminAuditActionType =
  (typeof AdminAuditAction)[keyof typeof AdminAuditAction];

/**
 * Record a sensitive admin action. Never throws.
 */
export function logAdminAudit(input: LogAdminAuditInput): void {
  if (typeof window !== "undefined") return;
  void insertAdminAudit(input).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[admin-audit-logger] logAdminAudit failed:", msg);
  });
}

async function insertAdminAudit(input: LogAdminAuditInput): Promise<void> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const { error } = await getSupabaseAdmin().from("admin_audit_logs").insert({
    admin_user_id: input.adminUserId,
    action: input.action,
    target_type: input.targetType ?? "",
    target_id: input.targetId ?? "",
    metadata: redactMetadata(input.metadata),
  });

  if (error) throw new Error(error.message);
}
