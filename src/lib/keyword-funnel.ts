/**
 * Marketing funnel stage for a search query. Gemini assigns this on "AI intent"
 * refresh; otherwise we derive it from SERP intent + phrasing (AGENTS.md rules).
 */
export type FunnelStage = 'TOFU' | 'MOFU' | 'BOFU';

const FUNNEL_ORDER: Record<FunnelStage, number> = { TOFU: 0, MOFU: 1, BOFU: 2 };

export function funnelStageSortKey(stage: FunnelStage): number {
  return FUNNEL_ORDER[stage] ?? 0;
}

/** Normalize model output; returns null if not one of the three labels. */
export function parseFunnelStageLabel(raw: unknown): FunnelStage | null {
  const s = typeof raw === 'string' ? raw.toUpperCase().trim() : '';
  return s === 'TOFU' || s === 'MOFU' || s === 'BOFU' ? s : null;
}

/**
 * Deterministic TOFU / MOFU / BOFU from intent + keyword text (product rules).
 * Order: BOFU checks → MOFU → TOFU patterns → default TOFU.
 */
export function deterministicFunnelStage(intentRaw: string, keyword: string): FunnelStage {
  const intent = intentRaw.toLowerCase();
  const k = keyword.toLowerCase();

  if (
    intent === 'transactional' ||
    /\b(buy|price|pricing|cost|deal|discount|demo|free trial|sign up|signup|download)\b/.test(k)
  ) {
    return 'BOFU';
  }
  if (intent === 'navigational') {
    return 'BOFU';
  }
  if (
    intent === 'commercial' ||
    /\b(best|top|vs|review|alternative|alternatives|compare|comparison|rating)\b/.test(k)
  ) {
    return 'MOFU';
  }
  if (intent === 'informational') {
    return 'TOFU';
  }
  if (/^(how|what|why|when|guide|tutorial|ideas|examples|tips)\b/.test(k.trim())) {
    return 'TOFU';
  }
  return 'TOFU';
}

/** Prefer stored Gemini/heuristic DB value; fall back to deterministic from current intent. */
export function effectiveKeywordFunnelStage(
  stored: string | null | undefined,
  intentRaw: string,
  keyword: string
): FunnelStage {
  const parsed = parseFunnelStageLabel(stored);
  if (parsed) return parsed;
  return deterministicFunnelStage(intentRaw, keyword);
}
