import { combineReducers, configureStore } from "@reduxjs/toolkit";
import {
  keywordWorkspaceSlice,
  type KeywordWorkspaceState,
  type ProjectKeywordWorkspace,
} from "@/lib/redux/keyword-workspace-slice";
import {
  contentHealthAuditSlice,
  type ContentHealthAuditState,
} from "@/lib/redux/content-health-audit-slice";
import { dataRestSlice, type DataRestState } from "@/lib/redux/data-rest-slice";
import { auditGenerationsSlice } from "@/lib/redux/audit-generations-slice";
import { auditSchedulesSlice } from "@/lib/redux/audit-schedules-slice";

const STORAGE_KEY = "seo-engine:redux:v1";

const rootReducer = combineReducers({
  keywordWorkspace: keywordWorkspaceSlice.reducer,
  contentHealthAudit: contentHealthAuditSlice.reducer,
  dataRest: dataRestSlice.reducer,
  // Audit-URL → generated-blog map. Not persisted (rehydrated from the server).
  auditGenerations: auditGenerationsSlice.reducer,
  // Audit-URL → calendar-schedule map. Not persisted (rehydrated from the server).
  auditSchedules: auditSchedulesSlice.reducer,
});

type RootStateFromReducer = ReturnType<typeof rootReducer>;
type PersistedState = Partial<Pick<RootStateFromReducer, "keywordWorkspace" | "contentHealthAudit">>;

function sanitizeContentHealthForPersist(
  ch: ContentHealthAuditState | undefined
): ContentHealthAuditState | undefined {
  if (!ch?.projects) return ch;
  return {
    projects: Object.fromEntries(
      Object.entries(ch.projects).map(([pid, p]) => [
        pid,
        {
          ...p,
          loading: "idle" as const,
          error: null,
          stale: typeof p.stale === "boolean" ? p.stale : false,
        },
      ])
    ),
  };
}

function stripLegacyApiCaches(state: PersistedState): PersistedState {
  let next: PersistedState = { ...state };
  const kw = next.keywordWorkspace;
  if (kw?.projects) {
    const projects = { ...kw.projects } as Record<string, ProjectKeywordWorkspace & Record<string, unknown>>;
    for (const id of Object.keys(projects)) {
      const p = { ...projects[id] } as ProjectKeywordWorkspace & Record<string, unknown>;
      delete p.keywordsCache;
      delete p.briefCache;
      projects[id] = p as ProjectKeywordWorkspace;
    }
    next = { ...next, keywordWorkspace: { ...kw, projects } };
  }
  if (next.contentHealthAudit) {
    next = { ...next, contentHealthAudit: sanitizeContentHealthForPersist(next.contentHealthAudit) };
  }
  return next;
}

function loadPersistedState(): PersistedState | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as PersistedState;
    return stripLegacyApiCaches(parsed);
  } catch {
    return undefined;
  }
}

function persistState(state: RootStateFromReducer) {
  if (typeof window === "undefined") return;
  try {
    const persisted: PersistedState = stripLegacyApiCaches({
      keywordWorkspace: state.keywordWorkspace,
      contentHealthAudit: sanitizeContentHealthForPersist(state.contentHealthAudit),
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // Storage can be unavailable in private windows. Redux should keep working.
  }
}

export function makeStore(preloadedState?: PersistedState) {
  return configureStore({
    reducer: rootReducer,
    preloadedState: preloadedState ?? loadPersistedState(),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
export type { KeywordWorkspaceState, ContentHealthAuditState, DataRestState };

export { persistState };
