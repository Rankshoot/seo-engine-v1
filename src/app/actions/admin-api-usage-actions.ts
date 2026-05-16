"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { escapeIlikePattern, applyAdminDateRange } from "@/lib/admin/apply-log-list-filters";
import type { AdminListParams } from "@/lib/admin/parse-list-params";
import type { AdminApiUsageRow, AdminApiUsageListResult } from "@/types/admin-api-usage";

type ApiUsageDbRow = {
  id: string;
  user_id: string | null;
  project_id: string | null;
  provider: string;
  feature: string;
  endpoint: string;
  status: string;
  latency_ms: number | null;
  cached: boolean;
  cache_hit: boolean;
  credits_used: number | null;
  estimated_cost_usd: number | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function mapRow(row: ApiUsageDbRow): AdminApiUsageRow {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    provider: row.provider,
    feature: row.feature,
    endpoint: row.endpoint,
    status: row.status,
    latencyMs: row.latency_ms,
    cached: row.cached,
    cacheHit: row.cache_hit,
    creditsUsed: row.credits_used != null ? Number(row.credits_used) : null,
    estimatedCostUsd:
      row.estimated_cost_usd != null ? Number(row.estimated_cost_usd) : null,
    errorMessage: row.error_message ?? "",
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

export async function listAdminApiUsage(
  params: AdminListParams
): Promise<
  { success: true; data: AdminApiUsageListResult } | { success: false; error: string }
> {
  try {
    const db = getSupabaseAdmin();
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    let query = db
      .from("api_usage_logs")
      .select(
        `id, user_id, project_id, provider, feature, endpoint, status,
         latency_ms, cached, cache_hit, credits_used, estimated_cost_usd,
         error_message, metadata, created_at`,
        { count: "exact" }
      );

    if (params.userId) query = query.eq("user_id", params.userId);
    if (params.projectId) query = query.eq("project_id", params.projectId);
    if (params.provider) query = query.eq("provider", params.provider);
    if (params.status) query = query.eq("status", params.status);

    query = applyAdminDateRange(query, params);

    if (params.search) {
      const q = `%${escapeIlikePattern(params.search)}%`;
      query = query.or(
        `feature.ilike.${q},endpoint.ilike.${q},error_message.ilike.${q},provider.ilike.${q}`
      );
    }

    const sortCol =
      params.sort === "cost"
        ? "estimated_cost_usd"
        : params.sort === "latency"
          ? "latency_ms"
          : params.sort === "provider"
            ? "provider"
            : "created_at";

    query = query.order(sortCol, {
      ascending: params.sortDir === "asc",
      nullsFirst: false,
    });
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    const items = ((data ?? []) as ApiUsageDbRow[]).map(mapRow);

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
    const message = e instanceof Error ? e.message : "Failed to list API usage";
    console.error("[admin-api-usage]", message);
    return { success: false, error: message };
  }
}
