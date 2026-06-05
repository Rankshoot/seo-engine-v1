"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import type { PlatformAdminRole } from "@/constants/enums/platform-admin-role";
import { PLATFORM_ADMIN_ROLES } from "@/constants/enums/platform-admin-role";
import { platformAdminMeetsMinRole } from "@/constants/enums/platform-admin-role";
import {
  AdminAuditAction,
  logAdminAudit,
} from "@/lib/admin/logging/admin-audit-logger";
import { invalidatePlatformRuntimeCache } from "@/lib/admin/platform-settings-runtime";
import { getAdminEnvKeyStatus } from "@/lib/admin/env-key-status";
import {
  DEFAULT_PLATFORM_CACHE,
  DEFAULT_PLATFORM_DEBUG,
  DEFAULT_PLATFORM_GEMINI,
  DEFAULT_PLATFORM_LIMITS,
  DEFAULT_PLATFORM_MAINTENANCE,
  DEFAULT_PLATFORM_PROVIDERS,
  DEFAULT_PLATFORM_ROUTING,
  DEFAULT_PLATFORM_COST_CONTROLS,
  mergeSettingsSection,
} from "@/lib/admin/platform-settings-defaults";
import type { AdminSession } from "@/types/admin";
import type {
  AdminPlatformAdminRow,
  AdminSettingsData,
  AdminSettingsPatch,
} from "@/types/admin-settings";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function readSettingsKey(
  db: ReturnType<typeof getSupabaseAdmin>,
  key: string
): Promise<Record<string, unknown>> {
  const { data, error } = await db
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const value = data?.value;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function upsertSettingsKey(
  db: ReturnType<typeof getSupabaseAdmin>,
  key: string,
  value: Record<string, unknown>,
  updatedBy: string
): Promise<void> {
  const { error } = await db.from("platform_settings").upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    },
    { onConflict: "key" }
  );
  if (error) throw new Error(error.message);
}

function mapAdminRow(row: {
  id: string;
  user_id: string | null;
  email: string;
  role: string;
  created_by: string | null;
  created_at: string;
}): AdminPlatformAdminRow {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    role: row.role as PlatformAdminRole,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function getAdminSettings(): Promise<
  { success: true; data: AdminSettingsData } | { success: false; error: string }
> {
  try {
    const db = getSupabaseAdmin();

    const [providersRaw, limitsRaw, cacheRaw, geminiRaw, debugRaw, maintenanceRaw, routingRaw, costControlsRaw, adminsRes] =
      await Promise.all([
        readSettingsKey(db, "providers"),
        readSettingsKey(db, "limits"),
        readSettingsKey(db, "cache"),
        readSettingsKey(db, "gemini"),
        readSettingsKey(db, "debug"),
        readSettingsKey(db, "maintenance"),
        readSettingsKey(db, "routing"),
        readSettingsKey(db, "cost_controls"),
        db
          .from("platform_admins")
          .select("id, user_id, email, role, created_by, created_at")
          .is("revoked_at", null)
          .order("created_at", { ascending: true }),
      ]);

    if (adminsRes.error) throw new Error(adminsRes.error.message);

    return {
      success: true,
      data: {
        providers: mergeSettingsSection(DEFAULT_PLATFORM_PROVIDERS, providersRaw),
        limits: mergeSettingsSection(DEFAULT_PLATFORM_LIMITS, limitsRaw),
        cache: mergeSettingsSection(DEFAULT_PLATFORM_CACHE, cacheRaw),
        gemini: mergeSettingsSection(DEFAULT_PLATFORM_GEMINI, geminiRaw),
        debug: mergeSettingsSection(DEFAULT_PLATFORM_DEBUG, debugRaw),
        maintenance: mergeSettingsSection(DEFAULT_PLATFORM_MAINTENANCE, maintenanceRaw),
        routing: mergeSettingsSection(DEFAULT_PLATFORM_ROUTING, routingRaw),
        cost_controls: mergeSettingsSection(DEFAULT_PLATFORM_COST_CONTROLS, costControlsRaw),
        envKeys: getAdminEnvKeyStatus(),
        admins: (adminsRes.data ?? []).map(mapAdminRow),
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load settings";
    console.error("[admin-settings]", message);
    return { success: false, error: message };
  }
}

export async function updateAdminSettings(
  patch: AdminSettingsPatch,
  admin: AdminSession
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    if (!platformAdminMeetsMinRole(admin.role, "admin")) {
      return { success: false, error: "Admin role required to update settings" };
    }

    const db = getSupabaseAdmin();
    const changed: string[] = [];

    if (patch.providers) {
      const current = mergeSettingsSection(
        DEFAULT_PLATFORM_PROVIDERS,
        await readSettingsKey(db, "providers")
      );
      await upsertSettingsKey(
        db,
        "providers",
        { ...current, ...patch.providers },
        admin.userId
      );
      changed.push("providers");
    }

    if (patch.limits) {
      const current = mergeSettingsSection(
        DEFAULT_PLATFORM_LIMITS,
        await readSettingsKey(db, "limits")
      );
      await upsertSettingsKey(db, "limits", { ...current, ...patch.limits }, admin.userId);
      changed.push("limits");
    }

    if (patch.cache) {
      const current = mergeSettingsSection(
        DEFAULT_PLATFORM_CACHE,
        await readSettingsKey(db, "cache")
      );
      await upsertSettingsKey(db, "cache", { ...current, ...patch.cache }, admin.userId);
      changed.push("cache");
    }

    if (patch.gemini) {
      const current = mergeSettingsSection(
        DEFAULT_PLATFORM_GEMINI,
        await readSettingsKey(db, "gemini")
      );
      await upsertSettingsKey(db, "gemini", { ...current, ...patch.gemini }, admin.userId);
      changed.push("gemini");
    }

    if (patch.debug) {
      const current = mergeSettingsSection(
        DEFAULT_PLATFORM_DEBUG,
        await readSettingsKey(db, "debug")
      );
      await upsertSettingsKey(db, "debug", { ...current, ...patch.debug }, admin.userId);
      changed.push("debug");
      invalidatePlatformRuntimeCache();
    }

    if (patch.maintenance) {
      const current = mergeSettingsSection(
        DEFAULT_PLATFORM_MAINTENANCE,
        await readSettingsKey(db, "maintenance")
      );
      await upsertSettingsKey(
        db,
        "maintenance",
        { ...current, ...patch.maintenance },
        admin.userId
      );
      changed.push("maintenance");
    }

    if (patch.routing) {
      const current = mergeSettingsSection(
        DEFAULT_PLATFORM_ROUTING,
        await readSettingsKey(db, "routing")
      );
      await upsertSettingsKey(
        db,
        "routing",
        { ...current, ...patch.routing },
        admin.userId
      );
      changed.push("routing");
    }

    if (patch.cost_controls) {
      const current = mergeSettingsSection(
        DEFAULT_PLATFORM_COST_CONTROLS,
        await readSettingsKey(db, "cost_controls")
      );
      await upsertSettingsKey(
        db,
        "cost_controls",
        { ...current, ...patch.cost_controls },
        admin.userId
      );
      changed.push("cost_controls");
    }

    if (changed.length) {
      logAdminAudit({
        adminUserId: admin.userId,
        action: AdminAuditAction.settingsUpdate,
        targetType: "platform_settings",
        targetId: changed.join(","),
        metadata: { sections: changed },
      });
    }

    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update settings";
    console.error("[admin-settings-update]", message);
    return { success: false, error: message };
  }
}

export async function grantPlatformAdmin(
  email: string,
  role: PlatformAdminRole,
  admin: AdminSession
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    if (!platformAdminMeetsMinRole(admin.role, "admin")) {
      return { success: false, error: "Admin role required to grant admin access" };
    }

    const normalized = normalizeEmail(email);
    if (!normalized.includes("@")) {
      return { success: false, error: "Invalid email address" };
    }

    if (!PLATFORM_ADMIN_ROLES.includes(role)) {
      return { success: false, error: "Invalid role" };
    }

    if (role === "owner" && admin.role !== "owner") {
      return { success: false, error: "Only owners can grant owner role" };
    }

    const db = getSupabaseAdmin();

    const { data: existing } = await db
      .from("platform_admins")
      .select("id")
      .ilike("email", normalized)
      .is("revoked_at", null)
      .maybeSingle();

    if (existing) {
      return { success: false, error: "This email already has active admin access" };
    }

    const { data: inserted, error } = await db
      .from("platform_admins")
      .insert({
        email: normalized,
        role,
        created_by: admin.userId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    logAdminAudit({
      adminUserId: admin.userId,
      action: AdminAuditAction.adminGrant,
      targetType: "platform_admin",
      targetId: inserted.id,
      metadata: { email: normalized, role },
    });

    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to grant admin";
    console.error("[admin-grant]", message);
    return { success: false, error: message };
  }
}

export async function revokePlatformAdmin(
  platformAdminId: string,
  admin: AdminSession
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    if (!platformAdminMeetsMinRole(admin.role, "admin")) {
      return { success: false, error: "Admin role required to revoke admin access" };
    }

    const db = getSupabaseAdmin();

    const { data: target, error: fetchErr } = await db
      .from("platform_admins")
      .select("id, email, role, user_id")
      .eq("id", platformAdminId)
      .is("revoked_at", null)
      .maybeSingle();

    if (fetchErr) throw new Error(fetchErr.message);
    if (!target) {
      return { success: false, error: "Admin not found or already revoked" };
    }

    if (target.user_id === admin.userId || target.email === admin.email) {
      return { success: false, error: "You cannot revoke your own admin access" };
    }

    if (target.role === "owner") {
      const { count, error: countErr } = await db
        .from("platform_admins")
        .select("id", { count: "exact", head: true })
        .eq("role", "owner")
        .is("revoked_at", null);

      if (countErr) throw new Error(countErr.message);
      if ((count ?? 0) <= 1) {
        return { success: false, error: "Cannot revoke the last owner" };
      }
    }

    const { error } = await db
      .from("platform_admins")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", platformAdminId)
      .is("revoked_at", null);

    if (error) throw new Error(error.message);

    logAdminAudit({
      adminUserId: admin.userId,
      action: AdminAuditAction.adminRevoke,
      targetType: "platform_admin",
      targetId: platformAdminId,
      metadata: { email: target.email, role: target.role },
    });

    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to revoke admin";
    console.error("[admin-revoke]", message);
    return { success: false, error: message };
  }
}
