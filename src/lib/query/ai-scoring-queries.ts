"use client";

import { useQuery } from "@tanstack/react-query";
import { getAiScoringRunStatus, type AiScoringScope } from "@/app/actions/ai-scoring-actions";
import { qk } from "./keys";

/**
 * Polls the AI-scoring run status for a project/scope. Fetches once on mount
 * (restoring "running" state after a refresh or navigation), then keeps polling
 * every 3s only while the server reports the run is still active.
 */
export function useAiScoringRunStatus(projectId: string, scope: AiScoringScope) {
  return useQuery({
    queryKey: qk.aiScoringRun(projectId, scope),
    queryFn: () => getAiScoringRunStatus(projectId, scope),
    enabled: !!projectId,
    refetchInterval: (query) => (query.state.data?.status === "running" ? 3000 : false),
  });
}
