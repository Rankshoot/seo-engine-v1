export interface AdminErrorRow {
  id: string;
  userId: string | null;
  projectId: string | null;
  feature: string;
  provider: string;
  errorMessage: string;
  severity: string;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface AdminErrorsListResult {
  items: AdminErrorRow[];
  total: number;
  page: number;
  pageSize: number;
}
