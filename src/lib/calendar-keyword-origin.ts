/**
 * Single source of truth for "where did this calendar keyword come from?"
 * Combines keyword.source_type, calendar article_type, and calendar/keyword ai_source.
 */

export type CalendarKeywordOrigin =
  | "keyword_discovery"
  | "competitor_insights"
  | "domain"
  | "content_health";

export interface ResolvedCalendarOrigin {
  origin: CalendarKeywordOrigin;
  /** Primary pill — matches the product area (page) the user came from */
  label: string;
  badgeClass: string;
  /** Shown when the keyword or slot was stamped via the AI assistant */
  aiBadge?: { label: string; className: string };
}

function mergeAiSource(
  entryAi?: string | null,
  keywordAi?: string | null
): string {
  const a = (entryAi ?? "").trim();
  if (a.length > 0) return a;
  return (keywordAi ?? "").trim();
}

/**
 * @param keywordSourceType — `keywords.source_type` (industry, competitor_gap, …)
 * @param articleType — `calendar_entries.article_type` (e.g. Repair)
 * @param aiSourceFromEntry — `calendar_entries.ai_source`
 * @param aiSourceFromKeyword — `keywords.ai_source` when not yet on the calendar
 */
export function resolveCalendarKeywordOrigin(input: {
  keywordSourceType?: string | null;
  articleType?: string | null;
  aiSourceFromEntry?: string | null;
  aiSourceFromKeyword?: string | null;
}): ResolvedCalendarOrigin {
  const aiRaw = mergeAiSource(input.aiSourceFromEntry, input.aiSourceFromKeyword);
  const aiBadge =
    aiRaw.length > 0
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
  if (st === "google_ads_domain") {
    return {
      origin: "domain",
      label: "Domain",
      badgeClass: "bg-cyan-500/10 text-cyan-300 border-cyan-500/25",
      aiBadge,
    };
  }
  if (
    st === "competitor_gap" ||
    st === "quick_win" ||
    st === "competitor_benchmark"
  ) {
    return {
      origin: "competitor_insights",
      label: "Competitor insights",
      badgeClass: "bg-[#f59e0b]/10 text-[#fbbf24] border-[#f59e0b]/22",
      aiBadge,
    };
  }

  return {
    origin: "keyword_discovery",
    label: "Keyword discovery",
    badgeClass: "bg-brand-action/10 text-brand-action border-brand-action/25",
    aiBadge,
  };
}
