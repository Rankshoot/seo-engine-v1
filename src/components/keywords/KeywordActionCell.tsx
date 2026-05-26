import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Select, Button, Spinner } from "@/components/common";
import { CONTENT_TYPES, ContentType, CONTENT_TYPE_LABEL, KeywordSourceType } from "@/lib/types";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { qk } from "@/lib/query";
import { keywordsApi } from "@/frontend/api/keywords";
import { useAppDispatch } from "@/lib/redux/hooks";
import { keywordStatusChanged } from "@/lib/redux/keyword-workspace-slice";

interface KeywordActionCellProps {
  projectId: string;
  keyword: string;
  keywordId?: string;
  sourceType: KeywordSourceType;
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
    keyword: any;
    calendarEntry: any;
  }) => void;
}

export function KeywordActionCell({
  projectId,
  keyword,
  keywordId,
  sourceType,
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
  const [contentType, setContentType] = useState<ContentType>("blog");

  const handleGenerate = () => {
    // Navigate to the respective generator page with autofill params
    const slug = contentType === "blog" ? "blogs" : contentType === "linkedin" ? "linkedin" : `${contentType}s`;
    const params = new URLSearchParams({ keyword, source: sourceType });
    router.push(`/projects/${projectId}/content-generator/${slug}?${params.toString()}`);
  };

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

        if (onScheduleSuccess) {
          onScheduleSuccess(res as any);
        }

        // Invalidate queries to sync with the server database correctly based on tab source
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
    <div className="flex items-center gap-2">
      <Select
        value={contentType}
        onChange={(e) => setContentType(e.target.value as ContentType)}
        className="w-32 py-1 text-xs"
      >
        {CONTENT_TYPES.map(type => (
          <option key={type} value={type}>{CONTENT_TYPE_LABEL[type]}</option>
        ))}
      </Select>
      <div className="flex flex-col gap-1 sm:flex-row">
        <Button
          variant="primary"
          size="sm"
          className="text-[11px] px-2 py-1 h-auto min-h-0"
          onClick={handleGenerate}
        >
          Generate
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-[11px] px-2 py-1 h-auto min-h-0"
          onClick={() => scheduleMutation.mutate()}
          disabled={scheduleMutation.isPending}
        >
          {scheduleMutation.isPending ? <Spinner size={12} /> : "Schedule"}
        </Button>
      </div>
    </div>
  );
}
