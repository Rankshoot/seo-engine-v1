export interface AdminAuditLogRow {
  id: string;
  adminUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminAuditLogsListResult {
  items: AdminAuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
}
