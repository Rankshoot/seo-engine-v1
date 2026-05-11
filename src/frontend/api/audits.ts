import type { AuditCoverage, PersistedBlogAudit, SitemapPage } from "@/app/actions/audit-actions";
import { apiDelete, apiGet, apiPost } from "./http";
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

  run(
    projectId: string,
    opts: { force?: boolean; limit?: number } = {}
  ): Promise<{
    success: boolean;
    error?: string;
    audited: number;
    skipped: number;
    failed: number;
    coverage: AuditCoverage;
    vendorTrace?: Array<{ url: string; provider: string; step: string; ok: boolean; detail?: string; ms?: number }>;
  }> {
    return apiPost(V1Routes.contentHealthAuditsRun(projectId), opts);
  },

  sitemapPages(projectId: string, basePath?: string) {
    const q = basePath ? `?basePath=${encodeURIComponent(basePath)}` : "";
    return apiGet<{
      success: boolean;
      error?: string;
      pages: SitemapPage[];
      basePaths: string[];
      total: number;
    }>(`${V1Routes.contentHealthSitemapPages(projectId)}${q}`);
  },

  auditSelected(
    projectId: string,
    urls: string[]
  ): Promise<{
    success: boolean;
    error?: string;
    audited: number;
    failed: number;
    results: PersistedBlogAudit[];
  }> {
    return apiPost(V1Routes.contentHealthAuditsSelected(projectId), { urls });
  },
};
