import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Keyword, KeywordStatus } from "@/lib/types";

export type CalendarScheduledKeyword = {
  date: string;
  status: string;
};

export type KeywordFilterTab =
  | "all"
  | "ai"
  | "low_competition"
  | "long_tail"
  | KeywordStatus;
export type KeywordTableSortColumn =
  | "keyword"
  | "volume"
  | "kd"
  | "cpc"
  | "intent"
  | "ai_score"
  | "analysis_score"
  | "status";
export type KeywordSortDir = "asc" | "desc";

export type ProjectStatsSnapshot = {
  approvedKeywords: number;
  calendarEntries: number;
  blogsGenerated: number;
  auditPending?: number;
};

type KeywordTablePrefs = {
  filter: KeywordFilterTab;
  tableSort: { column: KeywordTableSortColumn; dir: KeywordSortDir };
};

export type ProjectKeywordWorkspace = {
  prefs: KeywordTablePrefs;
  /** Optimistic overlay: maps keyword ID → status for instant badge updates */
  statuses: Record<string, KeywordStatus>;
  /** Sidebar stats (approved count, calendar entries, blogs) */
  stats?: ProjectStatsSnapshot;
  /**
   * Incremented each time a keyword is approved → signals calendar page to
   * invalidate. `calendarLastSyncedVersion` tracks what was already processed
   * so calendar doesn't re-fetch on every navigation if nothing changed.
   */
  calendarRefreshVersion: number;
  calendarLastSyncedVersion: number;
  /**
   * Per-keyword calendar scheduling state. Hydrated from server on load,
   * updated optimistically when user schedules/reschedules.
   * Key: keyword ID, Value: { date, status }
   */
  calendarScheduledKeywords: Record<string, CalendarScheduledKeyword>;
  aiAssistant: {
    suggestedKeywordIds: string[];
    suggestedGapKeywords: string[];
    lowCompetitionKeywordIds: string[];
    longTailKeywordIds: string[];
    selectedKeywordIds: string[];
    lastAction: string | null;
    preferredFilter: "all" | "low_competition" | "long_tail" | "ai";
    recentQueries: string[];
    chatHistory: Array<{
      id: string;
      sessionId: string;
      role: "user" | "assistant";
      text: string;
      page: "keywords" | "competitors" | "calendar" | "blogs" | "audit";
      timestamp: string;
      /**
       * Tool execution results that were rendered alongside this message.
       * Persisted so the chat scroll-back keeps showing them after the next
       * turn instead of disappearing with `result` state.
       */
      toolCalls?: Array<{
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
      }>;
      /** Suggestion cards rendered alongside this message. Stored loosely so
       * Redux doesn't depend on the chatbot's internal types. */
      suggestions?: Array<Record<string, unknown> | unknown>;
    }>;
    chatSessions: Array<{
      id: string;
      title: string;
      page: "keywords" | "competitors" | "calendar" | "blogs" | "audit";
      createdAt: string;
      lastMessageAt: string;
    }>;
  };
};

export type KeywordWorkspaceState = {
  projects: Record<string, ProjectKeywordWorkspace>;
};

const defaultPrefs: KeywordTablePrefs = {
  filter: "all",
  tableSort: { column: "analysis_score", dir: "desc" },
};

const initialState: KeywordWorkspaceState = {
  projects: {},
};

function ensureProject(state: KeywordWorkspaceState, projectId: string) {
  state.projects[projectId] ??= {
    prefs: { ...defaultPrefs, tableSort: { ...defaultPrefs.tableSort } },
    statuses: {},
    calendarRefreshVersion: 0,
    calendarLastSyncedVersion: 0,
    calendarScheduledKeywords: {},
    aiAssistant: {
      suggestedKeywordIds: [],
      suggestedGapKeywords: [],
      lowCompetitionKeywordIds: [],
      longTailKeywordIds: [],
      selectedKeywordIds: [],
      lastAction: null,
      preferredFilter: "all",
      recentQueries: [],
      chatHistory: [],
      chatSessions: [],
    },
  };
  // Backfill for existing persisted state that predates this field
  state.projects[projectId].calendarScheduledKeywords ??= {};
  state.projects[projectId].aiAssistant ??= {
    suggestedKeywordIds: [],
    suggestedGapKeywords: [],
    lowCompetitionKeywordIds: [],
    longTailKeywordIds: [],
    selectedKeywordIds: [],
    lastAction: null,
    preferredFilter: "all",
    recentQueries: [],
    chatHistory: [],
    chatSessions: [],
  };
  // Backfill chatSessions for persisted state that predates this field
  (state.projects[projectId].aiAssistant as { chatSessions?: unknown[] }).chatSessions ??= [];
  return state.projects[projectId];
}

function approvedDelta(previousStatus: KeywordStatus | undefined, nextStatus: KeywordStatus) {
  if (previousStatus === nextStatus) return 0;
  if (previousStatus === "approved") return -1;
  if (nextStatus === "approved") return 1;
  return 0;
}

function applyStatsDelta(project: ProjectKeywordWorkspace, delta: number) {
  if (!project.stats || delta === 0) return;
  project.stats.approvedKeywords = Math.max(0, project.stats.approvedKeywords + delta);
  if (delta > 0) {
    project.stats.calendarEntries += delta;
    project.calendarRefreshVersion += 1;
  }
}

export const keywordWorkspaceSlice = createSlice({
  name: "keywordWorkspace",
  initialState,
  reducers: {
    rememberKeywordFilter(
      state,
      action: PayloadAction<{ projectId: string; filter: KeywordFilterTab }>
    ) {
      ensureProject(state, action.payload.projectId).prefs.filter = action.payload.filter;
    },

    rememberKeywordSort(
      state,
      action: PayloadAction<{
        projectId: string;
        tableSort: { column: KeywordTableSortColumn; dir: KeywordSortDir };
      }>
    ) {
      ensureProject(state, action.payload.projectId).prefs.tableSort = action.payload.tableSort;
    },

    /**
     * Seed the optimistic status overlay from a freshly-loaded keyword list.
     * Only fills in keys not already present this session — preserves any
     * pending optimistic updates the user made.
     */
    mergeKeywordStatuses(
      state,
      action: PayloadAction<{ projectId: string; statuses: Record<string, KeywordStatus> }>
    ) {
      const project = ensureProject(state, action.payload.projectId);
      project.statuses = { ...action.payload.statuses, ...project.statuses };
    },

    /** Single keyword approve / reject — fires instantly, then API confirms. */
    keywordStatusChanged(
      state,
      action: PayloadAction<{
        projectId: string;
        keywordId: string;
        nextStatus: KeywordStatus;
        previousStatus?: KeywordStatus;
      }>
    ) {
      const project = ensureProject(state, action.payload.projectId);
      const previousStatus =
        action.payload.previousStatus ?? project.statuses[action.payload.keywordId];
      project.statuses[action.payload.keywordId] = action.payload.nextStatus;
      applyStatsDelta(project, approvedDelta(previousStatus, action.payload.nextStatus));
    },

    /** Bulk approve / reject — mass-select mode. */
    bulkKeywordStatusChanged(
      state,
      action: PayloadAction<{
        projectId: string;
        keywordIds: string[];
        nextStatus: KeywordStatus;
      }>
    ) {
      const project = ensureProject(state, action.payload.projectId);
      let totalDelta = 0;
      for (const keywordId of action.payload.keywordIds) {
        const previousStatus = project.statuses[keywordId];
        project.statuses[keywordId] = action.payload.nextStatus;
        totalDelta += approvedDelta(previousStatus, action.payload.nextStatus);
      }
      applyStatsDelta(project, totalDelta);
    },

    /** Remove a keyword from the status overlay. */
    removeKeywordStatus(
      state,
      action: PayloadAction<{ projectId: string; keywordId: string; previousStatus?: KeywordStatus }>
    ) {
      const project = ensureProject(state, action.payload.projectId);
      const previousStatus =
        action.payload.previousStatus ?? project.statuses[action.payload.keywordId];
      delete project.statuses[action.payload.keywordId];
      if (previousStatus === "approved" && project.stats) {
        project.stats.approvedKeywords = Math.max(0, project.stats.approvedKeywords - 1);
      }
    },

    /** Hydrate sidebar stats once per project load — server is the source of truth. */
    hydrateProjectStats(
      state,
      action: PayloadAction<{ projectId: string; stats: ProjectStatsSnapshot }>
    ) {
      ensureProject(state, action.payload.projectId).stats = action.payload.stats;
    },

    /** Keep sidebar calendar count in sync when calendar page loads. */
    calendarEntriesLoaded(
      state,
      action: PayloadAction<{ projectId: string; count: number }>
    ) {
      const project = ensureProject(state, action.payload.projectId);
      project.stats ??= { approvedKeywords: 0, calendarEntries: 0, blogsGenerated: 0 };
      project.stats.calendarEntries = action.payload.count;
    },

    /**
     * Record that the calendar page has processed up to this version so
     * navigating back doesn't trigger a redundant re-fetch.
     */
    calendarSyncVersionUpdated(
      state,
      action: PayloadAction<{ projectId: string; version: number }>
    ) {
      ensureProject(state, action.payload.projectId).calendarLastSyncedVersion =
        action.payload.version;
    },

    /**
     * Bump when calendar-backed data changes off the calendar route (e.g. blog
     * generated on Blogs page) so the calendar query invalidates on next visit.
     */
    calendarRefreshBump(state, action: PayloadAction<{ projectId: string }>) {
      ensureProject(state, action.payload.projectId).calendarRefreshVersion += 1;
    },

    /**
     * Optimistically record that a keyword has been scheduled (or rescheduled)
     * on a specific date. The server-side refetch will confirm with real data.
     */
    calendarKeywordScheduled(
      state,
      action: PayloadAction<{
        projectId: string;
        keywordId: string;
        date: string;
        status: string;
      }>
    ) {
      const project = ensureProject(state, action.payload.projectId);
      project.calendarScheduledKeywords[action.payload.keywordId] = {
        date: action.payload.date,
        status: action.payload.status,
      };
    },

    /**
     * Hydrate the full calendar scheduled-keywords map from a fresh server fetch.
     * Overwrites any stale optimistic state.
     */
    calendarEntriesHydrated(
      state,
      action: PayloadAction<{
        projectId: string;
        entries: { keywordId: string; date: string; status: string }[];
      }>
    ) {
      const project = ensureProject(state, action.payload.projectId);
      project.calendarScheduledKeywords = {};
      for (const e of action.payload.entries) {
        project.calendarScheduledKeywords[e.keywordId] = {
          date: e.date,
          status: e.status,
        };
      }
    },

    aiAssistantMemoryUpdated(
      state,
      action: PayloadAction<{
        projectId: string;
        suggestedKeywordIds?: string[];
        suggestedGapKeywords?: string[];
        lowCompetitionKeywordIds?: string[];
        longTailKeywordIds?: string[];
        selectedKeywordIds?: string[];
        lastAction?: string | null;
        preferredFilter?: "all" | "low_competition" | "long_tail" | "ai";
        recentQueries?: string[];
        chatHistory?: Array<{
          id: string;
          sessionId: string;
          role: "user" | "assistant";
          text: string;
          page: "keywords" | "competitors" | "calendar" | "blogs" | "audit";
          timestamp: string;
          toolCalls?: Array<{
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
          }>;
          suggestions?: Array<Record<string, unknown> | unknown>;
        }>;
        chatSessions?: Array<{
          id: string;
          title: string;
          page: "keywords" | "competitors" | "calendar" | "blogs" | "audit";
          createdAt: string;
          lastMessageAt: string;
        }>;
      }>
    ) {
      const project = ensureProject(state, action.payload.projectId);
      const current = project.aiAssistant;
      if (action.payload.suggestedKeywordIds) {
        current.suggestedKeywordIds = action.payload.suggestedKeywordIds;
      }
      if (action.payload.suggestedGapKeywords) {
        current.suggestedGapKeywords = action.payload.suggestedGapKeywords;
      }
      if (action.payload.lowCompetitionKeywordIds) {
        current.lowCompetitionKeywordIds = action.payload.lowCompetitionKeywordIds;
      }
      if (action.payload.longTailKeywordIds) {
        current.longTailKeywordIds = action.payload.longTailKeywordIds;
      }
      if (action.payload.selectedKeywordIds) {
        current.selectedKeywordIds = action.payload.selectedKeywordIds;
      }
      if (action.payload.lastAction !== undefined) {
        current.lastAction = action.payload.lastAction;
      }
      if (action.payload.preferredFilter) {
        current.preferredFilter = action.payload.preferredFilter;
      }
      if (action.payload.recentQueries) {
        current.recentQueries = action.payload.recentQueries.slice(-12);
      }
      if (action.payload.chatHistory) {
        current.chatHistory = action.payload.chatHistory.slice(-100);
      }
      if (action.payload.chatSessions) {
        current.chatSessions = action.payload.chatSessions.slice(-50);
      }
    },
  },
});

export const {
  rememberKeywordFilter,
  rememberKeywordSort,
  mergeKeywordStatuses,
  keywordStatusChanged,
  bulkKeywordStatusChanged,
  removeKeywordStatus,
  hydrateProjectStats,
  calendarEntriesLoaded,
  calendarSyncVersionUpdated,
  calendarRefreshBump,
  calendarKeywordScheduled,
  calendarEntriesHydrated,
  aiAssistantMemoryUpdated,
} = keywordWorkspaceSlice.actions;

export { defaultPrefs };
