import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/**
 * Tracks which audited URLs already have a generated ("enhanced") blog, keyed by
 * project → normalized audit URL → blogId. This is what lets the Audit History
 * rows flip from "Generate Enhanced Blog" to "View Blog" reactively — the moment
 * a blog is generated for a URL (or when the page loads the existing mapping),
 * every place that shows that URL updates without a refetch.
 *
 * Not persisted (omitted from the store's persisted slices): the source of truth
 * is the `blogs` table, so we hydrate it fresh each session from the
 * `content-audit/generated-map` endpoint.
 */
export interface AuditGenerationsState {
  byProject: Record<string, Record<string, string>>;
}

const initialState: AuditGenerationsState = { byProject: {} };

/** Canonical key for an audit URL (drop hash + trailing slash, lower-case). */
export function normalizeAuditGenerationUrl(url: string): string {
  return (url || "").trim().replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();
}

export const auditGenerationsSlice = createSlice({
  name: "auditGenerations",
  initialState,
  reducers: {
    /** Replace a project's full url→blogId map (loaded from the server). */
    setGeneratedMap(
      state,
      action: PayloadAction<{ projectId: string; map: Record<string, string> }>
    ) {
      const { projectId, map } = action.payload;
      const normalized: Record<string, string> = {};
      for (const [url, blogId] of Object.entries(map)) {
        if (url && blogId) normalized[normalizeAuditGenerationUrl(url)] = blogId;
      }
      state.byProject[projectId] = normalized;
    },
    /** Record a single freshly-generated blog so the UI updates immediately. */
    setGeneratedBlog(
      state,
      action: PayloadAction<{ projectId: string; url: string; blogId: string }>
    ) {
      const { projectId, url, blogId } = action.payload;
      if (!url || !blogId) return;
      const bucket = (state.byProject[projectId] ??= {});
      bucket[normalizeAuditGenerationUrl(url)] = blogId;
    },
  },
});

export const { setGeneratedMap, setGeneratedBlog } = auditGenerationsSlice.actions;
