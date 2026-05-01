import { combineReducers, configureStore } from "@reduxjs/toolkit";
import {
  keywordWorkspaceSlice,
  type KeywordWorkspaceState,
} from "@/lib/redux/keyword-workspace-slice";

const STORAGE_KEY = "seo-engine:redux:v1";

const rootReducer = combineReducers({
  keywordWorkspace: keywordWorkspaceSlice.reducer,
});

type RootStateFromReducer = ReturnType<typeof rootReducer>;
type PersistedState = Partial<Pick<RootStateFromReducer, "keywordWorkspace">>;

function loadPersistedState(): PersistedState | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : undefined;
  } catch {
    return undefined;
  }
}

function persistState(state: RootStateFromReducer) {
  if (typeof window === "undefined") return;
  try {
    const persisted: PersistedState = {
      keywordWorkspace: state.keywordWorkspace,
    };
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
export type { KeywordWorkspaceState };

export { persistState };
