"use client";

/**
 * Client component — owns the full Ahrefs Site Explorer data lifecycle.
 *
 * Data flow (once per session, no timer):
 *   1. On first render React Query calls `getProjectSiteExplorerSnapshot`.
 *      The server action checks Supabase first; it only hits the Ahrefs API
 *      when NO cached row exists for this project (first-ever visit).
 *   2. The response is stored in React Query with `staleTime: Infinity` and
 *      `refetchOnMount: false`. Navigating away and back never triggers a new
 *      network call — the cache is served instantly.
 *   3. The user can manually click "Refresh data" to force an Ahrefs API call,
 *      update the Supabase row, and refresh the in-memory cache.
 *   4. There is NO automatic/timer-based refetch.
 */

import * as React from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getProjectSiteExplorerSnapshot,
  refreshProjectSiteExplorerSnapshot,
  type ProjectSiteExplorerData,
  type SiteExplorerTraceEntry,
} from "@/app/actions/project-actions";
import {
  ahrefsCentsToDollars,
  ahrefsCompetitorOrganicTotal,
  ahrefsTargetOrganicTotal,
  type AhrefsCompetitor,
  type AhrefsDomainOverview,
  type AhrefsTopPage,
} from "@/lib/ahrefs";
import { qk } from "@/lib/query-keys";

// ─── helpers ────────────────────────────────────────────────────────────────

function compactInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const v = Math.round(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${Math.round(v / 1_000)}K`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("en-US").format(v);
}

function formatUsdFromCents(cents: number | null | undefined): string {
  const d = ahrefsCentsToDollars(cents);
  if (d === null) return "—";
  if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(2)}M`;
  if (d >= 1_000) return `$${(d / 1_000).toFixed(1)}K`;
  return `$${d.toFixed(0)}`;
}

function formatShare(share: number | null | undefined): string {
  if (share == null || !Number.isFinite(share)) return "—";
  return `${Number(share).toFixed(1)}%`;
}

function formatLastUpdated(iso: string | null): string {
  if (!iso) return "Never refreshed";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

// ─── sub-components (mirror server-component versions) ──────────────────────

function KeywordOverlapBar({ row }: { row: AhrefsCompetitor }) {
  const kt = Math.max(0, row.keywords_target);
  const kc = Math.max(0, row.keywords_common);
  const kcomp = Math.max(0, row.keywords_competitor);
  const sum = kt + kc + kcomp;
  if (sum <= 0) {
    return <div className="h-1.5 w-[140px] rounded-full bg-surface-tertiary" title="No overlap breakdown" />;
  }
  return (
    <div className="flex h-1.5 w-[140px] overflow-hidden rounded-full bg-surface-tertiary" title="You only | Common | Competitor only">
      <div className="h-full shrink-0 bg-brand-action" style={{ width: `${(kt / sum) * 100}%` }} />
      <div className="h-full shrink-0 bg-violet-500" style={{ width: `${(kc / sum) * 100}%` }} />
      <div className="h-full shrink-0 bg-amber-500" style={{ width: `${(kcomp / sum) * 100}%` }} />
    </div>
  );
}

function MetricsBar({ overview }: { overview: AhrefsDomainOverview | null }) {
  const items = [
    {
      label: "Domain Rating",
      value: overview?.domain_rating != null ? String(Math.round(overview.domain_rating)) : "—",
      hint: "Ahrefs authority score",
    },
    {
      label: "Organic Traffic (Est.)",
      value: compactInt(overview?.organic_traffic ?? null),
      hint: "Monthly organic visits",
    },
    {
      label: "Organic Keywords",
      value: compactInt(overview?.organic_keywords ?? null),
      hint: "Ranking in organic results",
    },
    {
      label: "Referring Domains",
      value: compactInt(overview?.refdomains ?? null),
      hint: "Unique sites linking to you",
    },
  ];

  const borders = [
    "border-r border-b border-border-subtle lg:border-b-0",
    "border-b border-border-subtle lg:border-b-0 lg:border-r",
    "border-r border-border-subtle",
    "",
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
      {items.map((item, i) => (
        <div key={item.label} className={`p-5 ${borders[i]} flex flex-col justify-center`}>
          <p className="text-[12px] font-bold uppercase tracking-widest text-text-tertiary mb-1.5">{item.label}</p>
          <p className="font-mono text-2xl font-bold tracking-tight text-text-primary">{item.value}</p>
          <p className="mt-1 text-[13px] text-text-tertiary">{item.hint}</p>
        </div>
      ))}
    </div>
  );
}

function OrganicCompetitorsTable({
  competitors,
  target,
  projectId,
}: {
  competitors: AhrefsCompetitor[];
  target: string;
  projectId: string;
}) {
  if (!competitors.length) {
    return (
      <p className="rounded-xl border border-border-subtle bg-surface-elevated p-8 text-center text-[16px] text-text-tertiary">
        No organic competitor overlap returned for{" "}
        <span className="font-mono text-text-secondary">{target}</span>. Try a verified domain or a
        different target region.
      </p>
    );
  }

  return (
    <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-secondary text-[12px] font-bold uppercase tracking-widest text-text-tertiary">
              <th className="p-4">Competitor Domain</th>
              <th className="p-4">Keyword Overlap</th>
              <th className="p-4 text-right">Comp. Keywords</th>
              <th className="p-4 text-right">Common</th>
              <th className="p-4 text-right">Share</th>
              <th className="p-4 text-right">Your Keywords</th>
              <th className="p-4 text-right">DR</th>
              <th className="p-4 text-right">Traffic</th>
              <th className="p-4 text-right">Value</th>
              <th className="p-4 text-right">Pages</th>
            </tr>
          </thead>
          <tbody>
            {competitors.map(row => {
              const compTotal = ahrefsCompetitorOrganicTotal(row);
              const targetTotal = ahrefsTargetOrganicTotal(row);
              return (
                <tr key={row.competitor_domain} className="border-b border-border-subtle/60 last:border-0 hover:bg-surface-hover transition-colors">
                  <td className="p-4">
                    <a
                      href={`https://${row.competitor_domain.replace(/^www\./, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[14px] text-brand-action hover:underline"
                    >
                      {row.competitor_domain}
                    </a>
                  </td>
                  <td className="p-4"><KeywordOverlapBar row={row} /></td>
                  <td className="p-4 text-right font-mono text-[14px] text-text-secondary">{new Intl.NumberFormat("en-US").format(compTotal)}</td>
                  <td className="p-4 text-right font-mono text-[14px] text-text-secondary">{new Intl.NumberFormat("en-US").format(row.keywords_common)}</td>
                  <td className="p-4 text-right font-mono text-[14px] text-text-tertiary">{formatShare(row.share)}</td>
                  <td className="p-4 text-right font-mono text-[14px] text-text-tertiary">{new Intl.NumberFormat("en-US").format(targetTotal)}</td>
                  <td className="p-4 text-right font-mono text-[14px] text-text-secondary">
                    {row.domain_rating != null ? Math.round(row.domain_rating) : "—"}
                  </td>
                  <td className="p-4 text-right font-mono text-[14px] text-text-tertiary">{compactInt(row.traffic)}</td>
                  <td className="p-4 text-right font-mono text-[14px] text-text-tertiary">{formatUsdFromCents(row.value)}</td>
                  <td className="p-4 text-right font-mono text-[14px] text-text-tertiary">{row.pages != null ? compactInt(row.pages) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-surface-secondary p-4">
        <p className="text-[12px] text-text-tertiary">
          Ahrefs Site Explorer · domain scope · Share as returned by API
        </p>
        <Link href={`/projects/${projectId}/competitors`} className="text-[14px] font-medium text-brand-action hover:underline">
          Full competitor workspace →
        </Link>
      </div>
    </div>
  );
}

function TopPagesTable({ pages, projectId }: { pages: AhrefsTopPage[]; projectId: string }) {
  if (!pages.length) {
    return <p className="text-[16px] text-text-tertiary">No top pages returned yet for this domain in Ahrefs.</p>;
  }
  return (
    <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-secondary text-[12px] font-bold uppercase tracking-widest text-text-tertiary">
              <th className="p-4">URL</th>
              <th className="p-4">Top Keyword</th>
              <th className="p-4 text-right">Pos.</th>
              <th className="p-4 text-right">Traffic</th>
              <th className="p-4 text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {pages.map(p => (
              <tr key={p.url} className="border-b border-border-subtle/60 last:border-0 hover:bg-surface-hover transition-colors">
                <td className="max-w-[300px] p-4">
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="line-clamp-1 font-mono text-[14px] text-brand-action hover:underline">
                    {p.url}
                  </a>
                </td>
                <td className="p-4 text-[14px] text-text-secondary">{p.top_keyword ?? "—"}</td>
                <td className="p-4 text-right font-mono text-[14px] text-text-secondary">
                  {p.top_keyword_best_position != null ? `#${p.top_keyword_best_position}` : "—"}
                </td>
                <td className="p-4 text-right font-mono text-[14px] text-text-tertiary">{compactInt(p.sum_traffic)}</td>
                <td className="p-4 text-right font-mono text-[14px] text-text-tertiary">{formatUsdFromCents(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border-subtle bg-surface-secondary p-4 text-right">
        <Link href={`/projects/${projectId}/keywords`} className="text-[14px] font-medium text-brand-action hover:underline">
          Keyword opportunities →
        </Link>
      </div>
    </div>
  );
}

// ─── public component ───────────────────────────────────────────────────────

type SnapshotResponse = Awaited<ReturnType<typeof getProjectSiteExplorerSnapshot>>;
type RefreshResponse = Awaited<ReturnType<typeof refreshProjectSiteExplorerSnapshot>>;

export interface SiteExplorerSectionProps {
  projectId: string;
}

export function SiteExplorerSection({ projectId }: SiteExplorerSectionProps) {
  const queryClient = useQueryClient();
  const [justRefreshed, setJustRefreshed] = React.useState(false);

  // Fetch once and cache forever. Rules:
  //   • staleTime: Infinity → data never goes stale automatically (no timer)
  //   • refetchOnMount: false → navigating away and back uses the cache
  //   • refetchOnWindowFocus: false → alt-tabbing doesn't trigger a call
  //   • Only invalidateQueries() (from the manual Refresh button) breaks the cache
  const { data: snapData, isLoading } = useQuery<SnapshotResponse>({
    queryKey: qk.siteExplorer(projectId),
    queryFn: () => getProjectSiteExplorerSnapshot(projectId),
    enabled: !!projectId,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  const snapshot: ProjectSiteExplorerData | null =
    snapData?.success && snapData.data ? snapData.data : null;

  const refreshMutation = useMutation<RefreshResponse>({
    mutationFn: async () => refreshProjectSiteExplorerSnapshot(projectId),
    onSuccess: res => {
      if (res.trace?.length) {
        console.groupCollapsed(
          `[Site Explorer] Manual refresh — ${res.success ? "ok" : "failed"}`
        );
        for (const t of res.trace) console.log(t.step, { ok: t.ok, detail: t.detail });
        console.groupEnd();
      }
      if (res.success && res.data) {
        // Update the snapshot in the React Query cache so the UI shows fresh data.
        queryClient.setQueryData<SnapshotResponse>(qk.siteExplorer(projectId), {
          success: true,
          data: res.data,
          trace: res.trace ?? [],
        });
        setJustRefreshed(true);
      }
    },
  });

  const refreshing = refreshMutation.isPending;
  const refreshError =
    refreshMutation.data && !refreshMutation.data.success
      ? refreshMutation.data.error
      : refreshMutation.error instanceof Error
        ? refreshMutation.error.message
        : "";

  if (isLoading || !snapshot) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-[8px] bg-surface-elevated" />
        <div className="grid grid-cols-2 lg:grid-cols-4 rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-5 border-r last:border-r-0 border-border-subtle">
              <div className="h-3 w-24 animate-pulse rounded bg-surface-secondary mb-3" />
              <div className="h-7 w-20 animate-pulse rounded bg-surface-secondary" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { ahrefsConfigured, target, overview, competitors, topPages, lastFetchedAt } = snapshot;
  const lastUpdatedLabel = formatLastUpdated(lastFetchedAt);

  return (
    <div className="space-y-10">
      {/* ── METRICS BAR + REFRESH HEADER ─────────────────────────────────── */}
      {!ahrefsConfigured ? (
        <div className="rounded-[16px] border border-border-subtle bg-surface-secondary p-6">
          <p className="text-[16px] font-medium text-text-primary">Ahrefs not configured</p>
          <p className="mt-2 text-[14px] text-text-tertiary">
            Add <code className="font-mono text-[13px] text-text-secondary">AHREFS_API_KEY</code> to your environment to load domain metrics here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-widest text-text-tertiary">
                Site Explorer · Ahrefs
              </p>
              <p className="mt-1 text-[13px] text-text-tertiary" title={lastFetchedAt ?? undefined}>
                Last updated <span className="text-text-secondary">{lastUpdatedLabel}</span>
                {justRefreshed && <span className="ml-2 text-[#10b981]">· just refreshed</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshing}
              title="Re-fetch domain overview, organic competitors and top pages from Ahrefs. Uses Ahrefs API credits."
              className="inline-flex items-center gap-2 rounded-[30px] border border-border-subtle bg-surface-elevated px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-60"
            >
              {refreshing ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-text-tertiary border-t-text-primary" />
                  Refreshing…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Refresh data
                </>
              )}
            </button>
          </div>
          {refreshError && (
            <p className="rounded-[8px] border border-brand-coral/30 bg-brand-coral/10 px-3 py-2 text-[13px] text-brand-coral">
              {refreshError}
            </p>
          )}
          <MetricsBar overview={overview} />
          <p className="text-[13px] text-text-tertiary">
            Third-party estimates from Ahrefs Site Explorer. May differ from Google Search Console.
          </p>
        </div>
      )}

      {/* ── ORGANIC COMPETITORS + TOP PAGES ──────────────────────────────── */}
      {ahrefsConfigured && target && (
        <>
          <section className="space-y-4">
            <div>
              <h2 className="text-[28px] font-normal tracking-[-0.28px] text-text-primary font-display">Organic competitors</h2>
              <p className="mt-1.5 text-[14px] text-text-tertiary">
                Domains that rank for many of the same keywords as{" "}
                <span className="font-mono text-text-secondary">{target}</span> (Ahrefs overlap index).
              </p>
            </div>
            <OrganicCompetitorsTable competitors={competitors} target={target} projectId={projectId} />
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-[28px] font-normal tracking-[-0.28px] text-text-primary font-display">Top pages by traffic</h2>
              <p className="mt-1.5 text-[14px] text-text-tertiary">Highest-impact URLs on your domain for this region.</p>
            </div>
            <TopPagesTable pages={topPages} projectId={projectId} />
          </section>
        </>
      )}
    </div>
  );
}

