import { useDispatch, useSelector, type TypedUseSelectorHook } from "react-redux";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { defaultPrefs, type ProjectStatsSnapshot } from "@/lib/redux/keyword-workspace-slice";
import { normalizeAuditGenerationUrl } from "@/lib/redux/audit-generations-slice";
import type { AuditScheduleEntry } from "@/lib/redux/audit-schedules-slice";

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

const EMPTY_GENERATED_MAP: Record<string, string> = {};
const EMPTY_SCHEDULED_MAP: Record<string, AuditScheduleEntry> = {};

/** A project's audit-URL → generated-blogId map (stable empty-object fallback). */
export function selectAuditGenerationsForProject(
  state: RootState,
  projectId: string
): Record<string, string> {
  return state.auditGenerations.byProject[projectId] ?? EMPTY_GENERATED_MAP;
}

/** The generated blogId for a single audited URL, or null if none yet. */
export function selectGeneratedBlogId(
  state: RootState,
  projectId: string,
  url: string
): string | null {
  return state.auditGenerations.byProject[projectId]?.[normalizeAuditGenerationUrl(url)] ?? null;
}

/** A project's audit-URL → { entryId, scheduledDate } map (stable empty-object fallback). */
export function selectAuditSchedulesForProject(
  state: RootState,
  projectId: string
): Record<string, AuditScheduleEntry> {
  return state.auditSchedules.byProject[projectId] ?? EMPTY_SCHEDULED_MAP;
}

/** The calendar schedule for a single audited URL, or null if not scheduled. */
export function selectAuditSchedule(
  state: RootState,
  projectId: string,
  url: string
): AuditScheduleEntry | null {
  return state.auditSchedules.byProject[projectId]?.[normalizeAuditGenerationUrl(url)] ?? null;
}

export function selectKeywordPrefs(state: RootState, projectId: string) {
  const p = state.keywordWorkspace.projects[projectId]?.prefs;
  if (!p) return defaultPrefs;
  return {
    ...defaultPrefs,
    ...p,
    tableSort: { ...defaultPrefs.tableSort, ...p.tableSort },
    discoverySourceTab: p.discoverySourceTab ?? defaultPrefs.discoverySourceTab,
    mainTab: p.mainTab ?? defaultPrefs.mainTab,
    competitorFilter: p.competitorFilter ?? defaultPrefs.competitorFilter,
  };
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
 * Per-keyword calendar scheduling state. Populated on calendar page load and
 * updated optimistically when a keyword is scheduled/rescheduled.
 */
export function selectCalendarScheduledKeywords(state: RootState, projectId: string) {
  return state.keywordWorkspace.projects[projectId]?.calendarScheduledKeywords ?? {};
}

export function selectAiSuggestedKeywordIds(state: RootState, projectId: string) {
  return state.keywordWorkspace.projects[projectId]?.aiAssistant?.suggestedKeywordIds ?? [];
}

export function selectAiSuggestedGapKeywords(state: RootState, projectId: string) {
  return state.keywordWorkspace.projects[projectId]?.aiAssistant?.suggestedGapKeywords ?? [];
}

export function selectAiLowCompetitionKeywordIds(state: RootState, projectId: string) {
  return state.keywordWorkspace.projects[projectId]?.aiAssistant?.lowCompetitionKeywordIds ?? [];
}

export function selectAiLongTailKeywordIds(state: RootState, projectId: string) {
  return state.keywordWorkspace.projects[projectId]?.aiAssistant?.longTailKeywordIds ?? [];
}

export function selectContentHealthAuditWorkspace(state: RootState, projectId: string) {
  return state.contentHealthAudit.projects[projectId] ?? null;
}

export function selectUploadHistory(state: RootState, projectId: string) {
  return state.contentHealthAudit.projects[projectId]?.uploadHistory ?? [];
}

export type ChatMsgToolCall = {
  id: string;
  params: Record<string, unknown>;
  durationMs: number;
  result: {
    success: boolean;
    message: string;
    error?: string;
    data?: unknown;
    sideEffect?: string;
  };
};

export type ChatMsg = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  text: string;
  page: "keywords" | "competitors" | "calendar" | "blogs" | "audit";
  timestamp: string;
  /** Tool execution results rendered with this message — persisted so the
   * scroll-back keeps showing them after the next turn. */
  toolCalls?: ChatMsgToolCall[];
  /** Suggestion cards rendered with this message — typed loosely so the
   * selector doesn't depend on the chatbot's internal `ContextualSuggestion`
   * shape. The chatbot casts back to the typed shape on render. */
  suggestions?: Array<Record<string, unknown> | unknown>;
};

export type ChatSession = {
  id: string;
  title: string;
  page: "keywords" | "competitors" | "calendar" | "blogs" | "audit";
  createdAt: string;
  lastMessageAt: string;
};

export function selectAiMemory(state: RootState, projectId: string) {
  const fallback = {
    suggestedKeywordIds: [] as string[],
    suggestedGapKeywords: [] as string[],
    lowCompetitionKeywordIds: [] as string[],
    longTailKeywordIds: [] as string[],
    selectedKeywordIds: [] as string[],
    lastAction: null as string | null,
    preferredFilter: "all" as const,
    recentQueries: [] as string[],
    chatHistory: [] as ChatMsg[],
    chatSessions: [] as ChatSession[],
  };
  const raw = state.keywordWorkspace.projects[projectId]?.aiAssistant;
  if (!raw) return fallback;
  return {
    ...fallback,
    ...raw,
    recentQueries: Array.isArray(raw.recentQueries) ? raw.recentQueries : [],
    chatHistory: Array.isArray(raw.chatHistory)
      ? (raw.chatHistory as Array<Partial<ChatMsg> & {
          role: "user" | "assistant";
          text: string;
          page: ChatMsg["page"];
          timestamp: string;
        }>).map((m, i) => ({
          id: m.id ?? `legacy-${i}-${m.timestamp}`,
          sessionId: m.sessionId ?? "legacy",
          role: m.role,
          text: m.text,
          page: m.page,
          timestamp: m.timestamp,
          toolCalls: m.toolCalls,
          suggestions: m.suggestions,
        }))
      : ([] as ChatMsg[]),
    chatSessions: Array.isArray(
      (raw as { chatSessions?: unknown }).chatSessions
    )
      ? ((raw as { chatSessions: ChatSession[] }).chatSessions)
      : ([] as ChatSession[]),
  };
}
