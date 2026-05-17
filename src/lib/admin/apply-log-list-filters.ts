import type { AdminListParams } from "@/lib/admin/parse-list-params";

/** Escape `%` and `_` for PostgREST `ilike` patterns. */
export function escapeIlikePattern(raw: string): string {
  return raw.replace(/[%_,]/g, "");
}

export function applyAdminDateRange<T extends { gte: (col: string, v: string) => T; lte: (col: string, v: string) => T }>(
  query: T,
  params: AdminListParams
): T {
  let q = query;
  if (params.from) q = q.gte("created_at", params.from);
  if (params.to) q = q.lte("created_at", params.to);
  return q;
}
