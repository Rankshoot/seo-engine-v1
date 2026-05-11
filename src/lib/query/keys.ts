/**
 * Typed TanStack Query key factory. Hierarchical arrays support prefix invalidation:
 * `queryClient.invalidateQueries({ queryKey: qk.keywords(id) })`.
 */
export const qk = {
  projects: ["projects"] as const,
  project: (id: string) => ["project", id] as const,
  projectStats: (id: string) => ["project", id, "stats"] as const,
  siteExplorer: (id: string) => ["project", id, "site-explorer"] as const,

  keywords: (id: string) => ["keywords", id] as const,
  domainKeywords: (id: string) => ["domainKeywords", id] as const,
  keywordDetails: (projectId: string, keywordId: string) =>
    ["keyword-details", projectId, keywordId] as const,

  calendar: (id: string) => ["calendar", id] as const,
  calendarWithBlogs: (id: string) => ["calendar", id, "with-blogs"] as const,
  articlesLibrary: (id: string) => ["project", id, "articles-library"] as const,
  contentGeneratorHistory: (id: string) => ["project", id, "content-generator-history"] as const,

  audits: (id: string) => ["audits", id] as const,
  competitors: (id: string) => ["competitors", id] as const,
  brief: (id: string) => ["brief", id] as const,
  blog: (blogId: string) => ["blog", blogId] as const,
} as const;
