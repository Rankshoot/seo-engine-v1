import { GeminiProvider } from "./gemini";
import { ClaudeProvider } from "./claude";
import { AIProvider, BudgetExceededError } from "./base";

export * from "./base";
export { GeminiProvider } from "./gemini";
export { ClaudeProvider } from "./claude";

export const providers: Record<"gemini" | "claude", AIProvider> = {
  gemini: new GeminiProvider(),
  claude: new ClaudeProvider(),
};

/**
 * Valid Claude model IDs currently supported by Anthropic's API.
 * Any model stored in DB that doesn't match these is considered stale and
 * replaced with the current default before making an API call.
 */
const VALID_CLAUDE_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-opus-4-8",
  "claude-haiku-4-5",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-5",
  "claude-opus-4-5-20251101",
  "claude-sonnet-4-5",
  "claude-sonnet-4-5-20250929",
  "claude-opus-4-20250514",
  "claude-sonnet-4-20250514",
]);

const VALID_GEMINI_MODELS = new Set([
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-pro",
  "gemini-2.0-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
]);

const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-pro";

/**
 * Sanitizes a model ID read from DB. If it's not in the known-valid set,
 * logs a warning and returns the appropriate current default.
 */
function sanitizeModel(model: string): string {
  if (model.startsWith("claude")) {
    if (!VALID_CLAUDE_MODELS.has(model)) {
      console.warn(
        `[routing] Stale or unknown Claude model "${model}" found in DB routing settings. ` +
        `Replacing with default "${DEFAULT_CLAUDE_MODEL}". ` +
        `Please update routing in the Admin Settings panel.`
      );
      return DEFAULT_CLAUDE_MODEL;
    }
  } else if (model.startsWith("gemini")) {
    if (!VALID_GEMINI_MODELS.has(model)) {
      console.warn(
        `[routing] Stale or unknown Gemini model "${model}" found in DB routing settings. ` +
        `Replacing with default "${DEFAULT_GEMINI_MODEL}".`
      );
      return DEFAULT_GEMINI_MODEL;
    }
  }
  return model;
}

/**
 * Centrally routes a generation call. Fetches active routing settings from DB.
 * Default is Claude Sonnet 4.6.
 */
export async function getProviderForRoute(feature: string): Promise<{
  provider: AIProvider;
  model: string;
}> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const db = getSupabaseAdmin();
  
  let providerId: "gemini" | "claude" = "claude";
  let model = DEFAULT_CLAUDE_MODEL;
  
  try {
    const { data } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", "routing")
      .maybeSingle();
      
    if (data?.value) {
      const routing = data.value as Record<string, string>;
      const rawModel = routing[feature] || routing["blog"] || model;
      // Sanitize: replace any stale/deprecated model IDs with current defaults
      model = sanitizeModel(rawModel);
      providerId = model.startsWith("claude") ? "claude" : "gemini";
    }
  } catch (err) {
    console.warn("[routing] Failed to load routing settings:", err);
  }
  
  // Fallback check: check if provider is enabled
  const { isProviderEnabled } = await import("@/lib/admin/platform-settings-runtime");
  const enabled = await isProviderEnabled(providerId);
  if (!enabled) {
    // Degrade to the alternative provider if enabled
    providerId = providerId === "claude" ? "gemini" : "claude";
    model = providerId === "claude" ? DEFAULT_CLAUDE_MODEL : DEFAULT_GEMINI_MODEL;
  }
  
  return {
    provider: providers[providerId],
    model,
  };
}


/** Check cost limits in platform_settings and enforce monthly budgets dynamically. */
export async function checkBudgetControls(userId?: string | null, projectId?: string | null): Promise<void> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const db = getSupabaseAdmin();

  // Set standard defaults
  let globalMonthlyLimit = 500.00;
  let userMonthlyLimit = 25.00;
  let projectMonthlyLimit = 50.00;

  try {
    const { data } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", "cost_controls")
      .maybeSingle();
    if (data?.value) {
      const cc = data.value as Record<string, number>;
      globalMonthlyLimit = cc.global_monthly_limit_usd ?? globalMonthlyLimit;
      userMonthlyLimit = cc.user_monthly_limit_usd ?? userMonthlyLimit;
      projectMonthlyLimit = cc.project_monthly_limit_usd ?? projectMonthlyLimit;
    }
  } catch (err) {
    console.warn("[budget] Failed to load cost controls:", err);
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startOfMonthIso = startOfMonth.toISOString();

  // 1. Check Global Monthly Limit
  const { data: globalUsage } = await db
    .from("ai_usage_logs")
    .select("estimated_cost_usd")
    .gte("created_at", startOfMonthIso);
  const globalSpent = (globalUsage ?? []).reduce((acc, r) => acc + (Number(r.estimated_cost_usd) || 0), 0);
  if (globalSpent >= globalMonthlyLimit) {
    throw new BudgetExceededError("global", "system", globalMonthlyLimit, globalSpent);
  }

  // 2. Check User Monthly Limit
  if (userId) {
    const { data: userUsage } = await db
      .from("ai_usage_logs")
      .select("estimated_cost_usd")
      .eq("user_id", userId)
      .gte("created_at", startOfMonthIso);
    const userSpent = (userUsage ?? []).reduce((acc, r) => acc + (Number(r.estimated_cost_usd) || 0), 0);
    if (userSpent >= userMonthlyLimit) {
      throw new BudgetExceededError("user", userId, userMonthlyLimit, userSpent);
    }
  }

  // 3. Check Project Monthly Limit
  if (projectId) {
    const { data: projectUsage } = await db
      .from("ai_usage_logs")
      .select("estimated_cost_usd")
      .eq("project_id", projectId)
      .gte("created_at", startOfMonthIso);
    const projectSpent = (projectUsage ?? []).reduce((acc, r) => acc + (Number(r.estimated_cost_usd) || 0), 0);
    if (projectSpent >= projectMonthlyLimit) {
      throw new BudgetExceededError("project", projectId, projectMonthlyLimit, projectSpent);
    }
  }
}

import { z } from "zod";

/**
 * Resolves the fallback provider and model from routing settings.
 * Defaults to Gemini 2.5 Pro.
 */
async function getFallbackProviderAndModel(feature: string): Promise<{
  provider: AIProvider;
  model: string;
}> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const db = getSupabaseAdmin();
  
  let providerId: "gemini" | "claude" = "gemini";
  let model = "gemini-2.5-pro";
  
  try {
    const { data } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", "routing")
      .maybeSingle();
      
    if (data?.value) {
      const routing = data.value as Record<string, string>;
      const selectedModel = routing["fallback"] || model;
      model = selectedModel;
      providerId = selectedModel.startsWith("claude") ? "claude" : "gemini";
    }
  } catch (err) {
    console.warn("[routing] Failed to load fallback routing:", err);
  }
  
  return {
    provider: providers[providerId],
    model,
  };
}

/**
 * Centrally routed string completion helper with automatic fallback.
 */
/**
 * Helper to wrap a promise function with an AbortController timeout.
 * Throws a TimeoutError if the request hangs beyond the timeout threshold.
 */
async function withTimeout<T>(
  promiseFn: (signal?: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  if (timeoutMs <= 0) {
    return promiseFn();
  }

  const controller = new AbortController();
  const id = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await promiseFn(controller.signal);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.name === "AbortError" || error.message?.includes("aborted") || controller.signal.aborted) {
      const timeoutErr = new Error("Gateway Timeout");
      timeoutErr.name = "TimeoutError";
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

function getSystemPromptWithDate(userPrompt?: string): string {
  const currentYear = new Date().getFullYear();
  const todayStr = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
  const dateGuideline = `The current date is ${todayStr}. The current year is ${currentYear}. All references to "this year", "current trends", or future/past projections must be relative to ${currentYear}. Do NOT suggest or generate content referencing outdated years like 2025 as the current or upcoming year. Ensure titles, keywords, and text use ${currentYear} (or later) where applicable.`;
  return userPrompt ? `${userPrompt}\n\n[Context: ${dateGuideline}]` : dateGuideline;
}

export async function aiGenerate(
  feature: string,
  prompt: string,
  opts: {
    systemPrompt?: string;
    temperature?: number;
    maxOutputTokens?: number;
    jsonMode?: boolean;
    responseSchema?: Record<string, unknown>;
    useGoogleSearch?: boolean;
    userId?: string | null;
    projectId?: string | null;
    cachePrompt?: boolean;
    retries?: number;
    topP?: number;
    timeoutMs?: number;
  } = {}
): Promise<string> {
  const userId = opts.userId;
  if (userId) {
    const { QuotaService } = await import("@/services/quota");
    await QuotaService.checkQuota(userId, "ai_credits");
  }

  await checkBudgetControls(opts.userId, opts.projectId);
  let { provider, model } = await getProviderForRoute(feature);
  // Live web-search grounding is a Gemini-only capability in this codebase —
  // Claude's provider has no search tool wired at all, so silently routing a
  // `useGoogleSearch: true` call to Claude (e.g. this feature's admin routing
  // falls back to another feature's model, or is set to a Claude model) would
  // make the flag a no-op: the model would fabricate "current" info from
  // training data instead of actually searching. Force Gemini whenever the
  // caller explicitly asked for search, regardless of the configured route.
  if (opts.useGoogleSearch && provider.id !== "gemini") {
    provider = providers.gemini;
    model = DEFAULT_GEMINI_MODEL;
  }
  const timeoutMs = opts.timeoutMs !== undefined ? opts.timeoutMs : 120000;
  const systemPrompt = getSystemPromptWithDate(opts.systemPrompt);

  let resultText: string;
  try {
    const res = await withTimeout(
      (signal) =>
        provider.generate(model, prompt, {
          temperature: opts.temperature,
          maxOutputTokens: opts.maxOutputTokens,
          jsonMode: opts.jsonMode,
          responseSchema: opts.responseSchema,
          useGoogleSearch: opts.useGoogleSearch,
          systemPrompt,
          cachePrompt: opts.cachePrompt,
          retries: opts.retries,
          topP: opts.topP,
          signal,
        }),
      timeoutMs
    );
    resultText = res.text;
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw err;
    }

    const { provider: fbProvider, model: fbModel } = await getFallbackProviderAndModel(feature);
    if (fbModel !== model) {
      console.warn(`[routing] Primary generation failed with model ${model}. Retrying with fallback: ${fbModel}. Error:`, err instanceof Error ? err.message : err);
      const res = await withTimeout(
        (signal) =>
          fbProvider.generate(fbModel, prompt, {
            temperature: opts.temperature,
            maxOutputTokens: opts.maxOutputTokens,
            jsonMode: opts.jsonMode,
            responseSchema: opts.responseSchema,
            useGoogleSearch: opts.useGoogleSearch,
            systemPrompt,
            cachePrompt: opts.cachePrompt,
            retries: opts.retries,
            topP: opts.topP,
            signal,
          }),
        timeoutMs
      );
      resultText = res.text;
    } else {
      throw err;
    }
  }

  if (userId) {
    const { QuotaService } = await import("@/services/quota");
    await QuotaService.deductQuota(userId, "ai_credits");
  }
  return resultText;
}

/**
 * Centrally routed streaming helper with automatic fallback.
 */
export async function* aiStream(
  feature: string,
  prompt: string,
  opts: {
    systemPrompt?: string;
    temperature?: number;
    maxOutputTokens?: number;
    jsonMode?: boolean;
    useGoogleSearch?: boolean;
    userId?: string | null;
    projectId?: string | null;
    cachePrompt?: boolean;
    retries?: number;
    topP?: number;
    timeoutMs?: number;
  } = {}
) {
  const userId = opts.userId;
  if (userId) {
    const { QuotaService } = await import("@/services/quota");
    await QuotaService.checkQuota(userId, "ai_credits");
  }

  await checkBudgetControls(opts.userId, opts.projectId);
  const { provider, model } = await getProviderForRoute(feature);
  const timeoutMs = opts.timeoutMs !== undefined ? opts.timeoutMs : 120000;
  const systemPrompt = getSystemPromptWithDate(opts.systemPrompt);

  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let success = false;
  try {
    const streamGen = provider.stream(model, prompt, {
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
      jsonMode: opts.jsonMode,
      useGoogleSearch: opts.useGoogleSearch,
      systemPrompt,
      cachePrompt: opts.cachePrompt,
      retries: opts.retries,
      topP: opts.topP,
      signal: controller?.signal,
    });
    for await (const chunk of streamGen) {
      yield chunk;
    }
    success = true;
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (controller?.signal.aborted || error.name === "AbortError" || error.message?.includes("aborted")) {
      const timeoutErr = new Error("Gateway Timeout");
      timeoutErr.name = "TimeoutError";
      throw timeoutErr;
    }

    const { provider: fbProvider, model: fbModel } = await getFallbackProviderAndModel(feature);
    if (fbModel !== model) {
      console.warn(`[routing] Primary stream failed with model ${model}. Retrying with fallback: ${fbModel}. Error:`, err instanceof Error ? err.message : err);
      if (timeoutId) clearTimeout(timeoutId);
      
      const fbController = timeoutMs > 0 ? new AbortController() : null;
      const fbTimeoutId = fbController ? setTimeout(() => fbController.abort(), timeoutMs) : null;

      try {
        const fallbackStream = fbProvider.stream(fbModel, prompt, {
          temperature: opts.temperature,
          maxOutputTokens: opts.maxOutputTokens,
          jsonMode: opts.jsonMode,
          useGoogleSearch: opts.useGoogleSearch,
          systemPrompt,
          cachePrompt: opts.cachePrompt,
          retries: opts.retries,
          topP: opts.topP,
          signal: fbController?.signal,
        });
        for await (const chunk of fallbackStream) {
          yield chunk;
        }
        success = true;
      } catch (fbErr: unknown) {
        const fbError = fbErr instanceof Error ? fbErr : new Error(String(fbErr));
        if (fbController?.signal.aborted || fbError.name === "AbortError" || fbError.message?.includes("aborted")) {
          const timeoutErr = new Error("Gateway Timeout");
          timeoutErr.name = "TimeoutError";
          throw timeoutErr;
        }
        throw fbErr;
      } finally {
        if (fbTimeoutId) clearTimeout(fbTimeoutId);
      }
    } else {
      throw err;
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (success && userId) {
    const { QuotaService } = await import("@/services/quota");
    await QuotaService.deductQuota(userId, "ai_credits");
  }
}

/**
 * Centrally routed Zod-structured output helper with automatic fallback.
 */
export async function aiGenerateStructured<T>(
  feature: string,
  prompt: string,
  schema: z.ZodType<T>,
  opts: {
    systemPrompt?: string;
    temperature?: number;
    maxOutputTokens?: number;
    userId?: string | null;
    projectId?: string | null;
    cachePrompt?: boolean;
    retries?: number;
    topP?: number;
    timeoutMs?: number;
  } = {}
): Promise<T> {
  const userId = opts.userId;
  if (userId) {
    const { QuotaService } = await import("@/services/quota");
    await QuotaService.checkQuota(userId, "ai_credits");
  }

  await checkBudgetControls(opts.userId, opts.projectId);
  const { provider, model } = await getProviderForRoute(feature);
  const timeoutMs = opts.timeoutMs !== undefined ? opts.timeoutMs : 120000;
  const systemPrompt = getSystemPromptWithDate(opts.systemPrompt);

  let resultData: T;
  try {
    const res = await withTimeout(
      (signal) =>
        provider.generateStructured(model, prompt, schema, {
          temperature: opts.temperature,
          maxOutputTokens: opts.maxOutputTokens,
          systemPrompt,
          cachePrompt: opts.cachePrompt,
          retries: opts.retries,
          topP: opts.topP,
          signal,
        }),
      timeoutMs
    );
    resultData = res.data;
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw err;
    }

    const { provider: fbProvider, model: fbModel } = await getFallbackProviderAndModel(feature);
    if (fbModel !== model) {
      console.warn(`[routing] Primary structured generation failed with model ${model}. Retrying with fallback: ${fbModel}. Error:`, err instanceof Error ? err.message : err);
      const res = await withTimeout(
        (signal) =>
          fbProvider.generateStructured(fbModel, prompt, schema, {
            temperature: opts.temperature,
            maxOutputTokens: opts.maxOutputTokens,
            systemPrompt,
            cachePrompt: opts.cachePrompt,
            retries: opts.retries,
            topP: opts.topP,
            signal,
          }),
        timeoutMs
      );
      resultData = res.data;
    } else {
      throw err;
    }
  }

  if (userId) {
    const { QuotaService } = await import("@/services/quota");
    await QuotaService.deductQuota(userId, "ai_credits");
  }
  return resultData;
}

