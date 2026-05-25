"use client";

import { useMemo, useState } from "react";
import { PageShell, EmptyState } from "@/components/common";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { AdminFilters, type AdminFiltersState } from "@/components/admin/AdminFilters";
import { AdminPagination } from "@/components/admin/AdminPagination";
import {
  AdminDetailDrawer,
  AdminDetailRows,
} from "@/components/admin/AdminDetailDrawer";
import { useAdminListUrlState } from "@/hooks/useAdminListUrlState";
import { useAdminAuditLogs } from "@/lib/query/admin-queries";
import { AdminAuditAction } from "@/lib/admin/logging/admin-audit-logger";
import { formatAdminDate } from "@/lib/admin/format";
import type { AdminAuditLogRow } from "@/types/admin-audit-logs";
import { cn } from "@/lib/cn";

const SORT_OPTIONS = [
  { value: "created", label: "Time" },
  { value: "action", label: "Action" },
];

const AUDIT_ACTIONS = Object.values(AdminAuditAction);

export function AdminAuditLogsDashboard() {
  const { params, setParams } = useAdminListUrlState("created", "desc");
  const { data, isLoading, isError, error, refetch } = useAdminAuditLogs(params);
  const [selected, setSelected] = useState<AdminAuditLogRow | null>(null);

  const filterState: AdminFiltersState = useMemo(
    () => ({
      search: params.search,
      sort: params.sort,
      sortDir: params.sortDir,
    }),
    [params.search, params.sort, params.sortDir]
  );

  const actionFilter = (
    <div className="w-full lg:w-52">
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
        Action
      </label>
      <select
        value={params.action ?? ""}
        onChange={(e) => setParams({ action: e.target.value })}
        className={cn(
          "w-full h-9 rounded-md border border-border-subtle bg-surface-elevated px-3 text-[13px] text-text-primary",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-action/40"
        )}
      >
        <option value="">All actions</option>
        {AUDIT_ACTIONS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </div>
  );

  const columns: ColumnDef<AdminAuditLogRow>[] = useMemo(
    () => [
      {
        id: "time",
        header: "Time",
        cell: (row) => (
          <span className="text-[12px] text-text-secondary whitespace-nowrap">
            {formatAdminDate(row.createdAt)}
          </span>
        ),
      },
      {
        id: "action",
        header: "Action",
        cell: (row) => (
          <code className="text-[12px] text-brand-action">{row.action}</code>
        ),
      },
      {
        id: "target",
        header: "Target",
        cell: (row) => (
          <div className="min-w-[140px]">
            <p className="text-[12px] text-text-primary">{row.targetType || "—"}</p>
            {row.targetId ? (
              <p className="text-[11px] text-text-tertiary truncate max-w-[200px]">
                {row.targetId}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "admin",
        header: "Admin user",
        cell: (row) => (
          <span className="text-[12px] text-text-secondary font-mono truncate max-w-[160px] block">
            {row.adminUserId}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <PageShell
      title="Audit logs"
      subtitle="Sensitive platform admin actions — grants, settings changes, error resolutions."
    >
      <AdminFilters
        searchPlaceholder="Action, target, or admin user ID…"
        sortOptions={SORT_OPTIONS}
        state={filterState}
        onChange={(next) =>
          setParams({
            search: next.search.trim().toLowerCase(),
            sort: next.sort,
            sortDir: next.sortDir,
          })
        }
        extra={actionFilter}
      />

      {isError ? (
        <EmptyState
          title="Could not load audit logs"
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
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
          loadingColumns={4}
          minWidth="800px"
          onRowClick={setSelected}
          rowClassName={() => "cursor-pointer"}
          emptyState={
            <EmptyState
              title="No audit entries yet"
              body="Actions like granting admins, updating settings, and resolving errors appear here."
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
        title={selected?.action ?? "Audit entry"}
        subtitle={selected ? formatAdminDate(selected.createdAt) : undefined}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <AdminDetailRows
            rows={[
              { label: "ID", value: selected.id },
              { label: "Action", value: selected.action },
              { label: "Admin user ID", value: selected.adminUserId },
              { label: "Target type", value: selected.targetType || "—" },
              { label: "Target ID", value: selected.targetId || "—" },
              {
                label: "Metadata",
                value: (
                  <pre className="text-[11px] font-mono text-text-secondary whitespace-pre-wrap break-all bg-surface-secondary rounded p-2 max-h-56 overflow-auto">
                    {JSON.stringify(selected.metadata, null, 2)}
                  </pre>
                ),
              },
            ]}
          />
        ) : null}
      </AdminDetailDrawer>
    </PageShell>
  );
}
