"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageShell, EmptyState } from "@/components/common";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { AdminFilters, type AdminFiltersState } from "@/components/admin/AdminFilters";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminStatusFilter } from "@/components/admin/AdminLogFilterExtras";
import {
  AdminDetailDrawer,
  AdminDetailRows,
} from "@/components/admin/AdminDetailDrawer";
import { useAdminListUrlState } from "@/hooks/useAdminListUrlState";
import { useAdminContent } from "@/lib/query/admin-queries";
import {
  ADMIN_BLOG_STATUSES,
  ADMIN_CONTENT_TYPES,
} from "@/constants/admin-content";
import { adminContentEditorHref } from "@/lib/admin/content-href";
import {
  formatAdminDate,
  formatAdminInt,
} from "@/lib/admin/format";
import type { AdminContentRow } from "@/types/admin-content";
import { cn } from "@/lib/cn";

const SORT_OPTIONS = [
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "title", label: "Title" },
  { value: "words", label: "Word count" },
];

function TypePill({ type }: { type: string }) {
  return (
    <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium capitalize bg-surface-secondary text-text-secondary border border-border-subtle">
      {type}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "published"
      ? "bg-status-success/15 text-status-success"
      : status === "approved"
        ? "bg-status-info/15 text-status-info"
        : "bg-surface-secondary text-text-secondary";
  return (
    <span className={cn("inline-flex px-2 py-0.5 rounded text-[11px] font-medium capitalize", tone)}>
      {status}
    </span>
  );
}

export function AdminContentDashboard() {
  const { params, setParams } = useAdminListUrlState("created", "desc");
  const { data, isLoading, isError, error, refetch } = useAdminContent(params);
  const [selected, setSelected] = useState<AdminContentRow | null>(null);

  const filterState: AdminFiltersState = useMemo(
    () => ({
      search: params.search,
      sort: params.sort,
      sortDir: params.sortDir,
    }),
    [params.search, params.sort, params.sortDir]
  );

  const typeFilter = (
    <div className="w-full lg:w-40">
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
        Type
      </label>
      <select
        value={params.provider ?? ""}
        onChange={(e) => setParams({ provider: e.target.value })}
        className={cn(
          "w-full h-9 rounded-md border border-border-subtle bg-surface-elevated px-3 text-[13px] text-text-primary",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-action/40"
        )}
      >
        <option value="">All types</option>
        {ADMIN_CONTENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );

  const logExtras = (
    <>
      {typeFilter}
      <AdminStatusFilter
        label="Workflow status"
        value={params.status ?? ""}
        statuses={ADMIN_BLOG_STATUSES}
        onChange={(status) => setParams({ status })}
      />
    </>
  );

  const columns: ColumnDef<AdminContentRow>[] = useMemo(
    () => [
      {
        id: "title",
        header: "Title",
        cell: (row) => (
          <div className="min-w-[200px] max-w-[320px]">
            <p className="font-medium text-text-primary truncate">{row.title}</p>
            {row.targetKeyword ? (
              <p className="text-[11px] text-text-tertiary truncate">{row.targetKeyword}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "project",
        header: "Project",
        cell: (row) => (
          <span className="text-[12px] text-text-secondary truncate max-w-[140px] block">
            {row.projectName}
          </span>
        ),
      },
      {
        id: "type",
        header: "Type",
        cell: (row) => <TypePill type={row.contentType} />,
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => <StatusPill status={row.status} />,
      },
      {
        id: "words",
        header: "Words",
        align: "right",
        cell: (row) => (
          <span className="tabular-nums">{formatAdminInt(row.wordCount)}</span>
        ),
      },
      {
        id: "score",
        header: "Analysis",
        align: "right",
        cell: (row) =>
          row.deepAnalysisScore != null ? (
            <span className="tabular-nums text-text-secondary">{row.deepAnalysisScore}</span>
          ) : (
            <span className="text-text-tertiary">—</span>
          ),
      },
      {
        id: "created",
        header: "Created",
        align: "right",
        cell: (row) => (
          <span className="text-[12px] text-text-secondary whitespace-nowrap">
            {formatAdminDate(row.createdAt)}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <PageShell
      title="Content"
      subtitle="Generated blogs, ebooks, whitepapers, and LinkedIn posts across all workspaces."
    >
      <AdminFilters
        searchPlaceholder="Title, keyword, slug, or article type…"
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
          title="Could not load content"
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
          minWidth="960px"
          onRowClick={setSelected}
          rowClassName={() => "cursor-pointer"}
          emptyState={
            <EmptyState
              title="No content assets yet"
              body="Assets appear here after users generate blogs or Content Studio outputs."
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
        title={selected?.title ?? "Content"}
        subtitle={selected ? `${selected.projectName} · ${selected.contentType}` : undefined}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <>
            <AdminDetailRows
              rows={[
                { label: "Asset ID", value: selected.id },
                { label: "Type", value: <TypePill type={selected.contentType} /> },
                { label: "Status", value: <StatusPill status={selected.status} /> },
                { label: "Project", value: selected.projectName },
                { label: "Domain", value: selected.projectDomain || "—" },
                { label: "Target keyword", value: selected.targetKeyword || "—" },
                { label: "Article type", value: selected.articleType || "—" },
                { label: "Slug", value: selected.slug || "—" },
                { label: "Word count", value: formatAdminInt(selected.wordCount) },
                {
                  label: "Deep analysis score",
                  value:
                    selected.deepAnalysisScore != null
                      ? String(selected.deepAnalysisScore)
                      : "—",
                },
                { label: "Source URL", value: selected.sourceUrl || "—" },
                { label: "Owner (Clerk ID)", value: selected.userId ?? "—" },
                { label: "Created", value: formatAdminDate(selected.createdAt) },
                { label: "Updated", value: formatAdminDate(selected.updatedAt) },
              ]}
            />
            <Link
              href={adminContentEditorHref(selected)}
              className={cn(
                "mt-6 inline-flex h-9 items-center px-4 rounded-md text-[13px] font-medium",
                "bg-brand-action text-white hover:opacity-90"
              )}
            >
              Open in editor
            </Link>
          </>
        ) : null}
      </AdminDetailDrawer>
    </PageShell>
  );
}
