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
    const qs = new URLSearchParams();
    if (filter.types?.length) qs.set("types", filter.types.join(","));
    if (filter.statuses?.length) qs.set("statuses", filter.statuses.join(","));
    if (filter.limit !== undefined) qs.set("limit", String(filter.limit));
    if (filter.offset !== undefined) qs.set("offset", String(filter.offset));
    if (filter.search) qs.set("search", filter.search);
    if (filter.sort) qs.set("sort", filter.sort);
    const qsStr = qs.toString();
    const path = qsStr
      ? `${V1Routes.projectContentStudioHistory(projectId)}?${qsStr}`
      : V1Routes.projectContentStudioHistory(projectId);
    return apiGet(path);
  },
};
