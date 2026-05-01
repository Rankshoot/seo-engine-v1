import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Keyword, KeywordStatus } from "@/lib/types";
import type { BusinessBrief } from "@/lib/business-brief";

export type CalendarScheduledKeyword = {
  date: string;
  status: string;
};

export type KeywordFilterTab = "all" | KeywordStatus;
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

/**
 * Session-scoped keyword list cache. Avoids a network round-trip when
 * navigating back to the keywords page. Cleared on keyword discovery.
 */
type KeywordsCache = {
  keywords: Keyword[];
  total: number;
  /** epoch-ms — used as React Query initialDataUpdatedAt so it never re-fetches */
  loadedAt: number;
};

/**
 * Session-scoped business brief cache. Avoids re-fetching on page refresh.
 * Cleared when user explicitly clicks "Refresh brief".
 */
type BriefCache = {
  brief: BusinessBrief | null;
  updatedAt: string | null;
  /** epoch-ms — used as React Query initialDataUpdatedAt */
  loadedAt: number;
};

type ProjectKeywordWorkspace = {
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
  /** Full keyword list — avoids re-fetching on navigation */
  keywordsCache: KeywordsCache | null;
  /** Business brief — avoids re-fetching on page refresh */
  briefCache: BriefCache | null;
  /**
   * Per-keyword calendar scheduling state. Hydrated from server on load,
   * updated optimistically when user schedules/reschedules.
   * Key: keyword ID, Value: { date, status }
   */
  calendarScheduledKeywords: Record<string, CalendarScheduledKeyword>;
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
    keywordsCache: null,
    briefCache: null,
    calendarScheduledKeywords: {},
  };
  // Backfill for existing persisted state that predates this field
  state.projects[projectId].calendarScheduledKeywords ??= {};
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

      // Keep the cached list in sync so status badges are correct on back-navigation.
      if (project.keywordsCache) {
        project.keywordsCache.keywords = project.keywordsCache.keywords.map(kw =>
          kw.id === action.payload.keywordId ? { ...kw, status: action.payload.nextStatus } : kw
        );
      }
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

      if (project.keywordsCache) {
        const idSet = new Set(action.payload.keywordIds);
        project.keywordsCache.keywords = project.keywordsCache.keywords.map(kw =>
          idSet.has(kw.id) ? { ...kw, status: action.payload.nextStatus } : kw
        );
      }
    },

    /** Remove a keyword from the status overlay and cached list. */
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
      if (project.keywordsCache) {
        project.keywordsCache.keywords = project.keywordsCache.keywords.filter(
          kw => kw.id !== action.payload.keywordId
        );
        project.keywordsCache.total = Math.max(0, project.keywordsCache.total - 1);
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
     * Store the full keyword list so the next navigation to the keywords page
     * renders instantly from this cache instead of hitting the API.
     */
    keywordsLoaded(
      state,
      action: PayloadAction<{ projectId: string; keywords: Keyword[]; total: number }>
    ) {
      ensureProject(state, action.payload.projectId).keywordsCache = {
        keywords: action.payload.keywords,
        total: action.payload.total,
        loadedAt: Date.now(),
      };
    },

    /**
     * Wipe the keyword cache before discovery so fresh results are fetched
     * rather than being shadowed by the old list.
     */
    clearKeywordsCache(state, action: PayloadAction<{ projectId: string }>) {
      ensureProject(state, action.payload.projectId).keywordsCache = null;
    },

    /**
     * Store the business brief so the keywords page renders instantly on
     * page refresh without a round-trip to the DB.
     */
    briefLoaded(
      state,
      action: PayloadAction<{ projectId: string; brief: BusinessBrief | null; updatedAt: string | null }>
    ) {
      ensureProject(state, action.payload.projectId).briefCache = {
        brief: action.payload.brief,
        updatedAt: action.payload.updatedAt,
        loadedAt: Date.now(),
      };
    },

    /** Wipe the brief cache so the next render fetches a fresh copy. */
    clearBriefCache(state, action: PayloadAction<{ projectId: string }>) {
      ensureProject(state, action.payload.projectId).briefCache = null;
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
  keywordsLoaded,
  clearKeywordsCache,
  briefLoaded,
  clearBriefCache,
  calendarKeywordScheduled,
  calendarEntriesHydrated,
} = keywordWorkspaceSlice.actions;

export { defaultPrefs };
