"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { PageShell, Card, EmptyState } from "@/components/common";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { useAdminOverview } from "@/lib/query/admin-queries";
import { Skeleton } from "@/components/Skeleton";
import { cn } from "@/lib/cn";

function formatUsd(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0.01) return "<$0.01";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatInt(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function OverviewSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-card" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  href,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <Card padding="none" className="border border-border-subtle overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
        <div>
          <h2 className="text-[14px] font-semibold text-text-primary">{title}</h2>
          {subtitle ? (
            <p className="text-[12px] text-text-tertiary mt-0.5">{subtitle}</p>
          ) : null}
        </div>
        {href ? (
          <Link
            href={href}
            className="text-[12px] font-medium text-brand-action hover:underline"
          >
            View all
          </Link>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

function MiniTable({
  headers,
  rows,
  emptyLabel,
}: {
  headers: string[];
  rows: ReactNode[][];
  emptyLabel: string;
}) {
  if (!rows.length) {
    return (
      <div className="p-6">
        <EmptyState title={emptyLabel} />
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-border-subtle bg-surface-secondary/50">
            {headers.map((h) => (
              <th
                key={h}
                className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr
              key={i}
              className="border-b border-border-subtle/60 last:border-0 hover:bg-surface-hover/50"
            >
              {cells.map((cell, j) => (
                <td key={j} className="px-5 py-3 text-text-secondary align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


export function AdminOverviewDashboard() {
  const { data, isLoading, isError, error, refetch } = useAdminOverview();

  if (isLoading) {
    return (
      <PageShell title="Overview" subtitle="Platform health and activity at a glance.">
        <OverviewSkeleton />
      </PageShell>
    );
  }

  if (isError || !data) {
    return (
      <PageShell title="Overview" subtitle="Platform health and activity at a glance.">
        <Card className="p-8 border border-border-subtle">
          <EmptyState
            title="Could not load overview"
            body={error instanceof Error ? error.message : "Unknown error"}
            action={
              <button
                type="button"
                onClick={() => refetch()}
                className="text-[13px] font-medium text-brand-action hover:underline"
              >
                Try again
              </button>
            }
          />
        </Card>
      </PageShell>
    );
  }

  const { metrics, providerUsage, recentProjects, recentContent, recentErrors, recentUsers } =
    data;

  return (
    <PageShell
      title="Overview"
      subtitle="Last 30 days for usage and cost · all-time for totals."
    >
      {data.instrumentationNote ? (
        <Card className="mb-6 p-4 border border-status-warning/30 bg-status-warning/10">
          <p className="text-[13px] text-status-warning/90">{data.instrumentationNote}</p>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <AdminMetricCard label="Total users" value={formatInt(metrics.totalUsers)} />
        <AdminMetricCard
          label="Active users"
          value={formatInt(metrics.activeUsers30d)}
          sub="30-day window"
          tone="info"
        />
        <AdminMetricCard label="Projects" value={formatInt(metrics.totalProjects)} />
        <AdminMetricCard label="Keywords" value={formatInt(metrics.totalKeywords)} />
        <AdminMetricCard label="Content generated" value={formatInt(metrics.totalContent)} />
        <AdminMetricCard
          label="AI requests"
          value={formatInt(metrics.aiRequests30d)}
          sub="30 days"
        />
        <AdminMetricCard
          label="Est. API cost"
          value={formatUsd(metrics.totalCostUsd30d)}
          sub={`API ${formatUsd(metrics.apiCostUsd30d)} · AI ${formatUsd(metrics.aiCostUsd30d)}`}
          tone="warning"
        />
        <AdminMetricCard
          label="Open errors"
          value={formatInt(metrics.openErrors)}
          sub={`${formatInt(metrics.errors30d)} in 30d`}
          tone={metrics.openErrors > 0 ? "critical" : "positive"}
        />
      </div>

      <SectionCard
        title="API usage by provider"
        subtitle="Fresh vs cached calls (30 days)"
        href="/admin/api-usage"
      >
        {providerUsage.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No API usage logged yet" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-secondary/50">
                  {["Provider", "Fresh", "Cached", "Hit rate", "Est. cost"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {providerUsage.map((p) => (
                  <tr
                    key={p.provider}
                    className="border-b border-border-subtle/60 last:border-0"
                  >
                    <td className="px-5 py-3 font-medium text-text-primary capitalize">
                      {p.provider}
                    </td>
                    <td className="px-5 py-3 text-text-secondary tabular-nums">
                      {formatInt(p.freshCalls)}
                    </td>
                    <td className="px-5 py-3 text-text-secondary tabular-nums">
                      {formatInt(p.cacheHits)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "tabular-nums",
                          p.cacheHitRatePct >= 50
                            ? "text-status-success"
                            : "text-text-secondary"
                        )}
                      >
                        {p.cacheHitRatePct}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-text-secondary tabular-nums">
                      {formatUsd(p.estimatedCostUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <SectionCard title="Recent projects" href="/admin/projects">
          <MiniTable
            headers={["Project", "Domain", "Created"]}
            emptyLabel="No projects yet"
            rows={recentProjects.map((p) => [
              <span key={p.id} className="font-medium text-text-primary">
                {p.name}
              </span>,
              <span key={`${p.id}-domain`} className="text-text-tertiary truncate max-w-[140px] block">
                {p.domain}
              </span>,
              <span key={`${p.id}-created`}>{formatDate(p.createdAt)}</span>,
            ])}
          />
        </SectionCard>

        <SectionCard title="Recent content" href="/admin/content">
          <MiniTable
            headers={["Title", "Type", "Created"]}
            emptyLabel="No content yet"
            rows={recentContent.map((c) => [
              <span key={c.id} className="line-clamp-2 text-text-primary">
                {c.title}
              </span>,
              <span key={`${c.id}-type`} className="capitalize text-text-tertiary">{c.contentType}</span>,
              <span key={`${c.id}-created`}>{formatDate(c.createdAt)}</span>,
            ])}
          />
        </SectionCard>

        <SectionCard title="Recent users" href="/admin/users">
          <MiniTable
            headers={["User ID", "Projects", "Last active"]}
            emptyLabel="No users yet"
            rows={recentUsers.map((u) => [
              <code key={u.userId} className="text-[11px] text-text-tertiary">
                {u.userId.slice(0, 12)}…
              </code>,
              <span key={`${u.userId}-projects`}>{formatInt(u.projectCount)}</span>,
              <span key={`${u.userId}-last-active`}>{u.lastActiveAt ? formatDate(u.lastActiveAt) : "—"}</span>,
            ])}
          />
        </SectionCard>

        <SectionCard title="Recent errors" href="/admin/errors">
          <MiniTable
            headers={["Feature", "Severity", "When"]}
            emptyLabel="No errors logged"
            rows={recentErrors.map((e) => [
              <span key={e.id} className="text-text-primary">
                {e.feature || e.provider || "—"}
              </span>,
              <span
                key={`${e.id}-severity`}
                className={cn(
                  "capitalize text-[12px] font-medium",
                  e.severity === "critical" || e.severity === "high"
                    ? "text-status-danger"
                    : "text-text-tertiary"
                )}
              >
                {e.severity}
              </span>,
              <span key={`${e.id}-created`}>{formatDate(e.createdAt)}</span>,
            ])}
          />
        </SectionCard>
      </div>
    </PageShell>
  );
}
