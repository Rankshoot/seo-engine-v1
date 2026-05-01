import { useDispatch, useSelector, type TypedUseSelectorHook } from "react-redux";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { defaultPrefs, type ProjectStatsSnapshot } from "@/lib/redux/keyword-workspace-slice";

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export function selectKeywordPrefs(state: RootState, projectId: string) {
  return state.keywordWorkspace.projects[projectId]?.prefs ?? defaultPrefs;
}

export function selectKeywordStatuses(state: RootState, projectId: string) {
  return state.keywordWorkspace.projects[projectId]?.statuses ?? {};
}

export function selectProjectStats(
  state: RootState,
  projectId: string,
  fallback?: ProjectStatsSnapshot
) {
  return state.keywordWorkspace.projects[projectId]?.stats ?? fallback;
}

export function selectCalendarRefreshVersion(state: RootState, projectId: string) {
  return state.keywordWorkspace.projects[projectId]?.calendarRefreshVersion ?? 0;
}

export function selectCalendarLastSyncedVersion(state: RootState, projectId: string) {
  return state.keywordWorkspace.projects[projectId]?.calendarLastSyncedVersion ?? 0;
}

/**
 * Session-cached keyword list. When non-null, the keywords page uses it as
 * React Query `initialData` so revisiting the page never triggers a network call.
 */
export function selectKeywordsCache(state: RootState, projectId: string) {
  return state.keywordWorkspace.projects[projectId]?.keywordsCache ?? null;
}

/**
 * Session-cached business brief. When non-null, the keywords page uses it as
 * React Query `initialData` so page-refresh doesn't re-fetch the brief.
 */
export function selectBriefCache(state: RootState, projectId: string) {
  return state.keywordWorkspace.projects[projectId]?.briefCache ?? null;
}
