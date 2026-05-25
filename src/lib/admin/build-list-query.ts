import type { AdminListParams } from "@/lib/admin/parse-list-params";
import { adminListFiltersKey } from "@/lib/admin/parse-list-params";

export function buildAdminListQueryString(params: AdminListParams): string {
  const sp = new URLSearchParams();
  if (params.page > 1) sp.set("page", String(params.page));
  if (params.pageSize !== 25) sp.set("pageSize", String(params.pageSize));
  if (params.search) sp.set("search", params.search);
  if (params.sort) sp.set("sort", params.sort);
  if (params.sortDir !== "desc") sp.set("sortDir", params.sortDir);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.userId) sp.set("userId", params.userId);
  if (params.projectId) sp.set("projectId", params.projectId);
  if (params.provider) sp.set("provider", params.provider);
  if (params.status) sp.set("status", params.status);
  if (params.severity) sp.set("severity", params.severity);
  if (params.action) sp.set("action", params.action);
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export { adminListFiltersKey };
