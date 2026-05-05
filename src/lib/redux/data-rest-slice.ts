import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/**
 * Mirrors last successful REST (`/api/v1`) payloads for DevTools-friendly
 * debugging — TanStack Query remains the primary cache; this is a readable
 * secondary mirror keyed by project.
 */
export type SiteExplorerRestEntry = {
  updatedAt: number;
  payload: unknown;
  trace?: unknown;
};

export type DataRestState = {
  /** projectId → last Site Explorer JSON */
  siteExplorerByProject: Record<string, SiteExplorerRestEntry | undefined>;
  /** Ring buffer of recent GET paths (max 12) for debugging */
  recentGets: string[];
};

const initialState: DataRestState = {
  siteExplorerByProject: {},
  recentGets: [],
};

const MAX_RING = 12;

export const dataRestSlice = createSlice({
  name: "dataRest",
  initialState,
  reducers: {
    siteExplorerFromRest(
      state,
      action: PayloadAction<{ projectId: string; payload: unknown; trace?: unknown }>
    ) {
      state.siteExplorerByProject[action.payload.projectId] = {
        updatedAt: Date.now(),
        payload: action.payload.payload,
        trace: action.payload.trace,
      };
    },
    logRestGet(state, action: PayloadAction<string>) {
      state.recentGets = [action.payload, ...state.recentGets.filter(p => p !== action.payload)].slice(
        0,
        MAX_RING
      );
    },
    clearProjectRest(state, action: PayloadAction<{ projectId: string }>) {
      delete state.siteExplorerByProject[action.payload.projectId];
    },
  },
});

export const { siteExplorerFromRest, logRestGet, clearProjectRest } = dataRestSlice.actions;
