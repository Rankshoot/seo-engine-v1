"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { escapeIlikePattern, applyAdminDateRange } from "@/lib/admin/apply-log-list-filters";
import {
  AdminAuditAction,
  logAdminAudit,
} from "@/lib/admin/logging/admin-audit-logger";
import type { AdminListParams } from "@/lib/admin/parse-list-params";
import type { AdminSession } from "@/types/admin";
import type { AdminErrorRow, AdminErrorsListResult } from "@/types/admin-errors";

type ErrorDbRow = {
  id: string;
  user_id: string | null;
  project_id: string | null;
  feature: string;
  provider: string;
  error_message: string;
  severity: string;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

function mapRow(row: ErrorDbRow): AdminErrorRow {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    feature: row.feature,
    provider: row.provider,
    errorMessage: row.error_message,
    severity: row.severity,
    status: row.status,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
  };
}

export async function listAdminErrors(
  params: AdminListParams
): Promise<
  { success: true; data: AdminErrorsListResult } | { success: false; error: string }
> {
  try {
    const db = getSupabaseAdmin();
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    let query = db
      .from("system_error_logs")
      .select(
        `id, user_id, project_id, feature, provider, error_message,
         severity, status, metadata, created_at, resolved_at, resolved_by`,
        { count: "exact" }
      );

    if (params.userId) query = query.eq("user_id", params.userId);
    if (params.projectId) query = query.eq("project_id", params.projectId);
    if (params.status) query = query.eq("status", params.status);
    if (params.severity) query = query.eq("severity", params.severity);
    if (params.provider) query = query.eq("provider", params.provider);

    query = applyAdminDateRange(query, params);

    if (params.search) {
      const q = `%${escapeIlikePattern(params.search)}%`;
      query = query.or(
        `feature.ilike.${q},provider.ilike.${q},error_message.ilike.${q}`
      );
    }

    const sortCol =
      params.sort === "severity" ? "severity" : params.sort === "status" ? "status" : "created_at";

    query = query.order(sortCol, {
      ascending: params.sortDir === "asc",
      nullsFirst: false,
    });
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    const items = ((data ?? []) as ErrorDbRow[]).map(mapRow);

    return {
      success: true,
      data: {
        items,
        total: count ?? items.length,
        page: params.page,
        pageSize: params.pageSize,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list errors";
    console.error("[admin-errors]", message);
    return { success: false, error: message };
  }
}

export async function resolveAdminError(
  errorId: string,
  admin: AdminSession
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const db = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { data, error } = await db
      .from("system_error_logs")
      .update({
        status: "resolved",
        resolved_at: now,
        resolved_by: admin.userId,
      })
      .eq("id", errorId)
      .eq("status", "open")
      .select("id")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return {
        success: false,
        error: "Error not found or already resolved",
      };
    }

    logAdminAudit({
      adminUserId: admin.userId,
      action: AdminAuditAction.errorResolve,
      targetType: "system_error",
      targetId: errorId,
      metadata: { adminEmail: admin.email },
    });

    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to resolve error";
    console.error("[admin-errors-resolve]", message);
    return { success: false, error: message };
  }
}
