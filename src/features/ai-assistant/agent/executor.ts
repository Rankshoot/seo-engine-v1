import type { AppDispatch } from "@/lib/redux/store";
import { aiAssistantMemoryUpdated, rememberKeywordFilter } from "@/lib/redux/keyword-workspace-slice";
import type { ContextualActionType } from "@/features/ai-assistant/types";

interface ExecutorOptions {
  dispatch: AppDispatch;
  projectId: string;
  lowCompetitionIds: string[];
  longTailIds: string[];
}

export function executeAgentAction(action: ContextualActionType, options: ExecutorOptions) {
  const { dispatch, projectId, lowCompetitionIds, longTailIds } = options;

  if (action === "FILTER_LOW_COMPETITION") {
    dispatch(rememberKeywordFilter({ projectId, filter: "all" }));
    dispatch(
      aiAssistantMemoryUpdated({
        projectId,
        preferredFilter: "all",
        selectedKeywordIds: lowCompetitionIds,
        lastAction: action,
      })
    );
    return;
  }

  if (action === "SUGGEST_LONG_TAIL") {
    dispatch(rememberKeywordFilter({ projectId, filter: "all" }));
    dispatch(
      aiAssistantMemoryUpdated({
        projectId,
        preferredFilter: "all",
        selectedKeywordIds: longTailIds,
        lastAction: action,
      })
    );
    return;
  }

  // Navigation actions — jump to the relevant project page.
  if (action === "OPEN_CALENDAR" && typeof window !== "undefined") {
    window.location.href = `/projects/${projectId}/calendar`;
    return;
  }
  if (action === "OPEN_KEYWORDS" && typeof window !== "undefined") {
    window.location.href = `/projects/${projectId}/keywords`;
    return;
  }

  dispatch(
    aiAssistantMemoryUpdated({
      projectId,
      lastAction: action,
    })
  );
}
