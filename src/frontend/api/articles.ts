import type { ArticleLibraryEntry } from "@/lib/types";
import { apiGet } from "./http";
import { V1Routes } from "./routes";

export const articlesApi = {
  library(projectId: string): Promise<{
    success: boolean;
    error?: string;
    data: ArticleLibraryEntry[];
  }> {
    return apiGet(V1Routes.projectArticlesLibrary(projectId));
  },
};
