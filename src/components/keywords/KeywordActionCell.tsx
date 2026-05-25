import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Select, Button, Spinner } from "@/components/common";
import { CONTENT_TYPES, ContentType, CONTENT_TYPE_LABEL, KeywordSourceType } from "@/lib/types";
import { calendarApi } from "@/frontend/api/calendar";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query";

interface KeywordActionCellProps {
  projectId: string;
  keyword: string;
  keywordId?: string;
  sourceType: KeywordSourceType;
}

export function KeywordActionCell({ projectId, keyword, keywordId, sourceType }: KeywordActionCellProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [contentType, setContentType] = useState<ContentType>("blog");
  const [isScheduling, setIsScheduling] = useState(false);

  const handleGenerate = () => {
    // Navigate to the respective generator page with autofill params
    const slug = contentType === "blog" ? "blogs" : contentType === "linkedin" ? "linkedin" : `${contentType}s`;
    const params = new URLSearchParams({ keyword, source: sourceType });
    router.push(`/projects/${projectId}/content-generator/${slug}?${params.toString()}`);
  };

  const handleSchedule = async () => {
    setIsScheduling(true);
    try {
      // Schedule for today (or next available slot logic if calendarApi supports it)
      // Usually, calendarApi.create takes the details.
      // We will assume `calendarApi.create` exists or similar.
      // Let's use a standard API call. We might need to check calendarApi definition.
      // For now, we will hit the backend to schedule.
      
      const res = await fetch(`/api/v1/projects/${projectId}/calendar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword_id: keywordId,
          title: `[Draft] ${keyword}`,
          article_type: contentType,
          focus_keyword: keyword,
          scheduled_date: new Date().toISOString().split("T")[0],
          ai_source: sourceType === "competitor_gap" ? "Competitor Gap" : "Keyword Discovery",
        })
      });

      if (res.ok) {
        toast.success(`Scheduled ${keyword} as ${CONTENT_TYPE_LABEL[contentType]}`);
        queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
        queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to schedule");
      }
    } catch (e) {
      toast.error("Failed to schedule");
    } finally {
      setIsScheduling(false);
    }
  };

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
          onClick={handleSchedule}
          disabled={isScheduling}
        >
          {isScheduling ? <Spinner size={12} /> : "Schedule"}
        </Button>
      </div>
    </div>
  );
}
