/**
 * Path segments under `/api/v1` (see `http.ts` → `API_V1`).
 * Keeps client `fetch` URLs aligned with route handlers.
 */

export const V1Routes = {
  // ── Projects ─────────────────────────────────────────────────────────────
  projects: "/projects",
  project: (projectId: string) => `/projects/${projectId}`,
  projectStats: (projectId: string) => `/projects/${projectId}/stats`,
  projectOverview: (projectId: string) => `/projects/${projectId}/overview`,
  projectOverviewRefresh: (projectId: string) => `/projects/${projectId}/overview/refresh`,
  projectBrief: (projectId: string) => `/projects/${projectId}/brief`,

  // ── Keywords ───────────────────────────────────────────────────────────────
  keywords: (projectId: string) => `/projects/${projectId}/keywords`,
  keywordsLoadMore: (projectId: string) => `/projects/${projectId}/keywords/load-more`,
  keywordsDomain: (projectId: string) => `/projects/${projectId}/keywords/domain`,
  keywordsBulkStatus: (projectId: string) => `/projects/${projectId}/keywords/bulk-status`,
  keywordsApproveCluster: (projectId: string) => `/projects/${projectId}/keywords/approve-cluster`,
  keyword: (projectId: string, keywordId: string) => `/projects/${projectId}/keywords/${keywordId}`,
  keywordStatus: (projectId: string, keywordId: string) =>
    `/projects/${projectId}/keywords/${keywordId}/status`,
  keywordDetails: (projectId: string, keywordId: string) =>
    `/projects/${projectId}/keywords/${keywordId}/details`,

  // ── Calendar ───────────────────────────────────────────────────────────────
  calendarEntries: (projectId: string) => `/projects/${projectId}/calendar/entries`,
  calendarWithBlogs: (projectId: string) => `/projects/${projectId}/calendar/with-blogs`,
  calendarGenerate: (projectId: string) => `/projects/${projectId}/calendar/generate`,
  calendarAddKeyword: (projectId: string) => `/projects/${projectId}/calendar/add-keyword`,
  calendarContentHealth: (projectId: string) => `/projects/${projectId}/calendar/content-health`,
  calendarApproveAi: (projectId: string) => `/projects/${projectId}/calendar/approve-ai-suggestion`,

  // ── Competitors ────────────────────────────────────────────────────────────
  competitorsBenchmark: (projectId: string) => `/projects/${projectId}/competitors/benchmark`,
  competitorsBlogFromOpportunity: (projectId: string) =>
    `/projects/${projectId}/competitors/blog-from-opportunity`,

  // ── Content health (audits) ────────────────────────────────────────────────
  contentHealthAudits: (projectId: string) => `/projects/${projectId}/content-health/audits`,
  contentHealthAuditsRun: (projectId: string) => `/projects/${projectId}/content-health/audits/run`,
  contentHealthAuditsSelected: (projectId: string) =>
    `/projects/${projectId}/content-health/audits/selected`,
  contentHealthSitemapPages: (projectId: string) =>
    `/projects/${projectId}/content-health/sitemap-pages`,

  // ── Blogs ─────────────────────────────────────────────────────────────────
  blog: (blogId: string) => `/blogs/${blogId}`,
  blogsGenerate: "/blogs/generate",
  blogContent: (blogId: string) => `/blogs/${blogId}/content`,
  blogStatus: (blogId: string) => `/blogs/${blogId}/status`,
  blogFixSeo: (blogId: string) => `/blogs/${blogId}/fix-seo`,
  blogRewriteSelection: (blogId: string) => `/blogs/${blogId}/rewrite-selection`,
} as const;
