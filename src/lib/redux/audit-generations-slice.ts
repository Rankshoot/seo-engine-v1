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
  /**
   * Audited URLs with an in-flight enhanced-blog generation, keyed by project →
   * normalized audit URL → durable jobId. This is the SHARED source of truth for
   * the "Generating…" button state, so the full-audit view and every Audit
   * History row for the same URL stay in lock-step (and survive a refresh, since
   * the page re-hydrates it from the active durable jobs on mount).
   */
  generatingByProject: Record<string, Record<string, string>>;
}

const initialState: AuditGenerationsState = { byProject: {}, generatingByProject: {} };

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
      // A completed generation is no longer "generating".
      delete state.generatingByProject[projectId]?.[normalizeAuditGenerationUrl(url)];
    },
    /** Replace a project's full url→jobId "currently generating" map (from active-job poll). */
    setAuditGeneratingMap(
      state,
      action: PayloadAction<{ projectId: string; map: Record<string, string> }>
    ) {
      const { projectId, map } = action.payload;
      const normalized: Record<string, string> = {};
      for (const [url, jobId] of Object.entries(map)) {
        if (url && jobId) normalized[normalizeAuditGenerationUrl(url)] = jobId;
      }
      state.generatingByProject[projectId] = normalized;
    },
    /** Mark one audited URL as generating (optimistic, on click). */
    setAuditGenerating(
      state,
      action: PayloadAction<{ projectId: string; url: string; jobId: string }>
    ) {
      const { projectId, url, jobId } = action.payload;
      if (!url || !jobId) return;
      const bucket = (state.generatingByProject[projectId] ??= {});
      bucket[normalizeAuditGenerationUrl(url)] = jobId;
    },
    /** Clear the generating flag for one audited URL (job finished/failed). */
    clearAuditGenerating(
      state,
      action: PayloadAction<{ projectId: string; url: string }>
    ) {
      const { projectId, url } = action.payload;
      delete state.generatingByProject[projectId]?.[normalizeAuditGenerationUrl(url)];
    },
  },
});

export const {
  setGeneratedMap,
  setGeneratedBlog,
  setAuditGeneratingMap,
  setAuditGenerating,
  clearAuditGenerating,
} = auditGenerationsSlice.actions;
