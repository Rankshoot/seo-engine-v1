import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { normalizeAuditGenerationUrl } from "@/lib/redux/audit-generations-slice";

export interface AuditScheduleEntry {
  entryId: string;
  scheduledDate: string;
}

/**
 * Tracks which audited URLs are already scheduled on the calendar, keyed by
 * project → normalized audit URL → { entryId, scheduledDate }. Mirrors
 * `auditGenerationsSlice` — lets the Content Audit Studio report view and the
 * Audit History rows both flip to "Scheduled for <date>" reactively, and
 * survives refresh / reopening a report from history instead of resetting to
 * blank local state.
 *
 * Not persisted: the source of truth is `calendar_entries`, hydrated fresh
 * each session from the `content-audit/scheduled-map` endpoint.
 */
export interface AuditSchedulesState {
  byProject: Record<string, Record<string, AuditScheduleEntry>>;
}

const initialState: AuditSchedulesState = { byProject: {} };

export const auditSchedulesSlice = createSlice({
  name: "auditSchedules",
  initialState,
  reducers: {
    /** Replace a project's full url→schedule map (loaded from the server). */
    setScheduledMap(
      state,
      action: PayloadAction<{ projectId: string; map: Record<string, AuditScheduleEntry> }>
    ) {
      const { projectId, map } = action.payload;
      const normalized: Record<string, AuditScheduleEntry> = {};
      for (const [url, entry] of Object.entries(map)) {
        if (url && entry?.entryId) normalized[normalizeAuditGenerationUrl(url)] = entry;
      }
      state.byProject[projectId] = normalized;
    },
    /** Record a single freshly-scheduled (or rescheduled) audit so the UI updates immediately. */
    setScheduledAudit(
      state,
      action: PayloadAction<{ projectId: string; url: string; entryId: string; scheduledDate: string }>
    ) {
      const { projectId, url, entryId, scheduledDate } = action.payload;
      if (!url || !entryId) return;
      const bucket = (state.byProject[projectId] ??= {});
      bucket[normalizeAuditGenerationUrl(url)] = { entryId, scheduledDate };
    },
  },
});

export const { setScheduledMap, setScheduledAudit } = auditSchedulesSlice.actions;
