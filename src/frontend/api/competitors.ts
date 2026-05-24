import type {
  BenchmarkState,
  LoadMoreCompetitorGapsResult,
  RunBenchmarkResult,
} from "@/app/actions/competitor-actions";
import { apiGet, apiPost } from "./http";
import { V1Routes } from "./routes";

export const competitorsApi = {
  benchmark(projectId: string): Promise<BenchmarkState> {
    return apiGet(V1Routes.competitorsBenchmark(projectId));
  },

  runBenchmark(projectId: string): Promise<RunBenchmarkResult> {
    return apiPost(V1Routes.competitorsBenchmark(projectId));
  },

  loadMoreFromAhrefs(projectId: string): Promise<LoadMoreCompetitorGapsResult> {
    return apiPost(V1Routes.competitorsLoadMoreAhrefs(projectId));
  },

  blogFromOpportunity(
    projectId: string,
    keyword: string
  ): Promise<
    | {
        success: true;
        entryId: string;
        keywordId: string;
        scheduledDate?: string;
        alreadyOnCalendar?: true;
      }
    | { success: false; error: string }
  > {
    return apiPost(V1Routes.competitorsBlogFromOpportunity(projectId), { keyword });
  },
};
