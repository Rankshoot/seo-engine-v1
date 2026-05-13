import type { ArticleLibraryEntry } from "@/lib/types";
import { apiGet } from "./http";
import { V1Routes } from "./routes";

export type ContentGeneratorHistoryRow = ArticleLibraryEntry & {
  in_articles_library?: boolean;
  /** Set when the blog has been placed on the calendar (Schedule from this page). */
  entry_id?: string | null;
  /** ISO date (YYYY-MM-DD) joined from `calendar_entries.scheduled_date`. */
  scheduled_date?: string | null;
};

export const contentGeneratorApi = {
  history(projectId: string): Promise<{
    success: boolean;
    error?: string;
    data: ContentGeneratorHistoryRow[];
  }> {
    return apiGet(V1Routes.projectContentGeneratorHistory(projectId));
  },
};
