"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query";
import { calendarApi } from "@/frontend/api/calendar";
import { CalendarDatePicker } from "@/components/CalendarDatePicker";
import { unscheduleContentAction } from "@/app/actions/content-actions";
import toast from "react-hot-toast";

const MONO_LABEL = { fontFamily: "CohereMono, monospace", letterSpacing: "0.28px" } as const;

export function PreviewerScheduler({
  projectId,
  blogId,
  entryId,
  onScheduleUpdated,
}: {
  projectId: string;
  blogId: string;
  entryId?: string | null;
  onScheduleUpdated: (newEntryId: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Fetch entries to build conflict sets and compute next available date
  const { data: entriesRes } = useQuery({
    queryKey: qk.calendar(projectId),
    queryFn: () => calendarApi.entries(projectId),
    enabled: !!projectId,
  });
  const calendarEntries = entriesRes?.success ? entriesRes.data : [];

  const scheduledDatesSet = useMemo(
    () => new Set(calendarEntries.map((e) => String(e.scheduled_date).slice(0, 10))),
    [calendarEntries],
  );

  const scheduledDate = useMemo(() => {
    if (!entryId) return null;
    const hit = calendarEntries.find((e) => e.id === entryId);
    return hit ? String(hit.scheduled_date).slice(0, 10) : null;
  }, [entryId, calendarEntries]);

  // Compute next vacant date starting from today
  const nextVacantDate = useMemo(() => {
    const taken = new Set(calendarEntries.map((e) => String(e.scheduled_date).slice(0, 10)));
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    for (let i = 0; i < 500; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!taken.has(key)) {
        return key;
      }
    }
    return null;
  }, [calendarEntries]);

  const handleSchedule = async (date: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await calendarApi.scheduleExistingBlog(projectId, {
        blogId,
        targetDate: date,
      });
      if (res.success) {
        const niceDate = new Date(`${res.scheduled_date}T00:00:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        toast.success(res.rescheduled ? `Rescheduled for ${niceDate}` : `Scheduled for ${niceDate}`);
        onScheduleUpdated(res.data.id);
        void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.contentGeneratorHistory(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) });
      } else {
        toast.error(res.error || "Failed to schedule");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to schedule");
    } finally {
      setBusy(false);
      setSchedulePickerOpen(false);
    }
  };

  const handleDirectSchedule = () => {
    if (!nextVacantDate) {
      toast.error("No available calendar dates");
      return;
    }
    void handleSchedule(nextVacantDate);
  };

  const handleUnschedule = async () => {
    if (!entryId || !projectId || busy) return;
    setBusy(true);
    try {
      const res = await unscheduleContentAction(projectId, blogId, entryId);
      if (res.success) {
        toast.success("Unscheduled successfully");
        onScheduleUpdated(null);
        void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.contentGeneratorHistory(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) });
      } else {
        toast.error(res.error || "Failed to unschedule");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unschedule");
    } finally {
      setBusy(false);
    }
  };

  const formattedDate = scheduledDate
    ? new Date(`${scheduledDate}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary" style={MONO_LABEL}>
        Calendar Schedule
      </p>

      {scheduledDate ? (
        <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-primary p-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brand-action/10 text-brand-action">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-text-primary leading-tight">
                {formattedDate}
              </p>
              <p className="text-[9px] text-text-tertiary">Scheduled</p>
            </div>
          </div>
          <CalendarDatePicker
            open={schedulePickerOpen}
            onOpenChange={setSchedulePickerOpen}
            currentDate={scheduledDate}
            onConfirm={handleSchedule}
            onUnschedule={handleUnschedule}
            saving={busy}
            scheduledDates={scheduledDatesSet}
            variant="change"
            iconOnly
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleDirectSchedule}
            disabled={busy || !nextVacantDate}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-text-primary px-3 py-2 text-[12px] font-semibold text-surface-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Scheduling..." : "Direct Schedule"}
          </button>
          
          <div className="flex justify-center">
            <CalendarDatePicker
              open={schedulePickerOpen}
              onOpenChange={setSchedulePickerOpen}
              currentDate={nextVacantDate}
              onConfirm={handleSchedule}
              saving={busy}
              scheduledDates={scheduledDatesSet}
              variant="pick"
              label="Choose custom date"
              className="text-[11px] font-medium text-text-secondary hover:text-text-primary transition-colors underline underline-offset-2 flex items-center gap-1 bg-transparent border-0 px-0 h-auto rounded-none hover:bg-transparent"
            />
          </div>
        </div>
      )}
    </div>
  );
}
