import type { ApiUsageProvider } from "@/constants/enums/usage-provider";

/** Approximate USD per DataForSEO credit (Labs API). Tune from billing dashboard. */
const DATAFORSEO_USD_PER_CREDIT = 0.00075;

/** Rough per-call USD when credits are unknown. */
const API_CALL_USD_ESTIMATES: Partial<Record<ApiUsageProvider, number>> = {
  serper: 0.001,
  jina: 0.0002,
  scraper: 0.0005,
  ahrefs: 0.02,
};

/** USD per 1M input / output tokens (approximate, 2026). */
const GEMINI_INPUT_USD_PER_1M: Record<string, number> = {
  "gemini-2.5-flash": 0.15,
  "gemini-2.5-pro": 1.25,
  "gemini-flash-latest": 0.15,
  "gemini-1.5-flash": 0.075,
  "gemini-1.5-pro": 1.25,
};

const GEMINI_OUTPUT_USD_PER_1M: Record<string, number> = {
  "gemini-2.5-flash": 0.6,
  "gemini-2.5-pro": 10,
  "gemini-flash-latest": 0.6,
  "gemini-1.5-flash": 0.3,
  "gemini-1.5-pro": 5,
};

const DEFAULT_GEMINI_INPUT = 0.15;
const DEFAULT_GEMINI_OUTPUT = 0.6;

export function estimateDataForSeoCostUsd(credits: number | null | undefined): number | null {
  if (credits == null || !Number.isFinite(credits)) return null;
  return roundUsd(credits * DATAFORSEO_USD_PER_CREDIT);
}

export function estimateApiCallCostUsd(
  provider: ApiUsageProvider,
  creditsUsed?: number | null
): number | null {
  if (provider === "dataforseo") {
    return estimateDataForSeoCostUsd(creditsUsed);
  }
  if (creditsUsed != null && Number.isFinite(creditsUsed) && provider === "ahrefs") {
    return roundUsd(creditsUsed * 0.02);
  }
  const flat = API_CALL_USD_ESTIMATES[provider];
  return flat != null ? roundUsd(flat) : null;
}

export function estimateGeminiCostUsd(
  model: string,
  tokensInput?: number | null,
  tokensOutput?: number | null
): number | null {
  const input = tokensInput ?? 0;
  const output = tokensOutput ?? 0;
  if (input === 0 && output === 0) return null;

  const modelKey = model.toLowerCase();
  const inRate =
    GEMINI_INPUT_USD_PER_1M[modelKey] ??
    Object.entries(GEMINI_INPUT_USD_PER_1M).find(([k]) => modelKey.includes(k))?.[1] ??
    DEFAULT_GEMINI_INPUT;
  const outRate =
    GEMINI_OUTPUT_USD_PER_1M[modelKey] ??
    Object.entries(GEMINI_OUTPUT_USD_PER_1M).find(([k]) => modelKey.includes(k))?.[1] ??
    DEFAULT_GEMINI_OUTPUT;

  const usd = (input / 1_000_000) * inRate + (output / 1_000_000) * outRate;
  return roundUsd(usd);
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
