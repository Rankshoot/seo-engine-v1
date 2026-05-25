"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageShell, EmptyState } from "@/components/common";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { AdminFilters, type AdminFiltersState } from "@/components/admin/AdminFilters";
import { AdminPagination } from "@/components/admin/AdminPagination";
import {
  AdminDetailDrawer,
  AdminDetailRows,
} from "@/components/admin/AdminDetailDrawer";
import { useAdminListUrlState } from "@/hooks/useAdminListUrlState";
import { useAdminUsers } from "@/lib/query/admin-queries";
import {
  formatAdminDate,
  formatAdminInt,
  formatAdminUsd,
} from "@/lib/admin/format";
import type { AdminUserRow } from "@/types/admin-users";
import { cn } from "@/lib/cn";

const USER_SORT_OPTIONS = [
  { value: "lastActive", label: "Last active" },
  { value: "firstSeen", label: "First seen" },
  { value: "projectCount", label: "Projects" },
  { value: "userId", label: "User ID" },
];

export function AdminUsersDashboard() {
  const { params, setParams } = useAdminListUrlState("lastActive", "desc");
  const { data, isLoading, isError, error, refetch } = useAdminUsers(params);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);

  const filterState: AdminFiltersState = useMemo(
    () => ({
      search: params.search,
      sort: params.sort,
      sortDir: params.sortDir,
    }),
    [params.search, params.sort, params.sortDir]
  );

  const columns: ColumnDef<AdminUserRow>[] = useMemo(
    () => [
      {
        id: "user",
        header: "User",
        cell: (row) => (
          <div className="min-w-[180px]">
            <p className="font-medium text-text-primary truncate">
              {row.displayName ?? row.email ?? "Unknown"}
            </p>
            <p className="text-[12px] text-text-tertiary truncate">
              {row.email ?? row.userId}
            </p>
          </div>
        ),
      },
      {
        id: "projects",
        header: "Projects",
        align: "right",
        cell: (row) => (
          <span className="tabular-nums">{formatAdminInt(row.projectCount)}</span>
        ),
      },
      {
        id: "keywords",
        header: "Keywords",
        align: "right",
        cell: (row) => (
          <span className="tabular-nums">{formatAdminInt(row.keywordCount)}</span>
        ),
      },
      {
        id: "content",
        header: "Blogs",
        align: "right",
        cell: (row) => (
          <span className="tabular-nums">{formatAdminInt(row.contentCount)}</span>
        ),
      },
      {
        id: "ai30d",
        header: "AI (30d)",
        align: "right",
        cell: (row) => (
          <span className="tabular-nums text-[12px]">
            {formatAdminInt(row.aiRequests30d)}
            <span className="text-text-tertiary"> · </span>
            {formatAdminUsd(row.aiCostUsd30d)}
          </span>
        ),
      },
      {
        id: "api30d",
        header: "API cost (30d)",
        align: "right",
        cell: (row) => (
          <span className="tabular-nums">{formatAdminUsd(row.apiCostUsd30d)}</span>
        ),
      },
      {
        id: "lastActive",
        header: "Last active",
        align: "right",
        cell: (row) => (
          <span className="text-[12px] text-text-secondary whitespace-nowrap">
            {formatAdminDate(row.lastActiveAt)}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <PageShell
      title="Users"
      subtitle="Cross-tenant accounts aggregated from projects and usage logs."
    >
      <AdminFilters
        searchPlaceholder="Email, name, or Clerk user ID…"
        sortOptions={USER_SORT_OPTIONS}
        state={filterState}
        onChange={(next) =>
          setParams({
            search: next.search.trim().toLowerCase(),
            sort: next.sort,
            sortDir: next.sortDir,
          })
        }
      />

      {isError ? (
        <EmptyState
          title="Could not load users"
          body={error instanceof Error ? error.message : "Unknown error"}
          action={
            <button
              type="button"
              onClick={() => refetch()}
              className="text-[13px] font-medium text-brand-action hover:underline"
            >
              Retry
            </button>
          }
        />
      ) : (
        <DataTable
          data={data?.items ?? []}
          columns={columns}
          keyExtractor={(row) => row.userId}
          isLoading={isLoading}
          loadingColumns={7}
          minWidth="960px"
          onRowClick={setSelected}
          rowClassName={() => "cursor-pointer"}
          emptyState={
            <EmptyState
              title={params.search ? "No users match your search" : "No users yet"}
              body={
                params.search
                  ? "Try a different email, name, or user ID."
                  : "Users appear here once they create a project."
              }
            />
          }
          footer={
            data ? (
              <AdminPagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                onPageChange={(page) => setParams({ page }, { resetPage: false })}
              />
            ) : null
          }
        />
      )}

      <AdminDetailDrawer
        open={!!selected}
        title={selected?.displayName ?? selected?.email ?? "User"}
        subtitle={selected?.email ?? selected?.userId}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <>
            <AdminDetailRows
              rows={[
                { label: "Clerk user ID", value: selected.userId },
                { label: "Email", value: selected.email ?? "—" },
                { label: "Display name", value: selected.displayName ?? "—" },
                { label: "Projects", value: formatAdminInt(selected.projectCount) },
                { label: "Keywords", value: formatAdminInt(selected.keywordCount) },
                { label: "Blogs", value: formatAdminInt(selected.contentCount) },
                {
                  label: "AI requests (30d)",
                  value: formatAdminInt(selected.aiRequests30d),
                },
                {
                  label: "AI cost (30d)",
                  value: formatAdminUsd(selected.aiCostUsd30d),
                },
                {
                  label: "API cost (30d)",
                  value: formatAdminUsd(selected.apiCostUsd30d),
                },
                {
                  label: "Last active",
                  value: formatAdminDate(selected.lastActiveAt),
                },
                {
                  label: "First seen",
                  value: formatAdminDate(selected.firstSeenAt),
                },
              ]}
            />
            <Link
              href={`/admin/projects?userId=${encodeURIComponent(selected.userId)}`}
              className={cn(
                "mt-6 inline-flex h-9 items-center px-4 rounded-md text-[13px] font-medium",
                "bg-brand-action text-white hover:opacity-90"
              )}
            >
              View projects
            </Link>
          </>
        ) : null}
      </AdminDetailDrawer>
    </PageShell>
  );
}
