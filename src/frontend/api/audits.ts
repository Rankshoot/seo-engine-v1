import type { AuditCoverage, PersistedBlogAudit } from "@/app/actions/audit-actions";
import { apiDelete, apiGet } from "./http";
import { V1Routes } from "./routes";

export const auditsApi = {
  list(
    projectId: string,
    opts?: { limit?: number; offset?: number }
  ): Promise<{
    success: boolean;
    error?: string;
    data: PersistedBlogAudit[];
    coverage: AuditCoverage;
    total: number;
    hasMore: boolean;
    limit: number;
    offset: number;
  }> {
    const q =
      opts?.limit != null
        ? `?limit=${encodeURIComponent(String(opts.limit))}&offset=${encodeURIComponent(String(opts.offset ?? 0))}`
        : "";
    return apiGet(`${V1Routes.contentHealthAudits(projectId)}${q}`);
  },

  clear(projectId: string): Promise<{ success: boolean; error?: string }> {
    return apiDelete(V1Routes.contentHealthAudits(projectId));
  },

};
