export interface AdminUserRow {
  userId: string;
  email: string | null;
  displayName: string | null;
  projectCount: number;
  keywordCount: number;
  contentCount: number;
  aiRequests30d: number;
  apiCostUsd30d: number;
  aiCostUsd30d: number;
  lastActiveAt: string | null;
  firstSeenAt: string | null;
}

export interface AdminUsersListResult {
  items: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}
