"use client";

import { useState } from "react";
import { PageShell, Card, EmptyState, Input } from "@/components/common";
import {
  useAdminSettings,
  useGrantPlatformAdmin,
  useRevokePlatformAdmin,
} from "@/lib/query/admin-queries";
import { platformAdminMeetsMinRole } from "@/constants/enums/platform-admin-role";
import { PLATFORM_ADMIN_ROLES, type PlatformAdminRole } from "@/constants/enums/platform-admin-role";
import { formatAdminDate } from "@/lib/admin/format";
import { cn } from "@/lib/cn";
import { useAdminMe } from "@/lib/query/admin-queries";
import { Skeleton } from "@/components/Skeleton";

export function AdminSettingsDashboard() {
  const { data, isLoading, isError, error, refetch } = useAdminSettings();
  const grantMutation = useGrantPlatformAdmin();
  const revokeMutation = useRevokePlatformAdmin();

  const meQuery = useAdminMe();

  const isAdmin = meQuery.data ? platformAdminMeetsMinRole(meQuery.data.role, "admin") : false;
  const canEdit = isAdmin;

  const [grantEmail, setGrantEmail] = useState("");
  const [grantRole, setGrantRole] = useState<PlatformAdminRole>("admin");
  const [adminMessage, setAdminMessage] = useState<string | null>(null);

  const handleGrant = async () => {
    if (!canEdit || !grantEmail.trim()) return;
    setAdminMessage(null);
    try {
      await grantMutation.mutateAsync({ email: grantEmail.trim(), role: grantRole });
      setGrantEmail("");
      setAdminMessage("Admin access granted successfully.");
    } catch (e) {
      setAdminMessage(e instanceof Error ? e.message : "Grant failed");
    }
  };

  const handleRevoke = async (id: string) => {
    if (!canEdit) return;
    setAdminMessage(null);
    try {
      await revokeMutation.mutateAsync(id);
      setAdminMessage("Admin access revoked.");
    } catch (e) {
      setAdminMessage(e instanceof Error ? e.message : "Revoke failed");
    }
  };

  if (isLoading || !data) {
    return (
      <PageShell title="Access Control" subtitle="Platform admin accounts and access rights.">
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-[16px]" />
        </div>
      </PageShell>
    );
  }

  if (isError) {
    return (
      <PageShell title="Access Control" subtitle="Platform admin accounts and access rights.">
        <EmptyState
          title="Could not load access control list"
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
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Access Control"
      subtitle={
        canEdit
          ? "Manage and audit accounts with administrative access to this platform."
          : "View-only — admin role required to modify roles."
      }
    >
      <div className="space-y-6 animate-fade-in">
        <Card padding="lg" className="bg-surface-secondary border border-border-subtle rounded-[16px] shadow-sm">
          <div className="border-b border-border-subtle pb-4 mb-6">
            <h2 className="text-[18px] font-bold font-display text-text-primary">Platform Admins</h2>
            <p className="text-xs text-text-tertiary mt-1">
              Platform admins have access to sensitive user statistics, logs, errors, and subscription controls.
            </p>
          </div>

          <div className="overflow-x-auto rounded-[12px] border border-border-subtle mb-6 bg-surface-elevated">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-secondary/50">
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
                    Email Address
                  </th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
                    Access Role
                  </th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
                    Date Added
                  </th>
                  {canEdit ? (
                    <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-text-tertiary text-right">
                      Action
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {data.admins.map((row) => (
                  <tr key={row.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-secondary/30 transition-colors">
                    <td className="px-5 py-3.5 text-text-primary font-medium">{row.email}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={cn(
                          "text-[11px] font-bold uppercase px-2 py-0.5 rounded-full tracking-wider border",
                          row.role === "owner"
                            ? "bg-brand-violet/15 text-brand-violet border-brand-violet/30"
                            : row.role === "admin"
                              ? "bg-brand-primary/15 text-brand-primary border-brand-primary/30"
                              : "bg-text-tertiary/10 text-text-secondary border-border-subtle"
                        )}
                      >
                        {row.role}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-text-tertiary">
                      {formatAdminDate(row.createdAt)}
                    </td>
                    {canEdit ? (
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          disabled={revokeMutation.isPending}
                          onClick={() => void handleRevoke(row.id)}
                          className="text-[12px] font-semibold text-rose-400 hover:text-rose-300 hover:underline disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          Revoke
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canEdit ? (
            <div className="border-t border-border-subtle pt-6 flex flex-col gap-4">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                Grant New Admin Access
              </h3>
              <p className="text-xs text-text-tertiary -mt-2">
                User must sign in via Clerk using this email to claim administrative access.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    value={grantEmail}
                    onChange={(e) => setGrantEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="w-full"
                  />
                </div>
                <div className="w-full sm:w-44">
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                    Access Level (Role)
                  </label>
                  <select
                    value={grantRole}
                    onChange={(e) => setGrantRole(e.target.value as PlatformAdminRole)}
                    className="w-full h-9 rounded-md border border-border-subtle bg-surface-elevated px-3 text-[13px] text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-action transition-all"
                  >
                    {PLATFORM_ADMIN_ROLES.filter((r) => r !== "owner").map((r) => (
                      <option key={r} value={r}>
                        {r.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => void handleGrant()}
                  disabled={grantMutation.isPending || !grantEmail.trim()}
                  className="h-9 px-5 rounded-md text-[13px] font-semibold border border-border-subtle bg-brand-action hover:bg-brand-action-hover text-white disabled:opacity-50 transition-all cursor-pointer"
                >
                  {grantMutation.isPending ? "Granting..." : "Grant Access"}
                </button>
              </div>
            </div>
          ) : null}

          {adminMessage ? (
            <p className="mt-4 text-[13px] text-text-secondary font-medium animate-fade-in">{adminMessage}</p>
          ) : null}
        </Card>
      </div>
    </PageShell>
  );
}
