export interface AdminApiUsageRow {
  id: string;
  userId: string | null;
  projectId: string | null;
  provider: string;
  feature: string;
  endpoint: string;
  status: string;
  latencyMs: number | null;
  cached: boolean;
  cacheHit: boolean;
  creditsUsed: number | null;
  estimatedCostUsd: number | null;
  errorMessage: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminApiUsageListResult {
  items: AdminApiUsageRow[];
  total: number;
  page: number;
  pageSize: number;
}
