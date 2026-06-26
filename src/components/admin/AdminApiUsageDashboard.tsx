"use client";

import { useMemo, useState } from "react";
import { PageShell, EmptyState } from "@/components/common";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { AdminFilters, type AdminFiltersState } from "@/components/admin/AdminFilters";
import { AdminPagination } from "@/components/admin/AdminPagination";
import {
  AdminProviderFilter,
  AdminStatusFilter,
} from "@/components/admin/AdminLogFilterExtras";
import {
  AdminDetailDrawer,
  AdminDetailRows,
} from "@/components/admin/AdminDetailDrawer";
import { useAdminListUrlState } from "@/hooks/useAdminListUrlState";
import { useAdminApiUsage } from "@/lib/query/admin-queries";
import {
  formatAdminDate,
  formatAdminInt,
  formatAdminUsd,
} from "@/lib/admin/format";
import { API_USAGE_PROVIDERS, API_USAGE_STATUSES } from "@/constants/enums/usage-provider";
import type { AdminApiUsageRow } from "@/types/admin-api-usage";
import { cn } from "@/lib/cn";

const SORT_OPTIONS = [
  { value: "created", label: "Time" },
  { value: "cost", label: "Cost" },
  { value: "latency", label: "Latency" },
  { value: "provider", label: "Provider" },
];

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "success"
      ? "bg-status-success/15 text-status-success"
      : status === "cached"
        ? "bg-status-info/15 text-status-info"
        : "bg-status-danger/15 text-status-danger";
  return (
    <span
      className={cn(
        "inline-flex px-2 py-0.5 rounded text-[11px] font-medium capitalize",
        tone
      )}
    >
      {status}
    </span>
  );
}

export function AdminApiUsageDashboard() {
  const { params, setParams } = useAdminListUrlState("created", "desc");
  const { data, isLoading, isError, error, refetch } = useAdminApiUsage(params);
  const [selected, setSelected] = useState<AdminApiUsageRow | null>(null);

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
      <AdminProviderFilter
        value={params.provider ?? ""}
        providers={API_USAGE_PROVIDERS}
        onChange={(provider) => setParams({ provider })}
      />
      <AdminStatusFilter
        value={params.status ?? ""}
        statuses={API_USAGE_STATUSES}
        onChange={(status) => setParams({ status })}
      />
    </>
  );

  const columns: ColumnDef<AdminApiUsageRow>[] = useMemo(
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
        id: "provider",
        header: "Provider",
        cell: (row) => (
          <span className="font-medium text-text-primary capitalize">{row.provider}</span>
        ),
      },
      {
        id: "feature",
        header: "Feature",
        cell: (row) => (
          <div className="min-w-[140px] max-w-[220px]">
            <p className="text-[13px] text-text-primary truncate">{row.feature || "—"}</p>
            {row.endpoint ? (
              <p className="text-[11px] text-text-tertiary truncate">{row.endpoint}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => <StatusPill status={row.status} />,
      },
      {
        id: "cache",
        header: "Cache",
        align: "center",
        cell: (row) =>
          row.cacheHit ? (
            <span className="text-[11px] text-status-info font-medium">Hit</span>
          ) : (
            <span className="text-text-tertiary">—</span>
          ),
      },
      {
        id: "latency",
        header: "Latency",
        align: "right",
        cell: (row) => (
          <span className="tabular-nums text-[12px]">
            {row.latencyMs != null ? `${formatAdminInt(row.latencyMs)} ms` : "—"}
          </span>
        ),
      },
      {
        id: "cost",
        header: "Est. cost",
        align: "right",
        cell: (row) => (
          <span className="tabular-nums">{formatAdminUsd(row.estimatedCostUsd ?? 0)}</span>
        ),
      },
    ],
    []
  );

  return (
    <PageShell
      title="API usage"
      subtitle="Third-party API calls — costs, cache hits, and errors (instrumented providers)."
    >
      <AdminFilters
        searchPlaceholder="Feature, endpoint, provider, or error…"
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

      {isError ? (
        <EmptyState
          title="Could not load API usage"
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
          loadingColumns={7}
          minWidth="920px"
          onRowClick={setSelected}
          rowClassName={() => "cursor-pointer"}
          emptyState={
            <EmptyState
              title="No API usage logged yet"
              body="Calls appear here after keyword discovery, SERP research, scraping, and other instrumented flows run."
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
        title={selected ? `${selected.provider} · ${selected.feature || "API call"}` : "API call"}
        subtitle={selected ? formatAdminDate(selected.createdAt) : undefined}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <AdminDetailRows
            rows={[
              { label: "Log ID", value: selected.id },
              { label: "Provider", value: selected.provider },
              { label: "Feature", value: selected.feature || "—" },
              { label: "Endpoint", value: selected.endpoint || "—" },
              { label: "Status", value: <StatusPill status={selected.status} /> },
              {
                label: "Cache",
                value: selected.cacheHit ? "Cache hit" : selected.cached ? "Cached flag" : "Miss",
              },
              {
                label: "Latency",
                value:
                  selected.latencyMs != null
                    ? `${formatAdminInt(selected.latencyMs)} ms`
                    : "—",
              },
              {
                label: "Credits",
                value:
                  selected.creditsUsed != null
                    ? formatAdminInt(selected.creditsUsed)
                    : "—",
              },
              {
                label: "Est. cost",
                value: formatAdminUsd(selected.estimatedCostUsd ?? 0),
              },
              { label: "User ID", value: selected.userId ?? "—" },
              { label: "Project ID", value: selected.projectId ?? "—" },
              {
                label: "Error",
                value: selected.errorMessage || "—",
              },
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
        ) : null}
      </AdminDetailDrawer>
    </PageShell>
  );
}
