"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query";
import { contentGeneratorApi, type ContentGeneratorHistoryRow } from "@/frontend/api/content-generator";
import { blogsApi } from "@/frontend/api/blogs";
import { BlogStatus } from "@/lib/types";
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

export default function ContentGeneratorHistoryPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();

  const HISTORY_KEY = qk.contentGeneratorHistory(projectId);
  const STATS_KEY = qk.projectStats(projectId);

  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});

  const { data: historyData, isLoading: loading } = useQuery({
    queryKey: HISTORY_KEY,
    queryFn: () => contentGeneratorApi.history(projectId),
    enabled: !!projectId,
    staleTime: 0,
    gcTime: 30 * 60_000,
    refetchOnMount: "always",
  });

  const rows: ContentGeneratorHistoryRow[] = historyData?.success ? historyData.data : [];
  const loadError = historyData && !historyData.success ? historyData.error : null;

  const patchRows = (mutator: (list: ContentGeneratorHistoryRow[]) => ContentGeneratorHistoryRow[]) => {
    queryClient.setQueryData(HISTORY_KEY, (prev: Awaited<ReturnType<typeof contentGeneratorApi.history>> | undefined) => {
      if (!prev?.success) return prev;
      return { ...prev, data: mutator(prev.data) };
    });
  };

  const handleStatusChange = async (blogId: string, status: BlogStatus) => {
    setSavingStatus(blogId);
    setError((prev) => ({ ...prev, [blogId]: "" }));
    const previous = queryClient.getQueryData<Awaited<ReturnType<typeof contentGeneratorApi.history>>>(HISTORY_KEY);
    patchRows((list) => list.map((r) => (r.id === blogId ? { ...r, status } : r)));

    const res = await blogsApi.updateStatus(blogId, status);
    if (!res.success) {
      if (previous) queryClient.setQueryData(HISTORY_KEY, previous);
      setError((prev) => ({ ...prev, [blogId]: res.error ?? "Could not update status" }));
    } else {
      dispatch(calendarRefreshBump({ projectId }));
      void queryClient.invalidateQueries({ queryKey: STATS_KEY });
      void queryClient.invalidateQueries({ queryKey: qk.articlesLibrary(projectId) });
    }
    setSavingStatus(null);
  };

  return (
    <div className="space-y-8 pb-16 max-w-full px-4 mx-auto">
      <div className="pt-4 pb-6 border-b border-border-subtle flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <PageTitle>Content history</PageTitle>
          <p className="mt-3 text-[15px] text-text-tertiary max-w-[520px]">
            Instant articles you generate from this project. Open a row to edit, export, add to the Articles library, or run SEO fixes
            — same workflow as calendar blogs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {rows.length > 0 && (
            <span className="text-[13px] text-text-tertiary">
              <span className="font-semibold text-text-primary">{rows.length}</span> generated
            </span>
          )}
          <ProjectNavLink
            href={`/projects/${projectId}/content-generator/instant`}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-text-primary px-6 text-[14px] font-medium text-surface-primary no-underline transition-opacity hover:opacity-90"
          >
            New instant article
          </ProjectNavLink>
        </div>
      </div>

      {loadError && (
        <div className="rounded-[12px] border border-border-subtle bg-surface-secondary px-4 py-3 text-[13px] text-brand-coral">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
          <TableSkeleton rows={8} columns={8} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No instant articles yet"
          body="Generate one from Instant Article. Finished drafts appear here automatically."
          action={
            <ProjectNavLink
              href={`/projects/${projectId}/content-generator/instant`}
              className="inline-flex h-10 items-center justify-center rounded-full bg-brand-primary px-5 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90"
            >
              Instant article
            </ProjectNavLink>
          }
        />
      ) : (
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left border-collapse">
              <thead className="bg-surface-secondary text-[10px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                <tr>
                  <th className="px-3 py-3 w-12 text-center">#</th>
                  <th className="px-4 py-3 w-28 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 min-w-[10rem] lg:min-w-[12rem]">Keyword</th>
                  <th className="px-4 py-3 min-w-[12rem] lg:min-w-[16rem]">Title</th>
                  <th className="px-4 py-3 w-24">Type</th>
                  <th className="px-4 py-3 w-36">Status</th>
                  <th className="px-4 py-3 w-28 whitespace-nowrap">Articles</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap w-[1%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((row, i) => {
                  const blogStatus = asBlogStatus(row.status);
                  const inLib = Boolean(row.in_articles_library);
                  return (
                    <tr key={row.id} className="hover:bg-surface-hover/50 transition-colors">
                      <td className="px-3 py-2.5 align-middle text-center text-[12px] font-mono text-text-tertiary tabular-nums">
                        {i + 1}
                      </td>
                      <td className="px-4 py-2.5 align-middle tabular-nums text-[12px] text-text-primary whitespace-nowrap">
                        {fmtDate(row.created_at)}
                      </td>
                      <td className="px-4 py-2.5 align-middle min-w-0 max-w-[min(20rem,32vw)]">
                        <p className="truncate text-[13px] font-medium text-text-primary" title={row.target_keyword}>
                          {row.target_keyword || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 align-middle min-w-0 max-w-[min(28rem,40vw)]">
                        <p className="truncate text-[13px] text-text-secondary" title={row.title}>
                          {row.title}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 align-middle text-[11px] text-text-tertiary whitespace-nowrap">
                        {row.article_type?.replace(/^Instant ·\s*/i, "") || "—"}
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <select
                          value={blogStatus}
                          onChange={(e) => void handleStatusChange(row.id, e.target.value as BlogStatus)}
                          disabled={savingStatus === row.id}
                          className="max-w-[10rem] rounded-full border border-border-subtle bg-surface-secondary px-3 py-1.5 text-[12px] text-text-primary outline-none transition-colors hover:bg-surface-hover disabled:opacity-50"
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
                      <td className="px-4 py-2.5 align-middle text-[11px] text-text-tertiary whitespace-nowrap">
                        {inLib ? (
                          <span className="text-[#10b981]">In library</span>
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 align-middle text-right">
                        <ProjectNavLink
                          href={`/projects/${projectId}/blogs/${row.id}`}
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
