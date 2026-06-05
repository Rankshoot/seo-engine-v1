import type {
  LogAiUsageInput,
  LogApiUsageInput,
  LogSystemErrorInput,
} from "@/types/admin-logging";
import {
  estimateApiCallCostUsd,
  estimateGeminiCostUsd,
} from "@/lib/admin/logging/cost-estimates";
import { isAiDebugLoggingEnabled } from "@/lib/admin/logging/platform-settings-cache";
import {
  redactMetadata,
  redactText,
  summarizeForAiLog,
} from "@/lib/admin/logging/redact";

const isServer = typeof window === "undefined";

async function adminDb() {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  return getSupabaseAdmin();
}

function fireAndForget(promise: Promise<void>, label: string): void {
  void promise.catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[usage-logger] ${label} failed:`, msg);
  });
}

function normalizeErrorMessage(message: string | null | undefined): string {
  if (!message) return "";
  return redactText(message, { redactEmails: true, maxLength: 500 });
}

/**
 * Persist an external API call (Ahrefs, DataForSEO, Serper, scraper, etc.).
 * Never throws — failures are logged to console only.
 */
export function logApiUsage(input: LogApiUsageInput): void {
  if (!isServer) return;
  fireAndForget(insertApiUsage(input), "logApiUsage");
}

/**
 * Persist an AI generation / classification call.
 * Full prompt/response stored only when `platform_settings.debug.ai_logging_full_prompts` is true.
 */
export function logAiUsage(input: LogAiUsageInput): void {
  if (!isServer) return;
  fireAndForget(insertAiUsage(input), "logAiUsage");
}

/**
 * Persist a system-level error for the admin errors dashboard.
 */
export function logSystemError(input: LogSystemErrorInput): void {
  if (!isServer) return;
  fireAndForget(insertSystemError(input), "logSystemError");
}

async function insertApiUsage(input: LogApiUsageInput): Promise<void> {
  const cached = input.cached ?? input.status === "cached";
  const cacheHit = input.cacheHit ?? cached;

  const estimatedCostUsd =
    input.estimatedCostUsd ??
    estimateApiCallCostUsd(input.provider, input.creditsUsed ?? null);

  const { error } = await (await adminDb()).from("api_usage_logs").insert({
    user_id: input.userId ?? null,
    project_id: input.projectId ?? null,
    provider: input.provider,
    feature: input.feature,
    endpoint: input.endpoint ?? "",
    status: input.status,
    latency_ms: input.latencyMs ?? null,
    cached,
    cache_hit: cacheHit,
    credits_used: input.creditsUsed ?? null,
    estimated_cost_usd: estimatedCostUsd,
    error_message: normalizeErrorMessage(input.errorMessage),
    metadata: redactMetadata(input.metadata),
  });

  if (error) throw new Error(error.message);
}

async function insertAiUsage(input: LogAiUsageInput): Promise<void> {
  const debugFull = await isAiDebugLoggingEnabled();

  const estimatedCostUsd =
    input.estimatedCostUsd ??
    estimateGeminiCostUsd(input.model, input.tokensInput, input.tokensOutput);

  const row: Record<string, unknown> = {
    user_id: input.userId ?? null,
    project_id: input.projectId ?? null,
    feature: input.feature,
    model: input.model,
    prompt_summary: summarizeForAiLog(input.prompt),
    prompt_full: null,
    response_full: null,
    tokens_input: input.tokensInput ?? null,
    tokens_output: input.tokensOutput ?? null,
    tokens_cached_read: input.tokensCachedRead ?? null,
    tokens_cached_write: input.tokensCachedWrite ?? null,
    cost_savings_usd: input.costSavingsUsd ?? null,
    estimated_cost_usd: estimatedCostUsd,
    status: input.status,
    error_message: normalizeErrorMessage(input.errorMessage),
    metadata: redactMetadata(input.metadata),
  };

  if (debugFull) {
    row.prompt_full = redactText(input.prompt, { redactEmails: false, maxLength: 50_000 });
    if (input.response) {
      row.response_full = redactText(input.response, {
        redactEmails: false,
        maxLength: 50_000,
      });
    }
  }

  const { error } = await (await adminDb()).from("ai_usage_logs").insert(row);
  if (error) throw new Error(error.message);
}

async function insertSystemError(input: LogSystemErrorInput): Promise<void> {
  const { error } = await (await adminDb()).from("system_error_logs").insert({
    user_id: input.userId ?? null,
    project_id: input.projectId ?? null,
    feature: input.feature,
    provider: input.provider ?? "",
    error_message: normalizeErrorMessage(input.errorMessage),
    severity: input.severity ?? "medium",
    status: "open",
    metadata: redactMetadata(input.metadata),
  });

  if (error) throw new Error(error.message);
}
