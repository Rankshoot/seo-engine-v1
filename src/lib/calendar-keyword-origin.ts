/**
 * Single source of truth for "where did this calendar keyword come from?"
 * Combines keyword.source_type, calendar article_type, and calendar.ai_source.
 */

export type CalendarKeywordOrigin = "keyword_discovery" | "competitor" | "content_health";

export interface ResolvedCalendarOrigin {
  origin: CalendarKeywordOrigin;
  /** Primary pill label */
  label: string;
  badgeClass: string;
  /** Shown when the slot was created or scheduled via AI assistant */
  aiBadge?: { label: string; className: string };
}

/**
 * @param keywordSourceType — from `keywords.source_type` (industry | competitor_gap | quick_win)
 * @param articleType — calendar_entries.article_type (e.g. Repair → audit pipeline)
 * @param aiSource — calendar_entries.ai_source (e.g. "AI · keywords")
 */
export function resolveCalendarKeywordOrigin(input: {
  keywordSourceType?: string | null;
  articleType?: string | null;
  aiSource?: string | null;
}): ResolvedCalendarOrigin {
  const ai = input.aiSource?.trim();
  const aiBadge =
    ai && ai.length > 0
      ? {
          label: "AI",
          className: "bg-[#8b5cf6]/12 text-[#a78bfa] border-[#8b5cf6]/25",
        }
      : undefined;

  if (input.articleType === "Repair") {
    return {
      origin: "content_health",
      label: "Content health",
      badgeClass: "bg-[#ef4444]/10 text-[#f87171] border-[#ef4444]/20",
      aiBadge,
    };
  }

  const st = (input.keywordSourceType ?? "industry").toLowerCase();
  if (st === "competitor_gap" || st === "quick_win") {
    return {
      origin: "competitor",
      label: "Competitor",
      badgeClass: "bg-[#f59e0b]/10 text-[#fbbf24] border-[#f59e0b]/22",
      aiBadge,
    };
  }

  return {
    origin: "keyword_discovery",
    label: "Discovery",
    badgeClass: "bg-brand-action/10 text-brand-action border-brand-action/25",
    aiBadge,
  };
}
