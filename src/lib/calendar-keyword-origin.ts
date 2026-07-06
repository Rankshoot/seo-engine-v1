/**
 * Single source of truth for "where did this calendar keyword come from?"
 * Combines keyword.source_type, calendar article_type, and calendar/keyword ai_source.
 */

import { contentHealthAuditForCalendarOrigin } from "@/lib/content-health-calendar";

export type CalendarKeywordOrigin =
  | "organic_keywords"
  | "competitor_keywords"
  | "domain"
  | "content_health"
  | "custom_keyword"
  | "ai";

export interface ResolvedCalendarOrigin {
  origin: CalendarKeywordOrigin;
  /** Primary pill — matches the product area (page) the user came from */
  label: string;
  badgeClass: string;
  /** AI badge removed from calendar as per requirements */
  aiBadge?: { label: string; className: string };
}


/**
 * @param keywordSourceType — `keywords.source_type` (industry, competitor_gap, …)
 * @param articleType — `calendar_entries.article_type` (e.g. Repair)
 * @param aiSourceFromEntry — `calendar_entries.ai_source`
 * @param aiSourceFromKeyword — `keywords.ai_source` when not yet on the calendar
 */
export function resolveCalendarKeywordOrigin(input: {
  /** Full Content Health snapshot on the calendar row — takes precedence over keyword.source_type. */
  contentHealthAudit?: unknown | null;
  keywordSourceType?: string | null;
  articleType?: string | null;
  aiSourceFromEntry?: string | null;
  aiSourceFromKeyword?: string | null;
}): ResolvedCalendarOrigin {
  const isAi =
    (input.aiSourceFromEntry && input.aiSourceFromEntry.toLowerCase().includes("ai")) ||
    (input.aiSourceFromKeyword && input.aiSourceFromKeyword.toLowerCase().includes("ai"));

  if (isAi) {
    return {
      origin: "ai",
      label: "AI",
      badgeClass: "bg-[#8b5cf6]/10 text-[#a78bfa] border-[#8b5cf6]/25",
    };
  }

  const ch = contentHealthAuditForCalendarOrigin(input.contentHealthAudit);
  if (ch) {
    return {
      origin: "content_health",
      label: ch.label,
      badgeClass: "bg-[#ef4444]/10 text-[#f87171] border-[#ef4444]/20",
    };
  }

  if (input.articleType === "Repair") {
    return {
      origin: "content_health",
      label: "Content health",
      badgeClass: "bg-[#ef4444]/10 text-[#f87171] border-[#ef4444]/20",
    };
  }

  const st = (input.keywordSourceType ?? "industry").toLowerCase();
  if (st === "manual") {
    return {
      origin: "custom_keyword",
      label: "Custom keyword",
      badgeClass: "bg-slate-500/12 text-slate-300 border-slate-500/25",
    };
  }
  if (st === "google_ads_domain") {
    return {
      origin: "domain",
      label: "Domain",
      badgeClass: "bg-cyan-500/10 text-cyan-300 border-cyan-500/25",
    };
  }
  if (
    st === "competitor_gap" ||
    st === "quick_win" ||
    st === "competitor_benchmark" ||
    st === "competitor"
  ) {
    return {
      origin: "competitor_keywords",
      label: "Competitor keywords",
      badgeClass: "bg-[#f59e0b]/10 text-[#fbbf24] border-[#f59e0b]/22",
    };
  }

  return {
    origin: "organic_keywords",
    label: "Organic keywords",
    badgeClass: "bg-brand-action/10 text-brand-action border-brand-action/25",
  };
}
