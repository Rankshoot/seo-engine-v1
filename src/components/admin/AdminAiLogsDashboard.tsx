"use client";

import { useMemo, useState } from "react";
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
import { useAdminAiLogDetail, useAdminAiLogs } from "@/lib/query/admin-queries";
import {
  formatAdminDate,
  formatAdminInt,
  formatAdminUsd,
} from "@/lib/admin/format";
import { AI_USAGE_STATUSES } from "@/constants/enums/usage-provider";
import type { AdminAiLogRow } from "@/types/admin-ai-logs";
import { cn } from "@/lib/cn";

const SORT_OPTIONS = [
  { value: "created", label: "Time" },
  { value: "cost", label: "Cost" },
  { value: "tokens", label: "Input tokens" },
  { value: "model", label: "Model" },
];

const AI_MODELS = [
  "claude-sonnet-4-6",
  "claude-opus-4-8",
  "claude-haiku-4-5",
  "claude-haiku-4-5-20251001",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "text-embedding-004",
] as const;

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "success"
      ? "bg-emerald-500/15 text-emerald-400"
      : "bg-rose-500/15 text-rose-400";
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

function PromptSummaryCell({ promptSummary }: { promptSummary: string }) {
  const [expanded, setExpanded] = useState(false);

  if (!promptSummary) return <span>—</span>;

  const isLong = promptSummary.length > 200;
  const displayText = expanded || !isLong
    ? promptSummary
    : `${promptSummary.slice(0, 200)}...`;

  return (
    <div className="text-[12px] text-text-secondary max-w-[340px]">
      <p className="whitespace-pre-wrap break-words">{displayText}</p>
      {isLong && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="mt-1 text-[11px] font-semibold text-brand-action hover:underline focus:outline-none block"
        >
          {expanded ? "Show less" : "Show prompt"}
        </button>
      )}
    </div>
  );
}

export function AdminAiLogsDashboard() {
  const { params, setParams } = useAdminListUrlState("created", "desc");
  const { data, isLoading, isError, error, refetch } = useAdminAiLogs(params);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailQuery = useAdminAiLogDetail(selectedId);

  const filterState: AdminFiltersState = useMemo(
    () => ({
      search: params.search,
      sort: params.sort,
      sortDir: params.sortDir,
    }),
    [params.search, params.sort, params.sortDir]
  );

  const modelFilter = (
    <div className="w-full lg:w-44">
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
        Model
      </label>
      <select
        value={params.provider ?? ""}
        onChange={(e) => setParams({ provider: e.target.value })}
        className={cn(
          "w-full h-9 rounded-md border border-border-subtle bg-surface-elevated px-3 text-[13px] text-text-primary",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-action/40"
        )}
      >
        <option value="">All models</option>
        {AI_MODELS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );

  const callTypeFilter = (
    <div className="w-full lg:w-44">
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
        Type
      </label>
      <select
        value={params.action ?? ""}
        onChange={(e) => setParams({ action: e.target.value })}
        className={cn(
          "w-full h-9 rounded-md border border-border-subtle bg-surface-elevated px-3 text-[13px] text-text-primary",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-action/40"
        )}
      >
        <option value="">All types</option>
        <option value="content_generation">Content Generation</option>
        <option value="helper">AI Helper (Credits)</option>
      </select>
    </div>
  );

  const logExtras = (
    <>
      {callTypeFilter}
      {modelFilter}
      <AdminStatusFilter
        value={params.status ?? ""}
        statuses={AI_USAGE_STATUSES}
        onChange={(status) => setParams({ status })}
      />
    </>
  );

  const columns: ColumnDef<AdminAiLogRow>[] = useMemo(
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
        id: "feature",
        header: "Feature",
        cell: (row) => (
          <span className="text-[13px] text-text-primary truncate max-w-[160px] block">
            {row.feature || "—"}
          </span>
        ),
      },
      {
        id: "model",
        header: "Model",
        cell: (row) => (
          <span className="text-[12px] text-text-secondary font-mono truncate max-w-[140px] block">
            {row.model || "—"}
          </span>
        ),
      },
      {
        id: "prompt",
        header: "Prompt summary",
        cell: (row) => <PromptSummaryCell promptSummary={row.promptSummary} />,
      },
      {
        id: "tokens",
        header: "Tokens",
        align: "right",
        cell: (row) => (
          <span className="tabular-nums text-[12px]">
            {row.tokensInput != null || row.tokensOutput != null
              ? `${formatAdminInt(row.tokensInput ?? 0)} / ${formatAdminInt(row.tokensOutput ?? 0)}`
              : "—"}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => <StatusPill status={row.status} />,
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

  const detail = detailQuery.data;
  const listRow = data?.items.find((r) => r.id === selectedId);

  return (
    <PageShell
      title="AI logs"
      subtitle="LLM calls with redacted summaries. Full prompt/response only when debug logging is enabled in settings."
    >
      <AdminFilters
        searchPlaceholder="Feature, model, prompt summary, or error…"
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
          title="Could not load AI logs"
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
          minWidth="1000px"
          onRowClick={(row) => setSelectedId(row.id)}
          rowClassName={() => "cursor-pointer"}
          emptyState={
            <EmptyState
              title="No AI usage logged yet"
              body="Logs appear after blog generation, brief extraction, audits, and other Gemini flows run."
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
        open={!!selectedId}
        title={detail?.feature ?? listRow?.feature ?? "AI log"}
        subtitle={detail ? formatAdminDate(detail.createdAt) : undefined}
        onClose={() => setSelectedId(null)}
      >
        {detailQuery.isLoading ? (
          <p className="text-[13px] text-text-tertiary">Loading…</p>
        ) : detail ? (
          <>
            {(detail.hasFullPrompt || detail.hasFullResponse) && (
              <p className="mb-4 text-[12px] text-amber-400/90 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                Debug logging is on — full prompt/response may contain sensitive content.
              </p>
            )}
            <AdminDetailRows
              rows={[
                { label: "Log ID", value: detail.id },
                { label: "Feature", value: detail.feature || "—" },
                { label: "Model", value: detail.model || "—" },
                { label: "Status", value: <StatusPill status={detail.status} /> },
                {
                  label: "Tokens (in / out)",
                  value: `${formatAdminInt(detail.tokensInput ?? 0)} / ${formatAdminInt(detail.tokensOutput ?? 0)}`,
                },
                ...(detail.tokensCachedRead ? [{
                  label: "Cache read tokens",
                  value: formatAdminInt(detail.tokensCachedRead),
                }] : []),
                ...(detail.tokensCachedWrite ? [{
                  label: "Cache write tokens",
                  value: formatAdminInt(detail.tokensCachedWrite),
                }] : []),
                {
                  label: "Est. cost",
                  value: formatAdminUsd(detail.estimatedCostUsd ?? 0),
                },
                ...(detail.costSavingsUsd ? [{
                  label: "Est. cost savings",
                  value: formatAdminUsd(detail.costSavingsUsd),
                }] : []),
                { label: "User ID", value: detail.userId ?? "—" },
                { label: "Project ID", value: detail.projectId ?? "—" },
                {
                  label: "Prompt summary",
                  value: (
                    <p className="text-[12px] text-text-secondary whitespace-pre-wrap">
                      {detail.promptSummary || "—"}
                    </p>
                  ),
                },
                ...(detail.promptFull
                  ? [
                      {
                        label: "Full prompt",
                        value: (
                          <pre className="text-[11px] font-mono text-text-secondary whitespace-pre-wrap break-all bg-surface-secondary rounded p-2 max-h-56 overflow-auto">
                            {detail.promptFull}
                          </pre>
                        ),
                      },
                    ]
                  : []),
                ...(detail.responseFull
                  ? [
                      {
                        label: "Full response",
                        value: (
                          <pre className="text-[11px] font-mono text-text-secondary whitespace-pre-wrap break-all bg-surface-secondary rounded p-2 max-h-56 overflow-auto">
                            {detail.responseFull}
                          </pre>
                        ),
                      },
                    ]
                  : []),
                {
                  label: "Error",
                  value: detail.errorMessage || "—",
                },
                {
                  label: "Metadata",
                  value: (
                    <pre className="text-[11px] text-text-secondary whitespace-pre-wrap break-all font-mono bg-surface-secondary rounded p-2 max-h-40 overflow-auto">
                      {JSON.stringify(detail.metadata, null, 2)}
                    </pre>
                  ),
                },
              ]}
            />
          </>
        ) : detailQuery.isError ? (
          <EmptyState title="Could not load log detail" body="Try closing and reopening the row." />
        ) : null}
      </AdminDetailDrawer>
    </PageShell>
  );
}
