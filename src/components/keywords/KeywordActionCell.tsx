import React, { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Button, Spinner } from "@/components/common";
import { ContentType, KeywordSourceType } from "@/lib/types";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { qk } from "@/lib/query";
import { keywordsApi } from "@/frontend/api/keywords";
import { useAppDispatch } from "@/lib/redux/hooks";
import { keywordStatusChanged, calendarKeywordScheduled } from "@/lib/redux/keyword-workspace-slice";

interface KeywordActionCellProps {
  projectId: string;
  keyword: string;
  keywordId?: string;
  sourceType: KeywordSourceType;
  contentType: ContentType;
  scheduledDate?: string;
  blogId?: string;
  // Competitor keyword fields:
  volume?: number;
  kd?: number;
  cpc?: number;
  intent?: string;
  competitorDomain?: string;
  rankingUrl?: string;
  rank?: number;
  onScheduleSuccess?: (res: {
    success: boolean;
    keywordStatus: string;
    keyword: unknown;
    calendarEntry: unknown;
  }) => void;
}

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export const KeywordActionCell = React.memo(function KeywordActionCell({
  projectId,
  keyword,
  keywordId,
  sourceType,
  contentType,
  scheduledDate,
  blogId,
  volume,
  kd,
  cpc,
  intent,
  competitorDomain,
  rankingUrl,
  rank,
  onScheduleSuccess,
}: KeywordActionCellProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();

  const handleGenerate = useCallback(() => {
    // Navigate to the respective generator page with autofill params
    // shouldSchedule=false indicates this is a generate-only action, not a schedule action
    const slug = contentType === "blog" ? "blogs" : contentType === "linkedin" ? "linkedin" : `${contentType}s`;
    const params = new URLSearchParams({ keyword, source: sourceType, shouldSchedule: "false" });
    router.push(`/projects/${projectId}/content-generator/${slug}?${params.toString()}`);
  }, [contentType, keyword, sourceType, projectId, router]);

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      const activeKeywordId = keywordId || "new";
      return keywordsApi.schedule(projectId, activeKeywordId, {
        contentType,
        keyword,
        volume,
        kd,
        cpc,
        intent,
        source: sourceType === "competitor_gap" ? "competitor" : "organic",
        competitorDomain,
        rankingUrl,
        rank,
      });
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success(`Keyword scheduled`);

        // Move status to Approved in Redux immediately so counts/tabs update immediately
        const resolvedId = res.keywordId || keywordId;
        if (resolvedId && sourceType !== "competitor_gap") {
          dispatch(
            keywordStatusChanged({
              projectId,
              keywordId: resolvedId,
              previousStatus: "pending",
              nextStatus: "approved",
            })
          );
        }

        // Optimistically record calendar scheduling state in Redux
        if (resolvedId && res.scheduledDate) {
          dispatch(
            calendarKeywordScheduled({
              projectId,
              keywordId: resolvedId,
              date: res.scheduledDate,
              status: "scheduled",
            })
          );
        }

        // Optimistically add the new calendar entry to the React Query cache
        if (res.calendarEntry) {
          const ENTRIES_KEY = qk.calendarWithBlogs(projectId);
          queryClient.setQueryData(ENTRIES_KEY, (prev: unknown) => {
            if (!prev || typeof prev !== "object" || !("success" in prev)) return prev;
            const p = prev as { success: boolean; data: { id: string; blog?: unknown }[] };
            if (!p.success) return prev;
            const filtered = p.data.filter(e => e.id !== res.calendarEntry.id);
            const blogStub = blogId
              ? { id: blogId, entry_id: res.calendarEntry.id, title: "", status: "generated", word_count: 0 }
              : null;
            return {
              ...p,
              data: [...filtered, { ...res.calendarEntry, blog: blogStub }]
            };
          });
        }

        if (onScheduleSuccess) {
          onScheduleSuccess(res as Parameters<Required<KeywordActionCellProps>["onScheduleSuccess"]>[0]);
        }

        // Invalidate queries in background to sync fully
        if (sourceType === "competitor_gap") {
          void queryClient.invalidateQueries({ queryKey: qk.competitors(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        } else {
          void queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.domainKeywords(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) });
        }
      } else {
        if (res.error === "Keyword already scheduled") {
          toast.error("Keyword already scheduled");
        } else {
          toast.error(res.error || "Failed to schedule");
        }
      }
    },
    onError: (err) => {
      console.error("[scheduleMutation error]", err);
      toast.error(err instanceof Error ? err.message : "Failed to schedule");
    },
  });

  return (
    <div className="flex items-center justify-center gap-1.5">
      {blogId ? (
        <Button
          variant="outline"
          size="sm"
          className="px-2.5 text-[10px] h-7 rounded-full border border-border-subtle bg-surface-elevated text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-all whitespace-nowrap flex items-center justify-center"
          onClick={() => router.push(`/projects/${projectId}/blogs/${blogId}`)}
          aria-label={`View blog post for "${keyword}"`}
        >
          View
        </Button>
      ) : (
        <Button
          variant="primary"
          size="sm"
          className="px-2.5 text-[10px] h-7 rounded-full shadow-sm transition-all whitespace-nowrap flex items-center justify-center"
          onClick={handleGenerate}
          aria-label={`Generate content for "${keyword}"`}
        >
          Generate
        </Button>
      )}

      {scheduledDate ? (
        <span
          className="px-2.5 h-7 text-[10px] font-semibold text-text-tertiary bg-surface-secondary border border-border-subtle rounded-full whitespace-nowrap flex items-center justify-center gap-1"
          title={`Scheduled date: ${scheduledDate}`}
          aria-label={`Scheduled for ${fmtDate(scheduledDate)}`}
        >
          🗓 {fmtDate(scheduledDate)}
        </span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="px-2.5 text-[10px] h-7 rounded-full border border-border-subtle bg-surface-elevated text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-all whitespace-nowrap flex items-center justify-center"
          onClick={() => scheduleMutation.mutate()}
          disabled={scheduleMutation.isPending}
          aria-label={`Schedule "${keyword}" to content calendar`}
        >
          {scheduleMutation.isPending ? (
            <Spinner size={10} />
          ) : (
            "Schedule"
          )}
        </Button>
      )}
    </div>
  );
});
