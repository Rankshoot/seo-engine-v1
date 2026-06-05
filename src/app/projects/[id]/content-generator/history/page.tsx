"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { Button, EmptyState, PageTitle } from "@/components/common";
import {
  ContentTypeBadge,
  StudioBreadcrumb,
} from "@/components/content-generator/shared";
import { TableSkeleton } from "@/components/Skeleton";
import { contentGeneratorApi, type ContentStudioHistoryRow } from "@/frontend/api/content-generator";
import { qk, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
import { CONTENT_TYPE_LABEL, CONTENT_TYPE_PLURAL, type ContentType } from "@/lib/types";
import { cn } from "@/lib/cn";

type SortKey = "updated" | "created" | "words" | "title";
type StatusFilter = "all" | "generated" | "approved" | "published";

const TYPE_FILTERS: ContentType[] = ["blog", "ebook", "whitepaper", "linkedin"];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusTone(status: string): string {
  if (status === "published") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  if (status === "approved") return "border-brand-action/30 bg-brand-action/10 text-brand-action";
  return "border-border-subtle bg-surface-secondary text-text-secondary";
}

export default function ContentHistoryPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const studioBase = `/projects/${projectId}/content-generator`;

  const [activeTypes, setActiveTypes] = useState<Set<ContentType>>(() => new Set(TYPE_FILTERS));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("updated");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: qk.contentStudioHistory(projectId),
    queryFn: () => contentGeneratorApi.studioHistory(projectId),
    enabled: !!projectId,
    ...DEFAULT_QUERY_OPTIONS,
  });

  const allRows: ContentStudioHistoryRow[] = useMemo(() => {
    return data?.success ? data.data : [];
  }, [data]);
  const counts = useMemo(() => {
    const map: Record<ContentType, number> = { blog: 0, ebook: 0, whitepaper: 0, linkedin: 0 };
    for (const r of allRows) map[r.content_type] = (map[r.content_type] ?? 0) + 1;
    return map;
  }, [allRows]);

  const visibleRows = useMemo(() => {
    let rows = allRows.filter(r => activeTypes.has(r.content_type));
    if (statusFilter !== "all") rows = rows.filter(r => r.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        r =>
          r.title.toLowerCase().includes(q) ||
          r.target_keyword.toLowerCase().includes(q) ||
          r.article_type.toLowerCase().includes(q),
      );
    }
    return [...rows].sort((a, b) => {
      switch (sort) {
        case "created":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "words":
          return b.word_count - a.word_count;
        case "title":
          return a.title.localeCompare(b.title);
        case "updated":
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });
  }, [allRows, activeTypes, statusFilter, search, sort]);

  const toggleType = (t: ContentType) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) {
        if (next.size === 1) return prev;
        next.delete(t);
      } else {
        next.add(t);
      }
      return next;
    });
  };

  const viewerHref = (row: ContentStudioHistoryRow): string => {
    if (row.content_type === "ebook") return `${studioBase}/ebooks/${row.id}`;
    if (row.content_type === "whitepaper") return `${studioBase}/whitepapers/${row.id}`;
    if (row.content_type === "linkedin") return `${studioBase}/linkedin/${row.id}`;
    return `/projects/${projectId}/blogs/${row.id}?from=content-history`;
  };

  return (
    <div className="space-y-8 pb-16 max-w-full px-4 mx-auto">
      <div className="border-b border-border-subtle pb-6 pt-4">
        <StudioBreadcrumb parentHref={studioBase} parentLabel="Content generator" current="Content history" />
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 max-w-3xl">
            <PageTitle>Content history</PageTitle>
            <p className="mt-3 text-[14px] leading-relaxed text-text-tertiary">
              Every blog, ebook, whitepaper, and LinkedIn post you&apos;ve generated. Filter by type, status,
              or sort by recency / word count to find what you need.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-text-tertiary">
            <span>
              <strong className="text-text-primary">{visibleRows.length}</strong>
              {" "}of {allRows.length} assets
            </span>
            <ProjectNavLink href={studioBase}>
              <Button variant="primary" size="md" shape="pill">
                New asset
              </Button>
            </ProjectNavLink>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border-subtle bg-surface-secondary p-1">
          {TYPE_FILTERS.map(t => {
            const active = activeTypes.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
                  active
                    ? "bg-text-primary text-surface-primary"
                    : "text-text-tertiary hover:text-text-primary",
                )}
              >
                {CONTENT_TYPE_PLURAL[t]}
                <span
                  className={cn(
                    "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                    active ? "bg-surface-primary/20 text-surface-primary" : "bg-surface-tertiary text-text-tertiary",
                  )}
                >
                  {counts[t]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border-subtle bg-surface-secondary p-1">
          {(["all", "generated", "approved", "published"] as StatusFilter[]).map(s => {
            const active = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] font-medium capitalize transition-colors",
                  active
                    ? "bg-text-primary text-surface-primary"
                    : "text-text-tertiary hover:text-text-primary",
                )}
              >
                {s}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search title, keyword, type…"
            className="h-9 w-[260px] rounded-full border border-border-subtle bg-surface-secondary px-4 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-brand-action focus:ring-1 focus:ring-brand-action/40"
          />
        </div>

        <div className="ml-auto flex items-center gap-2 text-[12px] text-text-tertiary">
          <span>Sort</span>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="h-9 rounded-full border border-border-subtle bg-surface-secondary px-3 text-[13px] text-text-primary outline-none"
          >
            <option value="updated">Recently updated</option>
            <option value="created">Recently created</option>
            <option value="words">Word count</option>
            <option value="title">Title</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
          <TableSkeleton rows={8} columns={6} />
        </div>
      ) : visibleRows.length === 0 ? (
        <EmptyState
          title={allRows.length === 0 ? "No content generated yet" : "No assets match these filters"}
          body={
            allRows.length === 0
              ? "Open a studio above and generate your first piece — it'll show up here automatically."
              : "Try widening your filters or clearing the search to see more assets."
          }
          action={
            <ProjectNavLink href={studioBase}>
              <Button variant="primary" size="md" shape="pill">
                Open content studio
              </Button>
            </ProjectNavLink>
          }
        />
      ) : (
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left border-collapse">
              <thead className="bg-surface-secondary text-[10px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                <tr>
                  <th className="px-3 py-3 w-12 text-center">#</th>
                  <th className="px-4 py-3 w-32">Type</th>
                  <th className="px-4 py-3 min-w-[14rem]">Title</th>
                  <th className="px-4 py-3 min-w-[10rem]">Primary keyword</th>
                  <th className="px-4 py-3 w-28">Status</th>
                  <th className="px-4 py-3 w-24 whitespace-nowrap">Words</th>
                  <th className="px-4 py-3 w-28 whitespace-nowrap">Updated</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap w-[1%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {visibleRows.map((row, i) => (
                  <tr key={row.id} className="hover:bg-surface-hover/50 transition-colors">
                    <td className="px-3 py-2.5 align-middle text-center text-[12px] font-mono text-text-tertiary tabular-nums">
                      {i + 1}
                    </td>
                    <td className="px-4 py-2.5 align-middle">
                      <ContentTypeBadge type={CONTENT_TYPE_LABEL[row.content_type]} />
                    </td>
                    <td className="px-4 py-2.5 align-middle min-w-0 max-w-[min(28rem,40vw)]">
                      <ProjectNavLink
                        href={viewerHref(row)}
                        className="block truncate text-[13px] font-medium text-text-primary hover:text-brand-action transition-colors"
                        title={row.title}
                      >
                        {row.title}
                      </ProjectNavLink>
                      {row.meta_description ? (
                        <p className="mt-0.5 truncate text-[11px] text-text-tertiary" title={row.meta_description}>
                          {row.meta_description}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 align-middle min-w-0 max-w-[min(20rem,30vw)]">
                      <p className="truncate text-[12px] text-text-secondary" title={row.target_keyword}>
                        {row.target_keyword || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 align-middle">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
                          statusTone(row.status),
                        )}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 align-middle text-[12px] tabular-nums text-text-secondary">
                      {row.word_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 align-middle text-[12px] text-text-tertiary whitespace-nowrap">
                      {fmtDate(row.updated_at)}
                    </td>
                    <td className="px-4 py-2.5 align-middle text-right">
                      <ProjectNavLink
                        href={viewerHref(row)}
                        className="inline-flex shrink-0 items-center justify-center rounded-full bg-text-primary px-4 py-1.5 text-[12px] font-medium text-surface-primary no-underline transition-opacity hover:opacity-90"
                      >
                        View
                      </ProjectNavLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
