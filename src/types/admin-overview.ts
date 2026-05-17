export interface AdminOverviewMetrics {
  totalUsers: number;
  activeUsers30d: number;
  totalProjects: number;
  totalKeywords: number;
  totalContent: number;
  aiRequests30d: number;
  apiCostUsd30d: number;
  aiCostUsd30d: number;
  totalCostUsd30d: number;
  openErrors: number;
  errors30d: number;
}

export interface AdminProviderUsageSummary {
  provider: string;
  freshCalls: number;
  cacheHits: number;
  totalCalls: number;
  cacheHitRatePct: number;
  estimatedCostUsd: number;
}

export interface AdminRecentProject {
  id: string;
  name: string;
  domain: string;
  userId: string;
  createdAt: string;
}

export interface AdminRecentContent {
  id: string;
  title: string;
  contentType: string;
  projectId: string;
  projectName: string;
  userId: string;
  createdAt: string;
}

export interface AdminRecentError {
  id: string;
  feature: string;
  provider: string;
  severity: string;
  errorMessage: string;
  createdAt: string;
}

export interface AdminRecentUser {
  userId: string;
  projectCount: number;
  lastActiveAt: string | null;
}

export interface AdminOverviewData {
  metrics: AdminOverviewMetrics;
  providerUsage: AdminProviderUsageSummary[];
  recentProjects: AdminRecentProject[];
  recentContent: AdminRecentContent[];
  recentErrors: AdminRecentError[];
  recentUsers: AdminRecentUser[];
  instrumentationNote: string | null;
}
