import type { ArticleLibraryEntry } from "@/lib/types";
import { apiGet } from "./http";
import { V1Routes } from "./routes";

export type ContentGeneratorHistoryRow = ArticleLibraryEntry & { in_articles_library?: boolean };

export const contentGeneratorApi = {
  history(projectId: string): Promise<{
    success: boolean;
    error?: string;
    data: ContentGeneratorHistoryRow[];
  }> {
    return apiGet(V1Routes.projectContentGeneratorHistory(projectId));
  },
};
