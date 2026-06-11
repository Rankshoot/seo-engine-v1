export type ApprovalStatus = "approved" | "pending" | "denied" | "revoked";

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
  approvalStatus: ApprovalStatus;
}

export interface AdminUsersListResult {
  items: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}
