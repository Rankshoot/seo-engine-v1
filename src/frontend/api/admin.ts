import { apiDelete, apiGet, apiPatch, apiPost } from "./http";
import { V1Routes } from "./routes";
import type { AdminSession } from "@/types/admin";
import type { AdminOverviewData } from "@/types/admin-overview";
import type { AdminUserRow, AdminUsersListResult } from "@/types/admin-users";
import type { AdminProjectRow, AdminProjectsListResult } from "@/types/admin-projects";
import type { AdminApiUsageRow, AdminApiUsageListResult } from "@/types/admin-api-usage";
import type {
  AdminAiLogDetail,
  AdminAiLogRow,
  AdminAiLogsListResult,
} from "@/types/admin-ai-logs";
import type { AdminContentRow, AdminContentListResult } from "@/types/admin-content";
import type { AdminErrorRow, AdminErrorsListResult } from "@/types/admin-errors";
import type { AdminAuditLogRow, AdminAuditLogsListResult } from "@/types/admin-audit-logs";
import type { AdminSettingsData, AdminSettingsPatch } from "@/types/admin-settings";
import type { PlatformAdminRole } from "@/constants/enums/platform-admin-role";
import type { AdminListParams } from "@/lib/admin/parse-list-params";
import { buildAdminListQueryString } from "@/lib/admin/build-list-query";

export type AdminMeResponse = {
  success: boolean;
  error?: string;
  data?: AdminSession;
};

export type AdminOverviewResponse = {
  success: boolean;
  error?: string;
  data?: AdminOverviewData;
};

export type AdminUsersListResponse = {
  success: boolean;
  error?: string;
  data?: AdminUserRow[];
  total?: number;
  page?: number;
  pageSize?: number;
};

export type AdminProjectsListResponse = {
  success: boolean;
  error?: string;
  data?: AdminProjectRow[];
  total?: number;
  page?: number;
  pageSize?: number;
};

export type AdminApiUsageListResponse = {
  success: boolean;
  error?: string;
  data?: AdminApiUsageRow[];
  total?: number;
  page?: number;
  pageSize?: number;
};

export type AdminAiLogsListResponse = {
  success: boolean;
  error?: string;
  data?: AdminAiLogRow[];
  total?: number;
  page?: number;
  pageSize?: number;
};

export type AdminAiLogDetailResponse = {
  success: boolean;
  error?: string;
  data?: AdminAiLogDetail;
};

export type AdminContentListResponse = {
  success: boolean;
  error?: string;
  data?: AdminContentRow[];
  total?: number;
  page?: number;
  pageSize?: number;
};

export type AdminErrorsListResponse = {
  success: boolean;
  error?: string;
  data?: AdminErrorRow[];
  total?: number;
  page?: number;
  pageSize?: number;
};

export type AdminResolveErrorResponse = {
  success: boolean;
  error?: string;
};

export type AdminAuditLogsListResponse = {
  success: boolean;
  error?: string;
  data?: AdminAuditLogRow[];
  total?: number;
  page?: number;
  pageSize?: number;
};

export type AdminSettingsResponse = {
  success: boolean;
  error?: string;
  data?: AdminSettingsData;
};

export type AdminMutationResponse = {
  success: boolean;
  error?: string;
};

export const adminApi = {
  getMe: () => apiGet<AdminMeResponse>(V1Routes.adminMe),
  getOverview: () => apiGet<AdminOverviewResponse>(V1Routes.adminOverview),
  getUsers: (params: AdminListParams) =>
    apiGet<AdminUsersListResponse>(
      `${V1Routes.adminUsers}${buildAdminListQueryString(params)}`
    ),
  getProjects: (params: AdminListParams) =>
    apiGet<AdminProjectsListResponse>(
      `${V1Routes.adminProjects}${buildAdminListQueryString(params)}`
    ),
  getApiUsage: (params: AdminListParams) =>
    apiGet<AdminApiUsageListResponse>(
      `${V1Routes.adminApiUsage}${buildAdminListQueryString(params)}`
    ),
  getAiLogs: (params: AdminListParams) =>
    apiGet<AdminAiLogsListResponse>(
      `${V1Routes.adminAiLogs}${buildAdminListQueryString(params)}`
    ),
  getAiLogDetail: (logId: string) =>
    apiGet<AdminAiLogDetailResponse>(`${V1Routes.adminAiLogs}/${logId}`),
  getContent: (params: AdminListParams) =>
    apiGet<AdminContentListResponse>(
      `${V1Routes.adminContent}${buildAdminListQueryString(params)}`
    ),
  getErrors: (params: AdminListParams) =>
    apiGet<AdminErrorsListResponse>(
      `${V1Routes.adminErrors}${buildAdminListQueryString(params)}`
    ),
  resolveError: (errorId: string) =>
    apiPatch<AdminResolveErrorResponse>(`${V1Routes.adminErrors}/${errorId}`, {
      status: "resolved",
    }),
  getAuditLogs: (params: AdminListParams) =>
    apiGet<AdminAuditLogsListResponse>(
      `${V1Routes.adminAuditLogs}${buildAdminListQueryString(params)}`
    ),
  getSettings: () => apiGet<AdminSettingsResponse>(V1Routes.adminSettings),
  updateSettings: (patch: AdminSettingsPatch) =>
    apiPatch<AdminMutationResponse>(V1Routes.adminSettings, patch),
  grantAdmin: (email: string, role: PlatformAdminRole) =>
    apiPost<AdminMutationResponse>(V1Routes.adminSettingsAdmins, { email, role }),
  revokeAdmin: (platformAdminId: string) =>
    apiDelete<AdminMutationResponse>(
      `${V1Routes.adminSettingsAdmins}?id=${encodeURIComponent(platformAdminId)}`
    ),
};

export function mapAdminUsersListResponse(
  res: AdminUsersListResponse
): AdminUsersListResult {
  if (!res.success || !res.data) {
    throw new Error(res.error ?? "Failed to load users");
  }
  return {
    items: res.data,
    total: res.total ?? res.data.length,
    page: res.page ?? 1,
    pageSize: res.pageSize ?? 25,
  };
}

export function mapAdminProjectsListResponse(
  res: AdminProjectsListResponse
): AdminProjectsListResult {
  if (!res.success || !res.data) {
    throw new Error(res.error ?? "Failed to load projects");
  }
  return {
    items: res.data,
    total: res.total ?? res.data.length,
    page: res.page ?? 1,
    pageSize: res.pageSize ?? 25,
  };
}

export function mapAdminApiUsageListResponse(
  res: AdminApiUsageListResponse
): AdminApiUsageListResult {
  if (!res.success || !res.data) {
    throw new Error(res.error ?? "Failed to load API usage");
  }
  return {
    items: res.data,
    total: res.total ?? res.data.length,
    page: res.page ?? 1,
    pageSize: res.pageSize ?? 25,
  };
}

export function mapAdminAiLogsListResponse(
  res: AdminAiLogsListResponse
): AdminAiLogsListResult {
  if (!res.success || !res.data) {
    throw new Error(res.error ?? "Failed to load AI logs");
  }
  return {
    items: res.data,
    total: res.total ?? res.data.length,
    page: res.page ?? 1,
    pageSize: res.pageSize ?? 25,
  };
}

export function mapAdminContentListResponse(
  res: AdminContentListResponse
): AdminContentListResult {
  if (!res.success || !res.data) {
    throw new Error(res.error ?? "Failed to load content");
  }
  return {
    items: res.data,
    total: res.total ?? res.data.length,
    page: res.page ?? 1,
    pageSize: res.pageSize ?? 25,
  };
}

export function mapAdminErrorsListResponse(
  res: AdminErrorsListResponse
): AdminErrorsListResult {
  if (!res.success || !res.data) {
    throw new Error(res.error ?? "Failed to load errors");
  }
  return {
    items: res.data,
    total: res.total ?? res.data.length,
    page: res.page ?? 1,
    pageSize: res.pageSize ?? 25,
  };
}

export function mapAdminAuditLogsListResponse(
  res: AdminAuditLogsListResponse
): AdminAuditLogsListResult {
  if (!res.success || !res.data) {
    throw new Error(res.error ?? "Failed to load audit logs");
  }
  return {
    items: res.data,
    total: res.total ?? res.data.length,
    page: res.page ?? 1,
    pageSize: res.pageSize ?? 25,
  };
}
