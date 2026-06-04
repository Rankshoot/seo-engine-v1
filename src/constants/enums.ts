/**
 * Centralised enums + their display labels. Re-exports a few existing types
 * from `@/lib/types` so call sites can `import { KeywordStatus } from "@/constants/enums"`
 * instead of mixing imports.
 *
 * IMPORTANT: do not change the underlying string values — they are persisted
 * in Supabase (`keywords.status`, `calendar_entries.status`, `blogs.status`,
 * `blogs.type`, etc.) and Redux localStorage.
 */

import type {
  KeywordStatus,
  CalendarStatus,
  BlogStatus,
  ContentType,
  KeywordSourceType,
} from "@/lib/types";

export type {
  KeywordStatus,
  CalendarStatus,
  BlogStatus,
  ContentType,
  KeywordSourceType,
};

/* ───────────────────────── Keyword status ───────────────────────── */

export const KEYWORD_STATUSES: readonly KeywordStatus[] = [
  "pending",
  "approved",
  "rejected",
] as const;

export const KEYWORD_STATUS_LABEL: Record<KeywordStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

/* ───────────────────────── Calendar status ───────────────────────── */

export const CALENDAR_STATUSES: readonly CalendarStatus[] = [
  "scheduled",
  "generating",
  "generated",
  "downloaded",
  "published",
  "approved",
] as const;

export const CALENDAR_STATUS_LABEL: Record<CalendarStatus, string> = {
  scheduled: "Scheduled",
  generating: "Generating",
  generated: "Generated",
  downloaded: "Downloaded",
  published: "Published",
  approved: "Approved",
};

/* ───────────────────────── Blog status ───────────────────────── */

export const BLOG_STATUSES: readonly BlogStatus[] = [
  "generated",
  "approved",
  "published",
] as const;

export const BLOG_STATUS_LABEL: Record<BlogStatus, string> = {
  generated: "Generated",
  approved: "Approved",
  published: "Published",
};

/* ───────────────────────── Funnel stage ───────────────────────── */

export type FunnelStage = "TOFU" | "MOFU" | "BOFU";

export const FUNNEL_STAGES: readonly FunnelStage[] = [
  "TOFU",
  "MOFU",
  "BOFU",
] as const;

export const FUNNEL_STAGE_LABEL: Record<FunnelStage, string> = {
  TOFU: "Top of funnel",
  MOFU: "Middle of funnel",
  BOFU: "Bottom of funnel",
};

/* ───────────────────────── Loading state ───────────────────────── */

export type LoadingState = "idle" | "loading" | "success" | "error";

/* ───────────────────────── AI assistant state ───────────────────────── */

export type AIState = "idle" | "thinking" | "streaming" | "tool" | "error";

/* ───────────────────────── AI source ───────────────────────── */

export type AISource = "gemini" | "claude" | "openai";

/* ───────────────────────── Content type display ───────────────────────── */

export const CONTENT_TYPE_ICON: Record<ContentType, string> = {
  blog: "📝",
  ebook: "📘",
  whitepaper: "📄",
  linkedin: "💼",
};
