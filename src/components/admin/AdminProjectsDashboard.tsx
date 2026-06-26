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
import { useAdminProjects } from "@/lib/query/admin-queries";
import {
  formatAdminDate,
  formatAdminInt,
} from "@/lib/admin/format";
import type { AdminProjectRow } from "@/types/admin-projects";
import { cn } from "@/lib/cn";

const PROJECT_SORT_OPTIONS = [
  { value: "updated", label: "Last updated" },
  { value: "created", label: "Created" },
  { value: "name", label: "Name" },
  { value: "domain", label: "Domain" },
];

function HealthBadge({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="text-text-tertiary">—</span>;
  }
  const tone =
    score >= 70
      ? "text-status-success"
      : score >= 50
        ? "text-status-warning"
        : "text-status-danger";
  return <span className={cn("tabular-nums font-medium", tone)}>{score}</span>;
}

export function AdminProjectsDashboard() {
  const { params, setParams } = useAdminListUrlState("updated", "desc");
  const { data, isLoading, isError, error, refetch } = useAdminProjects(params);
  const [selected, setSelected] = useState<AdminProjectRow | null>(null);

  const filterState: AdminFiltersState = useMemo(
    () => ({
      search: params.search,
      sort: params.sort,
      sortDir: params.sortDir,
      userId: params.userId,
    }),
    [params.search, params.sort, params.sortDir, params.userId]
  );

  const columns: ColumnDef<AdminProjectRow>[] = useMemo(
    () => [
      {
        id: "project",
        header: "Project",
        cell: (row) => (
          <div className="min-w-[200px]">
            <p className="font-medium text-text-primary truncate">{row.name}</p>
            <p className="text-[12px] text-text-tertiary truncate">{row.domain}</p>
          </div>
        ),
      },
      {
        id: "niche",
        header: "Niche",
        cell: (row) => (
          <span className="text-[12px] text-text-secondary truncate max-w-[160px] block">
            {row.niche || "—"}
          </span>
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
        id: "health",
        header: "Avg health",
        align: "right",
        cell: (row) => <HealthBadge score={row.avgHealthScore} />,
      },
      {
        id: "updated",
        header: "Updated",
        align: "right",
        cell: (row) => (
          <span className="text-[12px] text-text-secondary whitespace-nowrap">
            {formatAdminDate(row.updatedAt)}
          </span>
        ),
      },
    ],
    []
  );

  const userFilterExtra = params.userId ? (
    <div className="w-full lg:w-auto flex items-end">
      <div className="rounded-md border border-brand-action/30 bg-brand-action/10 px-3 py-2 text-[12px] text-text-secondary">
        Filtered by user{" "}
        <code className="text-text-primary">{params.userId.slice(0, 12)}…</code>
        <button
          type="button"
          className="ml-2 text-brand-action hover:underline"
          onClick={() => setParams({ userId: "" })}
        >
          Clear
        </button>
      </div>
    </div>
  ) : null;

  return (
    <PageShell
      title="Projects"
      subtitle="All workspaces across the platform with content and audit health."
    >
      <AdminFilters
        searchPlaceholder="Name, domain, niche, or company…"
        sortOptions={PROJECT_SORT_OPTIONS}
        state={filterState}
        onChange={(next) =>
          setParams({
            search: next.search.trim().toLowerCase(),
            sort: next.sort,
            sortDir: next.sortDir,
          })
        }
        extra={userFilterExtra}
      />

      {isError ? (
        <EmptyState
          title="Could not load projects"
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
          minWidth="900px"
          onRowClick={setSelected}
          rowClassName={() => "cursor-pointer"}
          emptyState={
            <EmptyState
              title={
                params.search || params.userId
                  ? "No projects match your filters"
                  : "No projects yet"
              }
              body="Projects appear when users onboard a workspace."
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
        title={selected?.name ?? "Project"}
        subtitle={selected?.domain}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <>
            <AdminDetailRows
              rows={[
                { label: "Project ID", value: selected.id },
                { label: "Domain", value: selected.domain },
                { label: "Niche", value: selected.niche || "—" },
                { label: "Region", value: selected.targetRegion || "—" },
                { label: "Owner (Clerk ID)", value: selected.userId },
                { label: "Keywords", value: formatAdminInt(selected.keywordCount) },
                {
                  label: "Competitors",
                  value: formatAdminInt(selected.competitorCount),
                },
                { label: "Blogs", value: formatAdminInt(selected.contentCount) },
                {
                  label: "Calendar entries",
                  value: formatAdminInt(selected.calendarCount),
                },
                {
                  label: "Avg content health",
                  value:
                    selected.avgHealthScore != null
                      ? `${selected.avgHealthScore} (${formatAdminInt(selected.auditsRun)} audits)`
                      : "—",
                },
                { label: "Created", value: formatAdminDate(selected.createdAt) },
                { label: "Updated", value: formatAdminDate(selected.updatedAt) },
              ]}
            />
            <Link
              href={`/admin/users`}
              className={cn(
                "mt-4 mr-3 inline-flex h-9 items-center px-4 rounded-md text-[13px] font-medium",
                "border border-border-subtle text-text-secondary hover:bg-surface-hover"
              )}
            >
              All users
            </Link>
            <Link
              href={`/projects/${selected.id}/keywords`}
              className={cn(
                "mt-4 inline-flex h-9 items-center px-4 rounded-md text-[13px] font-medium",
                "bg-brand-action text-white hover:opacity-90"
              )}
            >
              Open workspace
            </Link>
          </>
        ) : null}
      </AdminDetailDrawer>
    </PageShell>
  );
}
