import type { ApiUsageProvider } from "@/constants/enums/usage-provider";

/** Approximate USD per DataForSEO credit (Labs API). Tune from billing dashboard. */
const DATAFORSEO_USD_PER_CREDIT = 0.00075;

/** Rough per-call USD when credits are unknown. */
const API_CALL_USD_ESTIMATES: Partial<Record<ApiUsageProvider, number>> = {
  serper: 0.001,
  jina: 0.0002,
  scraper: 0.0005,
  ahrefs: 0.02,
  // Licensed-image providers. Openverse and Wikimedia Commons are free public
  // APIs; Pexels is free (attribution requested, no per-call charge). Kept at 0
  // so image sourcing never inflates budget math — swap in a rate here if a
  // paid stock provider is ever added.
  openverse: 0,
  wikimedia: 0,
  pexels: 0,
};

/** USD per 1M input / output tokens for Gemini text generation (approximate, 2026). */
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

/**
 * Per-image USD for image generation models.
 * Gemini native image models (generateContent endpoint): ~$0.039/image (estimated).
 * Imagen 4 models (predict endpoint): Google published rates.
 * Mark in logs as "estimated" — actual billing may differ.
 */
const IMAGE_GEN_USD_PER_IMAGE: Record<string, number> = {
  // Gemini native image models
  "gemini-2.5-flash-image":     0.039,
  "gemini-3.1-flash-image":     0.039,
  "gemini-3-pro-image":         0.080,
  "gemini-3-pro-image-preview": 0.080,
  // Imagen 4 stack
  "imagen-4.0-fast-generate-001":  0.025,
  "imagen-4.0-generate-001":       0.040,
  "imagen-4.0-ultra-generate-001": 0.080,
  // Legacy Imagen 3 (kept for historical logs)
  "imagen-3.0-fast-generate-001": 0.020,
  "imagen-3.0-generate-002":      0.040,
};

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

/**
 * Returns estimated USD cost for a single image generation call.
 * Returns null if the model is unrecognised (cost unknown).
 */
export function estimateImageGenerationCostUsd(model: string): number | null {
  const key = model.toLowerCase();
  const direct = IMAGE_GEN_USD_PER_IMAGE[key];
  if (direct != null) return roundUsd(direct);
  // Partial match (e.g. "imagen-4.0-generate" → imagen-4.0-generate-001)
  const fuzzy = Object.entries(IMAGE_GEN_USD_PER_IMAGE).find(
    ([k]) => key.includes(k) || k.includes(key)
  );
  return fuzzy != null ? roundUsd(fuzzy[1]) : null;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
