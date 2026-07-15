import type { AhrefsCallResult } from "@/lib/ahrefs";
import type { DataForSEOTraceEntry } from "@/lib/dataforseo";
import {
  estimateApiCallCostUsd,
  estimateDataForSeoCostUsd,
  estimateGeminiCostUsd,
} from "@/lib/admin/logging/cost-estimates";
import { mergeUsageLogContext } from "@/lib/admin/logging/log-context";
import type { LogAiUsageInput, LogApiUsageInput } from "@/types/admin-logging";

const isServer = typeof window === "undefined";

function queueApiUsage(input: LogApiUsageInput): void {
  void import("@/lib/admin/logging/usage-logger").then((m) => m.logApiUsage(input));
}

function queueAiUsage(input: LogAiUsageInput): void {
  void import("@/lib/admin/logging/usage-logger").then((m) => m.logAiUsage(input));
}

function ctxFeature(fallback: string, suffix?: string): string {
  const base = mergeUsageLogContext({}).feature ?? fallback;
  return suffix ? `${base}.${suffix}` : base;
}

export function recordDataForSeoCall(
  endpoint: string,
  entry: DataForSEOTraceEntry,
  latencyMs: number
): void {
  if (!isServer) return;
  const ctx = mergeUsageLogContext({});
  const credits = entry.cost ?? null;
  queueApiUsage({
    userId: ctx.userId,
    projectId: ctx.projectId,
    provider: "dataforseo",
    feature: ctxFeature("dataforseo", endpoint.replace(/\//g, "_")),
    endpoint,
    status: entry.ok ? "success" : "error",
    latencyMs,
    cached: false,
    cacheHit: false,
    creditsUsed: credits,
    estimatedCostUsd: estimateDataForSeoCostUsd(credits),
    errorMessage: entry.fetchError ?? entry.parseError ?? null,
    metadata: {
      httpStatus: entry.httpStatus,
      label: entry.label,
    },
  });
}

export function recordAhrefsCall(
  endpoint: string,
  label: string | undefined,
  result: AhrefsCallResult<unknown>
): void {
  if (!isServer) return;
  const ctx = mergeUsageLogContext({});
  queueApiUsage({
    userId: ctx.userId,
    projectId: ctx.projectId,
    provider: "ahrefs",
    feature: ctxFeature("ahrefs", label ?? endpoint),
    endpoint,
    status: result.ok ? "success" : "error",
    latencyMs: result.ms,
    cached: false,
    cacheHit: false,
    estimatedCostUsd: estimateApiCallCostUsd("ahrefs", result.rows > 0 ? 1 : null),
    errorMessage: result.errorMessage ?? null,
    metadata: {
      rows: result.rows,
      status: result.status,
      errorReason: result.errorReason,
    },
  });
}

export function recordSerperCall(
  endpoint: string,
  ok: boolean,
  latencyMs: number,
  errorMessage?: string
): void {
  if (!isServer) return;
  const ctx = mergeUsageLogContext({});
  queueApiUsage({
    userId: ctx.userId,
    projectId: ctx.projectId,
    provider: "serper",
    feature: ctxFeature("serper", endpoint),
    endpoint: `serper/${endpoint}`,
    status: ok ? "success" : "error",
    latencyMs,
    errorMessage: errorMessage ?? null,
  });
}

/**
 * Logs a licensed-image-search API call (Openverse / Wikimedia / Pexels) to
 * `api_usage_logs`. Openverse and Wikimedia are free; Pexels is free-tier — all
 * estimated at $0 (see cost-estimates.ts) so image sourcing never distorts the
 * budget totals. `resultCount` is captured in metadata for debugging thin results.
 */
export function recordImageSearchCall(
  provider: "openverse" | "wikimedia" | "pexels",
  ok: boolean,
  latencyMs: number,
  resultCount?: number,
  errorMessage?: string
): void {
  if (!isServer) return;
  const ctx = mergeUsageLogContext({});
  queueApiUsage({
    userId: ctx.userId,
    projectId: ctx.projectId,
    provider,
    feature: ctxFeature(provider, "image_search"),
    endpoint: `${provider}/images`,
    status: ok ? "success" : "error",
    latencyMs,
    estimatedCostUsd: estimateApiCallCostUsd(provider),
    errorMessage: errorMessage ?? null,
    metadata: resultCount != null ? { resultCount } : undefined,
  });
}

export function recordPerplexityCall(
  endpoint: string,
  ok: boolean,
  latencyMs: number,
  errorMessage?: string
): void {
  if (!isServer) return;
  const ctx = mergeUsageLogContext({});
  queueApiUsage({
    userId: ctx.userId,
    projectId: ctx.projectId,
    provider: "perplexity",
    feature: ctxFeature("perplexity", endpoint),
    endpoint: `perplexity/${endpoint}`,
    status: ok ? "success" : "error",
    latencyMs,
    errorMessage: errorMessage ?? null,
  });
}

export function recordJinaCall(
  url: string,
  ok: boolean,
  latencyMs: number,
  errorMessage?: string
): void {
  if (!isServer) return;
  const ctx = mergeUsageLogContext({});
  queueApiUsage({
    userId: ctx.userId,
    projectId: ctx.projectId,
    provider: "jina",
    feature: ctxFeature("scraper", "jina_reader"),
    endpoint: "r.jina.ai",
    status: ok ? "success" : "error",
    latencyMs,
    errorMessage: errorMessage ?? null,
    metadata: { url: url.slice(0, 200) },
  });
}

export function recordScraperCall(
  feature: string,
  endpoint: string,
  ok: boolean,
  latencyMs: number,
  metadata?: Record<string, unknown>
): void {
  if (!isServer) return;
  const ctx = mergeUsageLogContext({});
  queueApiUsage({
    userId: ctx.userId,
    projectId: ctx.projectId,
    provider: "scraper",
    feature: ctxFeature(feature),
    endpoint,
    status: ok ? "success" : "error",
    latencyMs,
    metadata,
  });
}

export interface RecordGeminiCallInput {
  model: string;
  prompt: string;
  response?: string | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  ok: boolean;
  latencyMs: number;
  errorMessage?: string | null;
  featureSuffix?: string;
}

export function recordGeminiCall(input: RecordGeminiCallInput): void {
  if (!isServer) return;
  const ctx = mergeUsageLogContext({});
  queueAiUsage({
    userId: ctx.userId,
    projectId: ctx.projectId,
    feature: ctxFeature("gemini", input.featureSuffix),
    model: input.model,
    prompt: input.prompt,
    response: input.response,
    tokensInput: input.tokensInput,
    tokensOutput: input.tokensOutput,
    estimatedCostUsd: estimateGeminiCostUsd(
      input.model,
      input.tokensInput,
      input.tokensOutput
    ),
    status: input.ok ? "success" : "error",
    errorMessage: input.errorMessage,
    metadata: {
      call_type: "helper",
    },
  });
}

export function extractGeminiTokenUsage(json: unknown): {
  tokensInput?: number;
  tokensOutput?: number;
} {
  if (!json || typeof json !== "object") return {};
  const u = (json as Record<string, unknown>).usageMetadata;
  if (!u || typeof u !== "object") return {};
  const meta = u as Record<string, unknown>;
  const tokensInput =
    typeof meta.promptTokenCount === "number"
      ? meta.promptTokenCount
      : typeof meta.prompt_token_count === "number"
        ? meta.prompt_token_count
        : undefined;
  const tokensOutput =
    typeof meta.candidatesTokenCount === "number"
      ? meta.candidatesTokenCount
      : typeof meta.candidates_token_count === "number"
        ? meta.candidates_token_count
        : typeof meta.totalTokenCount === "number"
          ? meta.totalTokenCount
          : undefined;
  return { tokensInput, tokensOutput };
}

/** Log a cache read (no vendor charge). */
export function recordApiCacheHit(
  provider: "ahrefs" | "dataforseo",
  feature: string,
  endpoint: string,
  metadata?: Record<string, unknown>
): void {
  if (!isServer) return;
  const ctx = mergeUsageLogContext({});
  queueApiUsage({
    userId: ctx.userId,
    projectId: ctx.projectId,
    provider,
    feature: ctxFeature(feature, "cache"),
    endpoint,
    status: "cached",
    cached: true,
    cacheHit: true,
    estimatedCostUsd: 0,
    metadata,
  });
}

export interface RecordAiCallInput {
  provider: "gemini" | "claude";
  model: string;
  prompt: string;
  response?: string | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  tokensCachedRead?: number | null;
  tokensCachedWrite?: number | null;
  costSavingsUsd?: number | null;
  estimatedCostUsd?: number | null;
  ok: boolean;
  latencyMs: number;
  errorMessage?: string | null;
  featureSuffix?: string;
  metadata?: Record<string, unknown>;
}

export function recordAiCall(input: RecordAiCallInput): void {
  if (!isServer) return;
  const ctx = mergeUsageLogContext({});
  const callType = input.provider === "claude" ? "content_generation" : "helper";
  queueAiUsage({
    userId: ctx.userId,
    projectId: ctx.projectId,
    feature: ctxFeature(input.provider, input.featureSuffix),
    model: input.model,
    prompt: input.prompt,
    response: input.response,
    tokensInput: input.tokensInput,
    tokensOutput: input.tokensOutput,
    tokensCachedRead: input.tokensCachedRead,
    tokensCachedWrite: input.tokensCachedWrite,
    costSavingsUsd: input.costSavingsUsd,
    estimatedCostUsd: input.estimatedCostUsd,
    status: input.ok ? "success" : "error",
    errorMessage: input.errorMessage,
    metadata: {
      ...input.metadata,
      latencyMs: input.latencyMs,
      call_type: callType,
    },
  });
}

