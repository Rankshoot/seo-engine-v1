"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { escapeIlikePattern, applyAdminDateRange } from "@/lib/admin/apply-log-list-filters";
import type { AdminListParams } from "@/lib/admin/parse-list-params";
import type {
  AdminAiLogDetail,
  AdminAiLogRow,
  AdminAiLogsListResult,
} from "@/types/admin-ai-logs";

type AiLogDbRow = {
  id: string;
  user_id: string | null;
  project_id: string | null;
  feature: string;
  model: string;
  prompt_summary: string;
  prompt_full: string | null;
  response_full: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  estimated_cost_usd: number | null;
  status: string;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function mapListRow(row: AiLogDbRow): AdminAiLogRow {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    feature: row.feature,
    model: row.model,
    promptSummary: row.prompt_summary,
    hasFullPrompt: !!row.prompt_full,
    hasFullResponse: !!row.response_full,
    tokensInput: row.tokens_input,
    tokensOutput: row.tokens_output,
    estimatedCostUsd:
      row.estimated_cost_usd != null ? Number(row.estimated_cost_usd) : null,
    status: row.status,
    errorMessage: row.error_message ?? "",
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

function mapDetailRow(row: AiLogDbRow): AdminAiLogDetail {
  return {
    ...mapListRow(row),
    promptFull: row.prompt_full,
    responseFull: row.response_full,
  };
}

export async function listAdminAiLogs(
  params: AdminListParams
): Promise<
  { success: true; data: AdminAiLogsListResult } | { success: false; error: string }
> {
  try {
    const db = getSupabaseAdmin();
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    let query = db
      .from("ai_usage_logs")
      .select(
        `id, user_id, project_id, feature, model, prompt_summary,
         prompt_full, response_full, tokens_input, tokens_output,
         estimated_cost_usd, status, error_message, metadata, created_at`,
        { count: "exact" }
      );

    if (params.userId) query = query.eq("user_id", params.userId);
    if (params.projectId) query = query.eq("project_id", params.projectId);
    if (params.status) query = query.eq("status", params.status);
    if (params.provider) query = query.eq("model", params.provider);

    query = applyAdminDateRange(query, params);

    if (params.search) {
      const q = `%${escapeIlikePattern(params.search)}%`;
      query = query.or(
        `feature.ilike.${q},model.ilike.${q},prompt_summary.ilike.${q},error_message.ilike.${q}`
      );
    }

    const sortCol =
      params.sort === "cost"
        ? "estimated_cost_usd"
        : params.sort === "tokens"
          ? "tokens_input"
          : params.sort === "model"
            ? "model"
            : "created_at";

    query = query.order(sortCol, {
      ascending: params.sortDir === "asc",
      nullsFirst: false,
    });
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    const items = ((data ?? []) as AiLogDbRow[]).map(mapListRow);

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
    const message = e instanceof Error ? e.message : "Failed to list AI logs";
    console.error("[admin-ai-logs]", message);
    return { success: false, error: message };
  }
}

export async function getAdminAiLogDetail(
  logId: string
): Promise<
  { success: true; data: AdminAiLogDetail } | { success: false; error: string }
> {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("ai_usage_logs")
      .select(
        `id, user_id, project_id, feature, model, prompt_summary,
         prompt_full, response_full, tokens_input, tokens_output,
         estimated_cost_usd, status, error_message, metadata, created_at`
      )
      .eq("id", logId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return { success: false, error: "Log not found" };

    return { success: true, data: mapDetailRow(data as AiLogDbRow) };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load AI log";
    console.error("[admin-ai-logs-detail]", message);
    return { success: false, error: message };
  }
}
