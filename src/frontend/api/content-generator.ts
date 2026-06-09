import type { ArticleLibraryEntry, ContentType } from "@/lib/types";
import type { ContentStudioHistoryRow } from "@/app/actions/content-actions";
import { apiGet } from "./http";
import { V1Routes } from "./routes";

export type ContentGeneratorHistoryRow = ArticleLibraryEntry & {
  in_articles_library?: boolean;
  /** Set when the blog has been placed on the calendar (Schedule from this page). */
  entry_id?: string | null;
  /** ISO date (YYYY-MM-DD) joined from `calendar_entries.scheduled_date`. */
  scheduled_date?: string | null;
};

export type { ContentStudioHistoryRow };

export const contentGeneratorApi = {
  history(projectId: string): Promise<{
    success: boolean;
    error?: string;
    data: ContentGeneratorHistoryRow[];
  }> {
    return apiGet(V1Routes.projectContentGeneratorHistory(projectId));
  },

  /**
   * Unified Content Studio history — supports filtering by content type and
   * status. When `types` is omitted, returns all four content types in one
   * list (the `/content-generator/history` page reads from this).
   */
  studioHistory(
    projectId: string,
    filter: {
      types?: ContentType[];
      statuses?: string[];
      limit?: number;
      offset?: number;
      search?: string;
      sort?: string;
    } = {},
  ): Promise<{
    success: boolean;
    error?: string;
    data: ContentStudioHistoryRow[];
    total: number;
    hasMore: boolean;
    counts: Record<ContentType, number>;
  }> {
    // Original query parameter logic (commented out - both endpoints return same response)
    // const search = new URLSearchParams();
    // if (filter.types?.length) search.set("types", filter.types.join(","));
    // if (filter.statuses?.length) search.set("statuses", filter.statuses.join(","));
    // if (filter.limit !== undefined) search.set("limit", String(filter.limit));
    // if (filter.offset !== undefined) search.set("offset", String(filter.offset));
    // if (filter.search) search.set("search", filter.search);
    // if (filter.sort) search.set("sort", filter.sort);
    // const qs = search.toString();
    // const path = qs
    //   ? `${V1Routes.projectContentStudioHistory(projectId)}?${qs}`
    //   : V1Routes.projectContentStudioHistory(projectId);
    
    // Use simple endpoint without query parameters
    const path = V1Routes.projectContentStudioHistory(projectId);
    return apiGet(path);
  },
};
