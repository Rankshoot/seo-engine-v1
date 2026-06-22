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
  keywordsLoadMoreAhrefs: (projectId: string) => `/projects/${projectId}/keywords/load-more-from-ahrefs`,
  keywordsDomain: (projectId: string) => `/projects/${projectId}/keywords/domain`,
  keywordsBulkStatus: (projectId: string) => `/projects/${projectId}/keywords/bulk-status`,
  keywordsApproveCluster: (projectId: string) => `/projects/${projectId}/keywords/approve-cluster`,
  keyword: (projectId: string, keywordId: string) => `/projects/${projectId}/keywords/${keywordId}`,
  keywordStatus: (projectId: string, keywordId: string) =>
    `/projects/${projectId}/keywords/${keywordId}/status`,
  keywordSchedule: (projectId: string, keywordId: string) =>
    `/projects/${projectId}/keywords/${keywordId}/schedule`,
  keywordDetails: (projectId: string, keywordId: string) =>
    `/projects/${projectId}/keywords/${keywordId}/details`,

  // ── Calendar ───────────────────────────────────────────────────────────────
  calendarEntries: (projectId: string) => `/projects/${projectId}/calendar/entries`,
  calendarWithBlogs: (projectId: string) => `/projects/${projectId}/calendar/with-blogs`,
  calendarGenerate: (projectId: string) => `/projects/${projectId}/calendar/generate`,
  calendarAddKeyword: (projectId: string) => `/projects/${projectId}/calendar/add-keyword`,
  calendarRescheduleEntry: (projectId: string) => `/projects/${projectId}/calendar/reschedule-entry`,
  calendarAddCustom: (projectId: string) => `/projects/${projectId}/calendar/add-custom`,
  calendarScheduleBlog: (projectId: string) => `/projects/${projectId}/calendar/schedule-blog`,
  calendarContentHealth: (projectId: string) => `/projects/${projectId}/calendar/content-health`,
  calendarApproveAi: (projectId: string) => `/projects/${projectId}/calendar/approve-ai-suggestion`,
  calendarDeleteEntry: (projectId: string, entryId: string) => `/projects/${projectId}/calendar/entries/${entryId}`,
  projectContentGeneratorHistory: (projectId: string) =>
    `/projects/${projectId}/content-generator/history`,
  projectContentStudioHistory: (projectId: string) =>
    `/projects/${projectId}/content-studio/history`,

  // ── Competitors ────────────────────────────────────────────────────────────
  competitorsBenchmark: (projectId: string) => `/projects/${projectId}/competitors/benchmark`,
  competitorsBlogFromOpportunity: (projectId: string) =>
    `/projects/${projectId}/competitors/blog-from-opportunity`,
  competitorsLoadMoreAhrefs: (projectId: string) =>
    `/projects/${projectId}/competitors/load-more-from-ahrefs`,

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
  blogEnhanced: (blogId: string) => `/blogs/${blogId}/enhanced`,
  blogDeepAnalysis: (blogId: string) => `/blogs/${blogId}/deep-analysis`,
  blogEnhance: (projectId: string, blogId: string) => `/projects/${projectId}/blogs/${blogId}/enhance`,

  // ── Brand Intelligence ────────────────────────────────────────────────────
  projectBrand: (projectId: string) => `/projects/${projectId}/brand`,
  projectBrandRefresh: (projectId: string) => `/projects/${projectId}/brand/refresh`,

  // ── Integrations ─────────────────────────────────────────────────────────
  strapiPublish:       "/integrations/strapi/publish",
  userStrapiIntegration: "/integrations/user-strapi",
  userStrapiTest:      "/integrations/user-strapi/test",
  blogPublishCms: (blogId: string) => `/blogs/${blogId}/publish-cms`,

  // ── Admin (platform) ─────────────────────────────────────────────────────
  adminMe: "/admin/me",
  adminOverview: "/admin/overview",
  adminUsers: "/admin/users",
  adminProjects: "/admin/projects",
  adminApiUsage: "/admin/api-usage",
  adminAiLogs: "/admin/ai-logs",
  adminContent: "/admin/content",
  adminErrors: "/admin/errors",
  adminAuditLogs: "/admin/audit-logs",
  adminSettings: "/admin/settings",
  adminSettingsAdmins: "/admin/settings/admins",
} as const;
