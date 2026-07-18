"use server";

/**
 * Admin actions for the global Rankshoot AI memory (admin panel → AI Memory).
 * This is the backend-only heuristics layer: anonymized, style-only writing
 * patterns learned across all users. It is never exposed to regular users —
 * these actions require a platform admin and exist so admins can inspect what
 * the AI has learned and prune (archive) or restore entries.
 */

import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/require-admin";
import type { GlobalHeuristicRow } from "@/lib/ai-memory";

export interface AdminAiMemoryListResult {
  success: boolean;
  error?: string;
  rows: GlobalHeuristicRow[];
  totalActive: number;
  totalArchived: number;
}

/** Lists global heuristics (active first, most-evidenced first). */
export async function listGlobalHeuristics(): Promise<AdminAiMemoryListResult> {
  const adminCheck = await requireAdmin({ minRole: "support" });
  if (!adminCheck.ok) {
    return { success: false, error: "Unauthorized", rows: [], totalActive: 0, totalArchived: 0 };
  }

  const { data, error } = await supabaseAdmin
    .from("global_style_heuristics")
    .select("*")
    .order("status", { ascending: true }) // 'active' before 'archived'
    .order("evidence_count", { ascending: false })
    .limit(500);

  if (error) return { success: false, error: error.message, rows: [], totalActive: 0, totalArchived: 0 };

  const rows = (data ?? []) as GlobalHeuristicRow[];
  return {
    success: true,
    rows,
    totalActive: rows.filter((r) => r.status === "active").length,
    totalArchived: rows.filter((r) => r.status === "archived").length,
  };
}

/** Archives (prunes) or restores a heuristic. Archived entries are never injected into prompts. */
export async function setGlobalHeuristicStatus(
  id: string,
  status: "active" | "archived"
): Promise<{ success: boolean; error?: string }> {
  const adminCheck = await requireAdmin({ minRole: "admin" });
  if (!adminCheck.ok) return { success: false, error: "Unauthorized" };

  const { error } = await supabaseAdmin
    .from("global_style_heuristics")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  return error ? { success: false, error: error.message } : { success: true };
}

/** Permanently deletes a heuristic (admin-only, for junk entries). */
export async function deleteGlobalHeuristic(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const adminCheck = await requireAdmin({ minRole: "admin" });
  if (!adminCheck.ok) return { success: false, error: "Unauthorized" };

  const { error } = await supabaseAdmin
    .from("global_style_heuristics")
    .delete()
    .eq("id", id);

  return error ? { success: false, error: error.message } : { success: true };
}
