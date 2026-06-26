"use client";

import { useCallback, useMemo, useState } from "react";
import { PageShell, EmptyState } from "@/components/common";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { AdminFilters, type AdminFiltersState } from "@/components/admin/AdminFilters";
import { AdminPagination } from "@/components/admin/AdminPagination";
import {
  AdminSeverityFilter,
  AdminStatusFilter,
} from "@/components/admin/AdminLogFilterExtras";
import {
  AdminDetailDrawer,
  AdminDetailRows,
} from "@/components/admin/AdminDetailDrawer";
import { useAdminListUrlState } from "@/hooks/useAdminListUrlState";
import { useAdminErrors, useResolveAdminError } from "@/lib/query/admin-queries";
import { platformAdminMeetsMinRole } from "@/constants/enums/platform-admin-role";
import { ERROR_SEVERITIES } from "@/constants/enums/usage-provider";
import {
  formatAdminDate,
} from "@/lib/admin/format";
import type { AdminErrorRow } from "@/types/admin-errors";
import { cn } from "@/lib/cn";
import { useAdminMe } from "@/lib/query/admin-queries";

const SORT_OPTIONS = [
  { value: "created", label: "Time" },
  { value: "severity", label: "Severity" },
  { value: "status", label: "Status" },
];

const ERROR_STATUS_FILTER = ["open", "resolved"] as const;

function SeverityPill({ severity }: { severity: string }) {
  const tone =
    severity === "critical"
      ? "bg-status-danger/20 text-status-danger"
      : severity === "high"
        ? "bg-status-danger/15 text-status-danger"
        : severity === "medium"
          ? "bg-status-warning/15 text-status-warning"
          : "bg-surface-secondary text-text-tertiary";
  return (
    <span
      className={cn(
        "inline-flex px-2 py-0.5 rounded text-[11px] font-medium capitalize",
        tone
      )}
    >
      {severity}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const open = status === "open";
  return (
    <span
      className={cn(
        "inline-flex px-2 py-0.5 rounded text-[11px] font-medium capitalize",
        open ? "bg-status-danger/15 text-status-danger" : "bg-status-success/15 text-status-success"
      )}
    >
      {status}
    </span>
  );
}

export function AdminErrorsDashboard() {
  const { params, setParams } = useAdminListUrlState("created", "desc");
  const { data, isLoading, isError, error, refetch } = useAdminErrors(params);
  const resolveMutation = useResolveAdminError();
  const [selected, setSelected] = useState<AdminErrorRow | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const meQuery = useAdminMe();

  const canResolve = meQuery.data
    ? platformAdminMeetsMinRole(meQuery.data.role, "admin")
    : false;

  const filterState: AdminFiltersState = useMemo(
    () => ({
      search: params.search,
      sort: params.sort,
      sortDir: params.sortDir,
    }),
    [params.search, params.sort, params.sortDir]
  );

  const logExtras = (
    <>
      <AdminSeverityFilter
        value={params.severity ?? ""}
        severities={ERROR_SEVERITIES}
        onChange={(severity) => setParams({ severity })}
      />
      <AdminStatusFilter
        label="Resolution"
        value={params.status ?? ""}
        statuses={ERROR_STATUS_FILTER}
        onChange={(status) => setParams({ status })}
      />
    </>
  );

  const handleResolve = useCallback(
    async (errorId: string) => {
      setResolveError(null);
      try {
        await resolveMutation.mutateAsync(errorId);
        setSelected((prev) =>
          prev?.id === errorId
            ? {
                ...prev,
                status: "resolved",
                resolvedAt: new Date().toISOString(),
              }
            : prev
        );
      } catch (e) {
        setResolveError(e instanceof Error ? e.message : "Failed to resolve");
      }
    },
    [resolveMutation]
  );

  const columns: ColumnDef<AdminErrorRow>[] = useMemo(
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
        id: "severity",
        header: "Severity",
        cell: (row) => <SeverityPill severity={row.severity} />,
      },
      {
        id: "feature",
        header: "Feature",
        cell: (row) => (
          <div className="min-w-[120px]">
            <p className="text-[13px] text-text-primary truncate">{row.feature || "—"}</p>
            {row.provider ? (
              <p className="text-[11px] text-text-tertiary truncate">{row.provider}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "message",
        header: "Error",
        cell: (row) => (
          <p className="text-[12px] text-text-secondary line-clamp-2 max-w-[360px]">
            {row.errorMessage}
          </p>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => <StatusPill status={row.status} />,
      },
      {
        id: "actions",
        header: "",
        align: "right",
        cell: (row) =>
          row.status === "open" && canResolve ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleResolve(row.id);
              }}
              disabled={resolveMutation.isPending}
              className="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
            >
              Resolve
            </button>
          ) : null,
      },
    ],
    [canResolve, handleResolve, resolveMutation.isPending]
  );

  return (
    <PageShell
      title="Errors"
      subtitle="System errors captured from instrumented flows. Resolve after investigation (admin role required)."
    >
      <AdminFilters
        searchPlaceholder="Feature, provider, or error message…"
        sortOptions={SORT_OPTIONS}
        state={filterState}
        onChange={(next) =>
          setParams({
            search: next.search.trim().toLowerCase(),
            sort: next.sort,
            sortDir: next.sortDir,
          })
        }
        extra={logExtras}
      />

      {resolveError ? (
        <p className="mb-4 text-[13px] text-status-danger">{resolveError}</p>
      ) : null}

      {isError ? (
        <EmptyState
          title="Could not load errors"
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
          loadingColumns={6}
          minWidth="1000px"
          onRowClick={setSelected}
          rowClassName={() => "cursor-pointer"}
          emptyState={
            <EmptyState
              title={params.status === "open" ? "No open errors" : "No errors logged"}
              body={
                params.status === "open"
                  ? "Open errors from failed API or system flows will appear here."
                  : "Errors are recorded when instrumented code paths call logSystemError."
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
        title={selected?.feature || "System error"}
        subtitle={selected ? formatAdminDate(selected.createdAt) : undefined}
        onClose={() => {
          setSelected(null);
          setResolveError(null);
        }}
      >
        {selected ? (
          <>
            <AdminDetailRows
              rows={[
                { label: "Error ID", value: selected.id },
                { label: "Severity", value: <SeverityPill severity={selected.severity} /> },
                { label: "Status", value: <StatusPill status={selected.status} /> },
                { label: "Feature", value: selected.feature || "—" },
                { label: "Provider", value: selected.provider || "—" },
                {
                  label: "Message",
                  value: (
                    <p className="text-[12px] text-text-secondary whitespace-pre-wrap">
                      {selected.errorMessage}
                    </p>
                  ),
                },
                { label: "User ID", value: selected.userId ?? "—" },
                { label: "Project ID", value: selected.projectId ?? "—" },
                {
                  label: "Resolved at",
                  value: selected.resolvedAt ? formatAdminDate(selected.resolvedAt) : "—",
                },
                { label: "Resolved by", value: selected.resolvedBy ?? "—" },
                {
                  label: "Metadata",
                  value: (
                    <pre className="text-[11px] text-text-secondary whitespace-pre-wrap break-all font-mono bg-surface-secondary rounded p-2 max-h-48 overflow-auto">
                      {JSON.stringify(selected.metadata, null, 2)}
                    </pre>
                  ),
                },
              ]}
            />
            {selected.status === "open" && canResolve ? (
              <button
                type="button"
                onClick={() => void handleResolve(selected.id)}
                disabled={resolveMutation.isPending}
                className={cn(
                  "mt-6 inline-flex h-9 items-center px-4 rounded-md text-[13px] font-medium",
                  "bg-brand-action text-white hover:opacity-90 disabled:opacity-50"
                )}
              >
                {resolveMutation.isPending ? "Resolving…" : "Mark resolved"}
              </button>
            ) : null}
            {!canResolve && selected.status === "open" ? (
              <p className="mt-4 text-[12px] text-text-tertiary">
                Admin or owner role required to resolve errors.
              </p>
            ) : null}
          </>
        ) : null}
      </AdminDetailDrawer>
    </PageShell>
  );
}
