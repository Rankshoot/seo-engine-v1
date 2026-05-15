import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AuditCoverage, PersistedBlogAudit } from "@/app/actions/audit-actions";

export type ContentHealthSeverityFilter = "all" | "high" | "medium" | "low";

export type UploadHistoryEntry = {
  blogId: string;
  title: string;
  keyword: string;
  uploadedAt: string;
};

export type ProjectContentHealthAuditState = {
  rows: PersistedBlogAudit[];
  coverage: AuditCoverage | null;
  total: number;
  hasMore: boolean;
  offset: number;
  pageSize: number;
  loading: "idle" | "loading" | "loadingMore";
  filter: ContentHealthSeverityFilter;
  error: string | null;
  /** True when another flow (import, discover, AI tools) may have changed server audits — refetch in background on next visit. */
  stale: boolean;
  /** Recent uploads from the "Upload article" tab, newest first. */
  uploadHistory: UploadHistoryEntry[];
};

export type ContentHealthAuditState = {
  projects: Record<string, ProjectContentHealthAuditState>;
};

const DEFAULT_PAGE = 20;

const defaultProjectState = (): ProjectContentHealthAuditState => ({
  rows: [],
  coverage: null,
  total: 0,
  hasMore: false,
  offset: 0,
  pageSize: DEFAULT_PAGE,
  loading: "idle",
  filter: "all",
  error: null,
  stale: false,
  uploadHistory: [],
});

function ensureProject(state: ContentHealthAuditState, projectId: string): ProjectContentHealthAuditState {
  state.projects[projectId] ??= defaultProjectState();
  const p = state.projects[projectId];
  if (typeof p.stale !== "boolean") p.stale = false;
  if (!Array.isArray(p.uploadHistory)) p.uploadHistory = [];
  return p;
}

export const contentHealthAuditSlice = createSlice({
  name: "contentHealthAudit",
  initialState: { projects: {} } as ContentHealthAuditState,
  reducers: {
    contentHealthAuditReset(state, action: PayloadAction<{ projectId: string }>) {
      state.projects[action.payload.projectId] = defaultProjectState();
    },

    contentHealthAuditFilterSet(
      state,
      action: PayloadAction<{ projectId: string; filter: ContentHealthSeverityFilter }>
    ) {
      ensureProject(state, action.payload.projectId).filter = action.payload.filter;
    },

    contentHealthAuditMarkStale(state, action: PayloadAction<{ projectId: string }>) {
      ensureProject(state, action.payload.projectId).stale = true;
    },

    contentHealthAuditLoadStarted(
      state,
      action: PayloadAction<{ projectId: string; mode: "replace" | "append" }>
    ) {
      const p = ensureProject(state, action.payload.projectId);
      p.error = null;
      p.loading = action.payload.mode === "append" ? "loadingMore" : "loading";
    },

    contentHealthAuditLoadSuccess(
      state,
      action: PayloadAction<{
        projectId: string;
        mode: "replace" | "append";
        data: PersistedBlogAudit[];
        coverage: AuditCoverage;
        total: number;
        hasMore: boolean;
        limit: number;
        offset: number;
      }>
    ) {
      const p = ensureProject(state, action.payload.projectId);
      p.loading = "idle";
      p.coverage = action.payload.coverage;
      p.total = action.payload.total;
      p.hasMore = action.payload.hasMore;
      p.pageSize = action.payload.limit || DEFAULT_PAGE;
      p.offset = action.payload.offset + action.payload.data.length;
      if (action.payload.mode === "append") {
        const seen = new Set(p.rows.map(r => r.url));
        for (const row of action.payload.data) {
          if (!seen.has(row.url)) {
            seen.add(row.url);
            p.rows.push(row);
          }
        }
      } else {
        p.rows = action.payload.data;
      }
      p.stale = false;
    },

    contentHealthAuditLoadFailed(state, action: PayloadAction<{ projectId: string; error: string }>) {
      const p = ensureProject(state, action.payload.projectId);
      p.loading = "idle";
      p.error = action.payload.error;
      p.stale = false;
    },

    analyzePageUploadHistoryAdd(
      state,
      action: PayloadAction<{ projectId: string; entry: UploadHistoryEntry }>
    ) {
      const p = ensureProject(state, action.payload.projectId);
      // Dedupe by blogId, keep newest first, cap at 20
      p.uploadHistory = [
        action.payload.entry,
        ...p.uploadHistory.filter(e => e.blogId !== action.payload.entry.blogId),
      ].slice(0, 20);
    },
  },
});

export const {
  contentHealthAuditReset,
  contentHealthAuditFilterSet,
  contentHealthAuditMarkStale,
  contentHealthAuditLoadStarted,
  contentHealthAuditLoadSuccess,
  contentHealthAuditLoadFailed,
  analyzePageUploadHistoryAdd,
} = contentHealthAuditSlice.actions;
