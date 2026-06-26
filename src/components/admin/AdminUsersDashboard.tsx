"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageShell, EmptyState } from "@/components/common";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { AdminFilters, type AdminFiltersState } from "@/components/admin/AdminFilters";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminUserModal } from "@/components/admin/AdminUserModal";
import { useAdminListUrlState } from "@/hooks/useAdminListUrlState";
import { useAdminUsers, useUpdateUserApproval } from "@/lib/query/admin-queries";
import {
  formatAdminDate,
  formatAdminInt,
  formatAdminUsd,
} from "@/lib/admin/format";
import type { AdminUserRow, ApprovalStatus } from "@/types/admin-users";
import { cn } from "@/lib/cn";
import type { ApprovalAction } from "@/frontend/api/admin";

const USER_SORT_OPTIONS = [
  { value: "lastActive", label: "Last active" },
  { value: "firstSeen", label: "First seen" },
  { value: "projectCount", label: "Projects" },
  { value: "userId", label: "User ID" },
];

const STATUS_CONFIG: Record<ApprovalStatus, { label: string; className: string }> = {
  approved: { label: "Approved", className: "bg-status-success/10 text-status-success" },
  pending:  { label: "Pending",  className: "bg-status-warning/10 text-status-warning" },
  denied:   { label: "Denied",   className: "bg-status-danger/10 text-status-danger" },
  revoked:  { label: "Revoked",  className: "bg-zinc-500/10 text-zinc-400" },
};

function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        cfg.className
      )}
    >
      {cfg.label}
    </span>
  );
}

interface NotesModalProps {
  open: boolean;
  action: "deny" | "revoke";
  onConfirm: (notes: string) => void;
  onClose: () => void;
  isPending: boolean;
}

function NotesModal({ open, action, onConfirm, onClose, isPending }: NotesModalProps) {
  const [notes, setNotes] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-2xl border border-border-default bg-surface-secondary p-6 shadow-2xl">
        <h3 className="mb-1 text-[15px] font-semibold text-text-primary capitalize">
          {action} user
        </h3>
        <p className="mb-4 text-[13px] text-text-tertiary">
          Optionally add a note for your records.
        </p>
        <textarea
          className="w-full rounded-lg border border-border-default bg-surface-primary px-3 py-2 text-[13px] text-text-primary placeholder-text-tertiary outline-none focus:border-brand-action resize-none"
          rows={3}
          placeholder="Notes (optional)…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 rounded-md text-[13px] text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => { onConfirm(notes); setNotes(""); }}
            className={cn(
              "h-8 px-4 rounded-md text-[13px] font-medium text-white transition-opacity",
              action === "deny" ? "bg-status-danger hover:opacity-90" : "bg-zinc-600 hover:opacity-90",
              isPending && "opacity-50 cursor-not-allowed"
            )}
          >
            {isPending ? "Saving…" : `Confirm ${action}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminUsersDashboard() {
  const { params, setParams } = useAdminListUrlState("lastActive", "desc");
  const { data, isLoading, isError, error, refetch } = useAdminUsers(params);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [notesModal, setNotesModal] = useState<{
    userId: string;
    action: "deny" | "revoke";
  } | null>(null);

  const updateApproval = useUpdateUserApproval();

  const handleApprovalAction = (userId: string, action: ApprovalAction, notes?: string) => {
    updateApproval.mutate({ userId, action, notes });
    setNotesModal(null);
  };

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
        id: "status",
        header: "Status",
        cell: (row) => <ApprovalBadge status={row.approvalStatus} />,
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
      {
        id: "actions",
        header: "",
        align: "right",
        cell: (row) => (
          <div
            className="flex items-center justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {(row.approvalStatus === "pending" ||
              row.approvalStatus === "denied" ||
              row.approvalStatus === "revoked") && (
              <button
                type="button"
                onClick={() => handleApprovalAction(row.userId, "approve")}
                disabled={updateApproval.isPending}
                className="h-7 px-2.5 rounded-md text-[12px] font-medium bg-status-success/10 text-status-success hover:bg-status-success/20 transition-colors disabled:opacity-50"
              >
                Approve
              </button>
            )}
            {row.approvalStatus === "pending" && (
              <button
                type="button"
                onClick={() => setNotesModal({ userId: row.userId, action: "deny" })}
                disabled={updateApproval.isPending}
                className="h-7 px-2.5 rounded-md text-[12px] font-medium bg-status-danger/10 text-status-danger hover:bg-status-danger/20 transition-colors disabled:opacity-50"
              >
                Deny
              </button>
            )}
            {row.approvalStatus === "approved" && (
              <button
                type="button"
                onClick={() => setNotesModal({ userId: row.userId, action: "revoke" })}
                disabled={updateApproval.isPending}
                className="h-7 px-2.5 rounded-md text-[12px] font-medium bg-zinc-500/10 text-zinc-400 hover:bg-zinc-500/20 transition-colors disabled:opacity-50"
              >
                Revoke
              </button>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateApproval.isPending]
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
          loadingColumns={9}
          minWidth="1080px"
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

      <AdminUserModal
        open={!!selected}
        userId={selected?.userId ?? null}
        onClose={() => setSelected(null)}
        onSaveSuccess={() => {
          void refetch();
        }}
        userEmail={selected?.email}
        userDisplayName={selected?.displayName}
      />

      <NotesModal
        open={!!notesModal}
        action={notesModal?.action ?? "deny"}
        isPending={updateApproval.isPending}
        onClose={() => setNotesModal(null)}
        onConfirm={(notes) => {
          if (!notesModal) return;
          handleApprovalAction(notesModal.userId, notesModal.action as ApprovalAction, notes);
        }}
      />
    </PageShell>
  );
}
