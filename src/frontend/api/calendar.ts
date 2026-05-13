import type { CalendarEntry, CalendarEntryWithBlog } from "@/lib/types";
import { apiGet, apiPost } from "./http";
import { V1Routes } from "./routes";

export const calendarApi = {
  entries(projectId: string): Promise<{ success: boolean; error?: string; data: CalendarEntry[] }> {
    return apiGet(V1Routes.calendarEntries(projectId));
  },

  withBlogs(projectId: string): Promise<{
    success: boolean;
    error?: string;
    data: CalendarEntryWithBlog[];
  }> {
    return apiGet(V1Routes.calendarWithBlogs(projectId));
  },

  generate(projectId: string, startDate: string): Promise<{ success: boolean; error?: string; data?: CalendarEntry[] }> {
    return apiPost(V1Routes.calendarGenerate(projectId), { startDate });
  },

  addKeywordOnDate(
    projectId: string,
    body: { keywordId: string; date: string; contentHealthAudit?: Record<string, unknown> | null }
  ): Promise<
    | { success: true; data: CalendarEntry; rescheduled?: boolean }
    | { success: false; error: string }
  > {
    return apiPost(V1Routes.calendarAddKeyword(projectId), body);
  },

  rescheduleEntry(
    projectId: string,
    body: { entryId: string; date: string }
  ): Promise<
    | { success: true; data: CalendarEntry; rescheduled: boolean }
    | { success: false; error: string }
  > {
    return apiPost(V1Routes.calendarRescheduleEntry(projectId), body);
  },

  addCustomKeyword(
    projectId: string,
    body: {
      keyword: string;
      title?: string;
      articleType?: string;
      writerNotes?: string;
      targetDate?: string;
    }
  ): Promise<
    | { success: true; data: CalendarEntry; scheduled_date: string }
    | { success: false; error: string }
  > {
    return apiPost(V1Routes.calendarAddCustom(projectId), body);
  },

  /**
   * Place an existing blog onto the calendar at a chosen date. Creates a new
   * calendar entry (status=`generated`, ai_source="Instant Article") and links
   * `blogs.entry_id` to it. If the blog is already on the calendar, this
   * reschedules the existing entry to the new date.
   */
  scheduleExistingBlog(
    projectId: string,
    body: { blogId: string; targetDate: string; source?: string }
  ): Promise<
    | { success: true; data: CalendarEntry; scheduled_date: string; rescheduled: boolean }
    | { success: false; error: string }
  > {
    return apiPost(V1Routes.calendarScheduleBlog(projectId), body);
  },

  addContentHealth(
    projectId: string,
    body: { focusKeyword: string; auditUrl?: string; contentHealthAudit?: unknown }
  ): Promise<
    | { success: true; data?: CalendarEntry; scheduled_date?: string; rescheduled?: boolean }
    | { success: false; error: string }
  > {
    return apiPost(V1Routes.calendarContentHealth(projectId), body);
  },

  approveAiSuggestion(
    projectId: string,
    body: {
      keyword: string;
      keywordId?: string;
      source: string;
      page: string;
      volume?: number;
      kd?: number;
      cpc?: number;
      intent?: string;
    }
  ): Promise<{ success: boolean; error?: string; scheduledDate?: string; alreadyExists?: boolean }> {
    return apiPost(V1Routes.calendarApproveAi(projectId), body);
  },
};
