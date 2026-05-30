"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppDispatch } from "@/lib/redux/hooks";
import { calendarRefreshBump } from "@/lib/redux/keyword-workspace-slice";
import { blogsApi } from "@/frontend/api/blogs";
import { qk } from "@/lib/query";
import { toast } from "react-hot-toast";

export function useGenerateContentEntry(projectId: string) {
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const generate = async (entryId: string, wordCount: number = 2500, writerNotes?: string) => {
    setGeneratingId(entryId);

    // Optimistically update status to "generating" in calendarWithBlogs query cache
    const ENTRIES_KEY = qk.calendarWithBlogs(projectId);
    queryClient.setQueryData(ENTRIES_KEY, (prev: any) => {
      if (!prev?.success) return prev;
      return {
        ...prev,
        data: prev.data.map((e: any) => (e.id === entryId ? { ...e, status: "generating" } : e)),
      };
    });

    try {
      const res = await blogsApi.generate({
        entryId,
        wordCount,
        writerNotes: writerNotes || undefined,
      });

      if (res.success && res.data) {
        toast.success("Blog generated");

        // Optimistically set status to "generated" and populate blog details
        queryClient.setQueryData(ENTRIES_KEY, (prev: any) => {
          if (!prev?.success) return prev;
          return {
            ...prev,
            data: prev.data.map((e: any) =>
              e.id === entryId
                ? {
                    ...e,
                    status: "generated",
                    title: res.data.title,
                    blog: {
                      id: res.data.id,
                      entry_id: res.data.entry_id,
                      title: res.data.title,
                      word_count: res.data.word_count,
                      status: res.data.status,
                      research_sources: res.data.research_sources,
                    },
                  }
                : e
            ),
          };
        });

        // Trigger Redux sync bump
        dispatch(calendarRefreshBump({ projectId }));

        // Refetch/invalidate queries
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) }),
          queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) }),
          queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) }),
          queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) }),
        ]);

        return res.data;
      } else {
        const errorMsg = !res.success ? res.error : "Generation failed";
        toast.error(errorMsg);

        // Revert status to scheduled in cache
        queryClient.setQueryData(ENTRIES_KEY, (prev: any) => {
          if (!prev?.success) return prev;
          return {
            ...prev,
            data: prev.data.map((e: any) => (e.id === entryId ? { ...e, status: "scheduled" } : e)),
          };
        });

        return null;
      }
    } catch (e: any) {
      const errorMsg = e?.message || "An unexpected error occurred during generation.";
      toast.error(errorMsg);

      // Revert status to scheduled in cache
      queryClient.setQueryData(ENTRIES_KEY, (prev: any) => {
        if (!prev?.success) return prev;
        return {
          ...prev,
          data: prev.data.map((e: any) => (e.id === entryId ? { ...e, status: "scheduled" } : e)),
        };
      });

      return null;
    } finally {
      setGeneratingId(null);
    }
  };

  return {
    generate,
    generatingId,
    isGenerating: !!generatingId,
  };
}
