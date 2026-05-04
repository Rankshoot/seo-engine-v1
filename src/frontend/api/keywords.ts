import type { Keyword, KeywordStatus } from "@/lib/types";
import type { CompetitorKeywordsForSiteRow } from "@/lib/dataforseo";
import { apiDelete, apiGet, apiPatch, apiPost } from "./http";
import { V1Routes } from "./routes";

export type KeywordsListResponse = {
  success: boolean;
  error?: string;
  data: Keyword[];
  total: number;
  count?: number;
  discoveryTrace?: unknown;
  briefSummary?: unknown;
  relevance?: unknown;
};

export const keywordsApi = {
  list(
    projectId: string,
    opts: { limit?: number; offset?: number; includeApproved?: boolean } = {}
  ): Promise<KeywordsListResponse> {
    const p = new URLSearchParams();
    if (opts.limit != null) p.set("limit", String(opts.limit));
    if (opts.offset != null) p.set("offset", String(opts.offset));
    if (opts.includeApproved === false) p.set("includeApproved", "false");
    const qs = p.toString();
    return apiGet(`${V1Routes.keywords(projectId)}${qs ? `?${qs}` : ""}`);
  },

  loadMore(projectId: string, offset: number, limit?: number): Promise<KeywordsListResponse> {
    return apiPost(V1Routes.keywordsLoadMore(projectId), { offset, limit });
  },

  discover(projectId: string): Promise<
    KeywordsListResponse & {
      discoveryTrace?: unknown;
      briefSummary?: unknown;
      relevance?: unknown;
    }
  > {
    return apiPost(V1Routes.keywords(projectId), { action: "discover" });
  },

  discoverPipeline(projectId: string, topN?: number) {
    return apiPost(V1Routes.keywords(projectId), { action: "discover-pipeline", topN });
  },

  deleteAll(projectId: string): Promise<{ success: boolean; error?: string }> {
    return apiPost(V1Routes.keywords(projectId), { action: "delete-all" });
  },

  domainKeywords(projectId: string): Promise<
    { success: true; data: CompetitorKeywordsForSiteRow[] } | { success: false; error: string; data: CompetitorKeywordsForSiteRow[] }
  > {
    return apiGet(V1Routes.keywordsDomain(projectId));
  },

  updateStatus(
    keywordId: string,
    projectId: string,
    status: KeywordStatus
  ): Promise<{ success: boolean; error?: string }> {
    return apiPatch(V1Routes.keywordStatus(projectId, keywordId), { status });
  },

  bulkStatus(
    projectId: string,
    keywordIds: string[],
    status: KeywordStatus
  ): Promise<{ success: boolean; error?: string }> {
    return apiPost(V1Routes.keywordsBulkStatus(projectId), { keywordIds, status });
  },

  deleteKeyword(
    projectId: string,
    keywordId: string
  ): Promise<{ success: true } | { success: false; error: string }> {
    return apiDelete(V1Routes.keyword(projectId, keywordId));
  },

  approveCluster(
    projectId: string,
    phrases: string[]
  ): Promise<{ success: boolean; error?: string; updated: number }> {
    return apiPost(V1Routes.keywordsApproveCluster(projectId), { phrases });
  },
};
