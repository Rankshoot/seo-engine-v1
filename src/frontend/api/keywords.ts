import type { Keyword, KeywordStatus, ContentType } from "@/lib/types";
import type { CompetitorKeywordsForSiteRow, DataForSEOTraceEntry } from "@/lib/dataforseo";
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
  ahrefsDiscoveryState?: {
    matching_last_volume: number | null;
    matching_has_more: boolean;
    related_last_volume: number | null;
    related_has_more: boolean;
  };
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

  loadMoreFromAhrefs(projectId: string): Promise<{ success: boolean; error?: string; count?: number }> {
    return apiPost(V1Routes.keywordsLoadMoreAhrefs(projectId));
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
    | {
        success: true;
        data: CompetitorKeywordsForSiteRow[];
        fromCache?: boolean;
        lastFetchedAt?: string | null;
      }
    | {
        success: false;
        error: string;
        data: CompetitorKeywordsForSiteRow[];
        fromCache?: boolean;
        lastFetchedAt?: string | null;
      }
  > {
    return apiGet(V1Routes.keywordsDomain(projectId));
  },

  /** Calls DataForSEO and overwrites the domain-keyword snapshot (Re-discover). */
  domainKeywordsRefresh(projectId: string): Promise<
    | {
        success: true;
        data: CompetitorKeywordsForSiteRow[];
        fromCache: boolean;
        lastFetchedAt: string | null;
        discoveryTrace?: DataForSEOTraceEntry[];
      }
    | {
        success: false;
        error: string;
        data: CompetitorKeywordsForSiteRow[];
        fromCache: boolean;
        lastFetchedAt: string | null;
        discoveryTrace?: DataForSEOTraceEntry[];
      }
  > {
    return apiPost(V1Routes.keywordsDomain(projectId), { action: "refresh" });
  },

  upsertDomainKeyword(
    projectId: string,
    row: Pick<
      CompetitorKeywordsForSiteRow,
      "keyword" | "volume" | "kd" | "cpc" | "intent" | "estimated_monthly_traffic"
    >,
    status: KeywordStatus
  ): Promise<
    | {
        success: true;
        id: string;
        scheduledDate?: string;
        calendarSkipped?: boolean;
        calendarError?: string;
      }
    | { success: false; error?: string }
  > {
    return apiPost(V1Routes.keywordsDomain(projectId), { row, status });
  },

  updateStatus(
    keywordId: string,
    projectId: string,
    status: KeywordStatus
  ): Promise<{
    success: boolean;
    error?: string;
    scheduledDate?: string;
    calendarSkipped?: boolean;
    calendarError?: string;
  }> {
    return apiPatch(V1Routes.keywordStatus(projectId, keywordId), { status });
  },

  schedule(
    projectId: string,
    keywordId: string,
    payload: {
      contentType: ContentType;
      keyword?: string;
      volume?: number;
      kd?: number;
      cpc?: number;
      intent?: string;
      source?: string;
      competitorDomain?: string;
      rankingUrl?: string;
      rank?: number;
    }
  ): Promise<{
    success: boolean;
    error?: string;
    scheduledDate?: string;
    keywordId?: string;
    keywordStatus?: string;
    keyword?: any;
    calendarEntry?: any;
  }> {
    return apiPost(V1Routes.keywordSchedule(projectId, keywordId), payload);
  },

  bulkStatus(
    projectId: string,
    keywordIds: string[],
    status: KeywordStatus
  ): Promise<{
    success: boolean;
    error?: string;
    calendarScheduled?: number;
    calendarSkipped?: number;
    firstScheduledDate?: string;
    calendarError?: string;
  }> {
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
