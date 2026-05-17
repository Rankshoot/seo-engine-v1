"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { escapeIlikePattern, applyAdminDateRange } from "@/lib/admin/apply-log-list-filters";
import type { AdminListParams } from "@/lib/admin/parse-list-params";
import type { AdminAuditLogRow, AdminAuditLogsListResult } from "@/types/admin-audit-logs";

type AuditDbRow = {
  id: string;
  admin_user_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function mapRow(row: AuditDbRow): AdminAuditLogRow {
  return {
    id: row.id,
    adminUserId: row.admin_user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id ?? "",
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

export async function listAdminAuditLogs(
  params: AdminListParams
): Promise<
  { success: true; data: AdminAuditLogsListResult } | { success: false; error: string }
> {
  try {
    const db = getSupabaseAdmin();
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    let query = db
      .from("admin_audit_logs")
      .select(
        "id, admin_user_id, action, target_type, target_id, metadata, created_at",
        { count: "exact" }
      );

    if (params.userId) query = query.eq("admin_user_id", params.userId);
    if (params.action) query = query.eq("action", params.action);

    query = applyAdminDateRange(query, params);

    if (params.search) {
      const q = `%${escapeIlikePattern(params.search)}%`;
      query = query.or(
        `action.ilike.${q},target_type.ilike.${q},target_id.ilike.${q},admin_user_id.ilike.${q}`
      );
    }

    const sortCol = params.sort === "action" ? "action" : "created_at";
    query = query.order(sortCol, {
      ascending: params.sortDir === "asc",
      nullsFirst: false,
    });
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    const items = ((data ?? []) as AuditDbRow[]).map(mapRow);

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
    const message = e instanceof Error ? e.message : "Failed to list audit logs";
    console.error("[admin-audit-logs]", message);
    return { success: false, error: message };
  }
}
