import { combineReducers, configureStore } from "@reduxjs/toolkit";
import {
  keywordWorkspaceSlice,
  type KeywordWorkspaceState,
  type ProjectKeywordWorkspace,
} from "@/lib/redux/keyword-workspace-slice";
import { dataRestSlice, type DataRestState } from "@/lib/redux/data-rest-slice";

const STORAGE_KEY = "seo-engine:redux:v1";

const rootReducer = combineReducers({
  keywordWorkspace: keywordWorkspaceSlice.reducer,
  dataRest: dataRestSlice.reducer,
});

type RootStateFromReducer = ReturnType<typeof rootReducer>;
type PersistedState = Partial<Pick<RootStateFromReducer, "keywordWorkspace">>;

function stripLegacyApiCaches(state: PersistedState): PersistedState {
  const kw = state.keywordWorkspace;
  if (!kw?.projects) return state;
  const projects = { ...kw.projects } as Record<string, ProjectKeywordWorkspace & Record<string, unknown>>;
  for (const id of Object.keys(projects)) {
    const p = { ...projects[id] } as ProjectKeywordWorkspace & Record<string, unknown>;
    delete p.keywordsCache;
    delete p.briefCache;
    projects[id] = p as ProjectKeywordWorkspace;
  }
  return { keywordWorkspace: { ...kw, projects } };
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
export type { KeywordWorkspaceState, DataRestState };

export { persistState };
