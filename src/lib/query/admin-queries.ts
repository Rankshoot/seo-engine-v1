"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminApi,
  mapAdminAiLogsListResponse,
  mapAdminApiUsageListResponse,
  mapAdminAuditLogsListResponse,
  mapAdminContentListResponse,
  mapAdminErrorsListResponse,
  mapAdminProjectsListResponse,
  mapAdminUsersListResponse,
} from "@/frontend/api/admin";
import type { AdminSettingsPatch } from "@/types/admin-settings";
import type { PlatformAdminRole } from "@/constants/enums/platform-admin-role";
import { adminListFiltersKey } from "@/lib/admin/parse-list-params";
import type { AdminListParams } from "@/lib/admin/parse-list-params";
import { qk } from "@/lib/query/keys";
import { ADMIN_QUERY_OPTIONS } from "@/lib/query/defaults";
import { executeSafeQuery } from "@/lib/query/safe-query";

export function useAdminMe() {
  return useQuery({
    queryKey: ["admin", "me"] as const,
    queryFn: () =>
      executeSafeQuery(async () => {
        const res = await adminApi.getMe();
        if (!res.success || !res.data) {
          throw new Error(res.error ?? "Failed to load admin session");
        }
        return res.data;
      }),
    ...ADMIN_QUERY_OPTIONS,
  });
}

export function useAdminOverview() {
  return useQuery({
    queryKey: qk.admin.overview,
    queryFn: () =>
      executeSafeQuery(async () => {
        const res = await adminApi.getOverview();
        if (!res.success || !res.data) {
          throw new Error(res.error ?? "Failed to load admin overview");
        }
        return res.data;
      }),
    ...ADMIN_QUERY_OPTIONS,
  });
}

export function useAdminUsers(params: AdminListParams) {
  const filterKey = adminListFiltersKey(params);
  return useQuery({
    queryKey: qk.admin.users(filterKey),
    queryFn: () =>
      executeSafeQuery(async () =>
        mapAdminUsersListResponse(await adminApi.getUsers(params))
      ),
    ...ADMIN_QUERY_OPTIONS,
  });
}

export function useAdminProjects(params: AdminListParams) {
  const filterKey = adminListFiltersKey(params);
  return useQuery({
    queryKey: qk.admin.projects(filterKey),
    queryFn: () =>
      executeSafeQuery(async () =>
        mapAdminProjectsListResponse(await adminApi.getProjects(params))
      ),
    ...ADMIN_QUERY_OPTIONS,
  });
}

export function useAdminApiUsage(params: AdminListParams) {
  const filterKey = adminListFiltersKey(params);
  return useQuery({
    queryKey: qk.admin.apiUsage(filterKey),
    queryFn: () =>
      executeSafeQuery(async () =>
        mapAdminApiUsageListResponse(await adminApi.getApiUsage(params))
      ),
    ...ADMIN_QUERY_OPTIONS,
  });
}

export function useAdminAiLogs(params: AdminListParams) {
  const filterKey = adminListFiltersKey(params);
  return useQuery({
    queryKey: qk.admin.aiLogs(filterKey),
    queryFn: () =>
      executeSafeQuery(async () =>
        mapAdminAiLogsListResponse(await adminApi.getAiLogs(params))
      ),
    ...ADMIN_QUERY_OPTIONS,
  });
}

export function useAdminAiLogDetail(logId: string | null) {
  return useQuery({
    queryKey: ["admin", "ai-log", logId] as const,
    queryFn: () =>
      executeSafeQuery(async () => {
        if (!logId) throw new Error("No log id");
        const res = await adminApi.getAiLogDetail(logId);
        if (!res.success || !res.data) {
          throw new Error(res.error ?? "Failed to load AI log");
        }
        return res.data;
      }),
    enabled: !!logId,
    ...ADMIN_QUERY_OPTIONS,
  });
}

export function useAdminContent(params: AdminListParams) {
  const filterKey = adminListFiltersKey(params);
  return useQuery({
    queryKey: qk.admin.content(filterKey),
    queryFn: () =>
      executeSafeQuery(async () =>
        mapAdminContentListResponse(await adminApi.getContent(params))
      ),
    ...ADMIN_QUERY_OPTIONS,
  });
}

export function useAdminErrors(params: AdminListParams) {
  const filterKey = adminListFiltersKey(params);
  return useQuery({
    queryKey: qk.admin.errors(filterKey),
    queryFn: () =>
      executeSafeQuery(async () =>
        mapAdminErrorsListResponse(await adminApi.getErrors(params))
      ),
    ...ADMIN_QUERY_OPTIONS,
  });
}

export function useResolveAdminError() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (errorId: string) =>
      executeSafeQuery(async () => {
        const res = await adminApi.resolveError(errorId);
        if (!res.success) {
          throw new Error(res.error ?? "Failed to resolve error");
        }
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "errors"] });
      void queryClient.invalidateQueries({ queryKey: qk.admin.overview });
    },
  });
}

export function useAdminAuditLogs(params: AdminListParams) {
  const filterKey = adminListFiltersKey(params);
  return useQuery({
    queryKey: qk.admin.auditLogs(filterKey),
    queryFn: () =>
      executeSafeQuery(async () =>
        mapAdminAuditLogsListResponse(await adminApi.getAuditLogs(params))
      ),
    ...ADMIN_QUERY_OPTIONS,
  });
}

export function useAdminSettings() {
  return useQuery({
    queryKey: qk.admin.settings,
    queryFn: () =>
      executeSafeQuery(async () => {
        const res = await adminApi.getSettings();
        if (!res.success || !res.data) {
          throw new Error(res.error ?? "Failed to load settings");
        }
        return res.data;
      }),
    ...ADMIN_QUERY_OPTIONS,
  });
}

export function useUpdateAdminSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: AdminSettingsPatch) =>
      executeSafeQuery(async () => {
        const res = await adminApi.updateSettings(patch);
        if (!res.success) throw new Error(res.error ?? "Failed to save settings");
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.admin.settings });
      void queryClient.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
    },
  });
}

export function useGrantPlatformAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      email,
      role,
    }: {
      email: string;
      role: PlatformAdminRole;
    }) =>
      executeSafeQuery(async () => {
        const res = await adminApi.grantAdmin(email, role);
        if (!res.success) throw new Error(res.error ?? "Failed to grant admin");
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.admin.settings });
      void queryClient.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
    },
  });
}

export function useRevokePlatformAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (platformAdminId: string) =>
      executeSafeQuery(async () => {
        const res = await adminApi.revokeAdmin(platformAdminId);
        if (!res.success) throw new Error(res.error ?? "Failed to revoke admin");
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.admin.settings });
      void queryClient.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
    },
  });
}
