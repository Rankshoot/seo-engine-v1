/**
 * Centralized typed query-key factory for TanStack Query.
 *
 * Why: scattered string keys are easy to typo and impossible to invalidate
 * partially (e.g. "every keyword query for project X regardless of filters").
 * The hierarchical array form lets us use partial keys with
 * `queryClient.invalidateQueries({ queryKey: qk.keywords(id) })`.
 */
export const qk = {
  /** All projects for the current user. */
  projects: ["projects"] as const,
  /** Single project + nested project_competitors. */
  project: (id: string) => ["project", id] as const,
  /** Counts used for sidebar badges (approved kw, calendar entries, blogs, audit pending). */
  projectStats: (id: string) => ["project", id, "stats"] as const,
  /** Site Explorer snapshot (Ahrefs). Heavy — long stale time recommended. */
  siteExplorer: (id: string) => ["project", id, "site-explorer"] as const,

  /** Keywords list. `filters` is part of the key so different filter combos cache independently. */
  keywords: (id: string, filters?: unknown) => ["keywords", id, filters ?? null] as const,
  /** All keyword queries for a project — used to invalidate every filter combo at once. */
  keywordsAll: (id: string) => ["keywords", id] as const,
  /** Modal drilldown — Ahrefs overview, SERP, ideas. Server already caches for 7d. */
  keywordDetails: (projectId: string, keywordId: string) =>
    ["keyword-details", projectId, keywordId] as const,

  calendar: (id: string) => ["calendar", id] as const,
  calendarWithBlogs: (id: string) => ["calendar", id, "with-blogs"] as const,

  audits: (id: string) => ["audits", id] as const,
  competitors: (id: string) => ["competitors", id] as const,
  brief: (id: string) => ["brief", id] as const,
  blog: (blogId: string) => ["blog", blogId] as const,
} as const;
