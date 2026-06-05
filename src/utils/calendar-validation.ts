import { revalidateTag } from "next/cache";

/**
 * Returns a local day ISO string (YYYY-MM-DD) calculated from a relative day offset.
 * Used for calendar picker boundaries and vacant day discovery.
 */
export function getLocalDayISOFromOffset(daysFromToday: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromToday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Asserts whether a given date target string falls in the past.
 */
export function isPastDate(dateStr: string): boolean {
  const normalized = String(dateStr).slice(0, 10);
  const today = getLocalDayISOFromOffset(0);
  return normalized < today;
}

/**
 * Standard Next.js route cache invalidation for calendar layouts.
 */
export function invalidateCalendarCache(): void {
  try {
    revalidateTag("calendar-entries", "default");
    console.log("[Telemetry] Invalidated Next.js cache tag: calendar-entries");
  } catch (err) {
    console.error("[Telemetry] Failed to invalidate cache tag: calendar-entries", err);
  }
}

export interface ReschedulePayload {
  entryId: string;
  date: string;
}

/**
 * Pure validator for reschedule entry requests.
 */
export function validateReschedulePayload(body: unknown): { success: true; data: ReschedulePayload } | { success: false; error: string } {
  if (!body || typeof body !== "object") {
    return { success: false, error: "Malformed payload body" };
  }
  
  const b = body as Record<string, unknown>;
  
  if (!b.entryId || typeof b.entryId !== "string" || !b.entryId.trim()) {
    return { success: false, error: "entryId must be a non-empty string" };
  }
  if (!b.date || typeof b.date !== "string" || !b.date.trim()) {
    return { success: false, error: "date must be a non-empty string" };
  }
  
  const dateNorm = String(b.date).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(dateNorm)) {
    return { success: false, error: "Invalid date format, expected YYYY-MM-DD" };
  }

  return {
    success: true,
    data: {
      entryId: b.entryId.trim(),
      date: dateNorm,
    },
  };
}

export interface AddCustomPayload {
  keyword: string;
  title?: string;
  articleType?: string;
  writerNotes?: string;
  targetDate?: string;
}

/**
 * Pure validator for add custom keyword requests.
 */
export function validateAddCustomPayload(body: unknown): { success: true; data: AddCustomPayload } | { success: false; error: string } {
  if (!body || typeof body !== "object") {
    return { success: false, error: "Malformed payload body" };
  }

  const b = body as Record<string, unknown>;

  if (!b.keyword || typeof b.keyword !== "string" || !b.keyword.trim()) {
    return { success: false, error: "keyword is required" };
  }

  const result: AddCustomPayload = {
    keyword: b.keyword.trim(),
  };

  if (b.title !== undefined) {
    if (typeof b.title !== "string") {
      return { success: false, error: "title must be a string" };
    }
    result.title = b.title.trim();
  }

  if (b.articleType !== undefined) {
    if (typeof b.articleType !== "string") {
      return { success: false, error: "articleType must be a string" };
    }
    result.articleType = b.articleType.trim();
  }

  if (b.writerNotes !== undefined) {
    if (typeof b.writerNotes !== "string") {
      return { success: false, error: "writerNotes must be a string" };
    }
    result.writerNotes = b.writerNotes.trim();
  }

  if (b.targetDate !== undefined) {
    if (typeof b.targetDate !== "string") {
      return { success: false, error: "targetDate must be a string" };
    }
    const dateNorm = b.targetDate.trim();
    if (dateNorm && !/^\d{4}-\d{2}-\d{2}/.test(dateNorm)) {
      return { success: false, error: "Invalid targetDate format, expected YYYY-MM-DD" };
    }
    result.targetDate = dateNorm;
  }

  return {
    success: true,
    data: result,
  };
}
