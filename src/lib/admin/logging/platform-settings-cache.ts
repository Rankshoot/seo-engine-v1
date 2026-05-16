const CACHE_TTL_MS = 60_000;
const isServer = typeof window === "undefined";

let debugAiLoggingCache: { value: boolean; at: number } | null = null;

interface DebugSettings {
  ai_logging_full_prompts?: boolean;
}

/**
 * Whether to persist full prompt/response in `ai_usage_logs`.
 * Cached 60s to avoid a DB read on every Gemini call.
 */
export async function isAiDebugLoggingEnabled(): Promise<boolean> {
  if (!isServer) return false;

  if (debugAiLoggingCache && Date.now() - debugAiLoggingCache.at < CACHE_TTL_MS) {
    return debugAiLoggingCache.value;
  }

  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { data, error } = await getSupabaseAdmin()
      .from("platform_settings")
      .select("value")
      .eq("key", "debug")
      .maybeSingle();

    if (error) {
      console.warn("[platform_settings] debug read failed:", error.message);
      return false;
    }

    const value = (data?.value ?? {}) as DebugSettings;
    const enabled = Boolean(value.ai_logging_full_prompts);
    debugAiLoggingCache = { value: enabled, at: Date.now() };
    return enabled;
  } catch (err) {
    console.warn("[platform_settings] debug read error:", err);
    return false;
  }
}

/** Call after updating debug settings so the next log sees the new value. */
export function invalidatePlatformSettingsCache(): void {
  debugAiLoggingCache = null;
}
