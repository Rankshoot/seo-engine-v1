"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query";
import { articlesApi } from "@/frontend/api/articles";
import { blogsApi } from "@/frontend/api/blogs";
import { BlogStatus, type ArticleLibraryEntry } from "@/lib/types";
import { useAppDispatch } from "@/lib/redux/hooks";
import { calendarRefreshBump } from "@/lib/redux/keyword-workspace-slice";
import { TableSkeleton } from "@/components/Skeleton";
import { PageTitle, EmptyState } from "@/components/common";

const BLOG_STATUSES: Array<{ value: BlogStatus; label: string }> = [
  { value: "generated", label: "Generated" },
  { value: "approved", label: "Approved" },
  { value: "published", label: "Published" },
];

function asBlogStatus(status: string | undefined): BlogStatus {
  return status === "approved" || status === "published" ? status : "generated";
}

function fmtDate(iso: string): string {
  const d = iso.includes("T") ? iso : `${iso}T00:00:00`;
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ArticlesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();

  const LIB_KEY = qk.articlesLibrary(projectId);
  const STATS_KEY = qk.projectStats(projectId);

  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});

  const { data: libData, isLoading: loading } = useQuery({
    queryKey: LIB_KEY,
    queryFn: () => articlesApi.library(projectId),
    enabled: !!projectId,
    staleTime: 0,
    gcTime: 30 * 60_000,
    refetchOnMount: "always",
  });

  const rows: ArticleLibraryEntry[] = libData?.success ? libData.data : [];

  const patchRows = (mutator: (list: ArticleLibraryEntry[]) => ArticleLibraryEntry[]) => {
    queryClient.setQueryData(LIB_KEY, (prev: Awaited<ReturnType<typeof articlesApi.library>> | undefined) => {
      if (!prev?.success) return prev;
      return { ...prev, data: mutator(prev.data) };
    });
  };

  const handleStatusChange = async (blogId: string, status: BlogStatus) => {
    setSavingStatus(blogId);
    setError((prev) => ({ ...prev, [blogId]: "" }));
    const previous = queryClient.getQueryData<Awaited<ReturnType<typeof articlesApi.library>>>(LIB_KEY);
    patchRows((list) => list.map((r) => (r.id === blogId ? { ...r, status } : r)));

    const res = await blogsApi.updateStatus(blogId, status);
    if (!res.success) {
      if (previous) queryClient.setQueryData(LIB_KEY, previous);
      setError((prev) => ({ ...prev, [blogId]: res.error ?? "Could not update status" }));
    } else {
      dispatch(calendarRefreshBump({ projectId }));
      void queryClient.invalidateQueries({ queryKey: STATS_KEY });
    }
    setSavingStatus(null);
  };

  return (
    <div className="space-y-8 pb-16 max-w-full px-4 mx-auto">
      <div className="pt-4 pb-6 border-b border-border-subtle flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <PageTitle>Articles</PageTitle>
          <p className="mt-3 text-[15px] text-text-tertiary max-w-[520px]">
            Articles you add from the content viewer appear here. Open any row to preview, edit, export, and run SEO fixes — same
            experience as calendar blogs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {rows.length > 0 && (
            <span className="text-[13px] text-text-tertiary">
              <span className="font-semibold text-text-primary">{rows.length}</span> saved
            </span>
          )}
          <ProjectNavLink
            href={`/projects/${projectId}/content-generator`}
            className="inline-flex h-10 items-center gap-2 rounded-[30px] border border-border-subtle bg-surface-elevated px-5 text-[14px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            Content generator
          </ProjectNavLink>
        </div>
      </div>

      {loading ? (
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
          <TableSkeleton rows={8} columns={7} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No saved articles yet"
          body={
            <>
              When you finish generating an article, open it and choose &quot;Add this article&quot; next to the link summary. It will show up in this table.
            </>
          }
          action={
            <ProjectNavLink
              href={`/projects/${projectId}/content-generator/blogs`}
              className="inline-flex h-10 items-center justify-center rounded-full bg-brand-primary px-5 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90"
            >
              Blogs
            </ProjectNavLink>
          }
        />
      ) : (
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-secondary text-[10px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                <tr>
                  <th className="px-3 py-3 w-12 text-center">#</th>
                  <th className="px-4 py-3 w-28">Date</th>
                  <th className="px-4 py-3 min-w-[8rem]">Keyword</th>
                  <th className="px-4 py-3 min-w-[12rem]">Title</th>
                  <th className="px-4 py-3 w-24">Type</th>
                  <th className="px-4 py-3 w-36">Status</th>
                  <th className="px-4 py-3 text-right pr-4 w-[8.5rem]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/60">
                {rows.map((row, i) => {
                  const blogStatus = asBlogStatus(row.status);
                  return (
                    <tr key={row.id} className="hover:bg-surface-hover/50 transition-colors">
                      <td className="px-3 py-2.5 align-middle text-center text-[12px] font-mono text-text-tertiary tabular-nums">
                        {i + 1}
                      </td>
                      <td className="px-4 py-2.5 align-middle tabular-nums text-[12px] text-text-primary whitespace-nowrap">
                        {fmtDate(row.created_at)}
                      </td>
                      <td className="px-4 py-2.5 align-middle max-w-[11rem]">
                        <p className="truncate text-[13px] font-medium text-text-primary" title={row.target_keyword}>
                          {row.target_keyword || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 align-middle max-w-[18rem]">
                        <p className="truncate text-[13px] text-text-secondary" title={row.title}>
                          {row.title}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 align-middle text-[11px] text-text-tertiary whitespace-nowrap">
                        {row.article_type || "—"}
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <select
                          value={blogStatus}
                          onChange={(e) => void handleStatusChange(row.id, e.target.value as BlogStatus)}
                          disabled={savingStatus === row.id}
                          className="max-w-[9.5rem] rounded-md border border-border-subtle bg-surface-secondary px-2 py-1 text-[11px] text-text-primary outline-none disabled:opacity-50"
                        >
                          {BLOG_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                        {error[row.id] && (
                          <p className="mt-1 text-[10px] text-brand-coral max-w-[9rem] leading-tight">{error[row.id]}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 align-middle text-right">
                        <ProjectNavLink
                          href={`/projects/${projectId}/content-generator/blogs/${row.id}`}
                          className="inline-flex shrink-0 items-center justify-center rounded-full bg-text-primary px-4 py-2 text-[13px] font-medium text-surface-primary no-underline transition-opacity hover:opacity-90"
                        >
                          View article
                        </ProjectNavLink>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
