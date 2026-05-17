import type { ApiUsageProvider } from "@/constants/enums/usage-provider";
import {
  DEFAULT_PLATFORM_DEBUG,
  DEFAULT_PLATFORM_LIMITS,
  DEFAULT_PLATFORM_MAINTENANCE,
  DEFAULT_PLATFORM_PROVIDERS,
  mergeSettingsSection,
} from "@/lib/admin/platform-settings-defaults";
import type {
  AdminPlatformDebug,
  AdminPlatformLimits,
  AdminPlatformMaintenance,
  AdminPlatformProviders,
} from "@/types/admin-settings";

const CACHE_TTL_MS = 60_000;
const isServer = typeof window === "undefined";

type RuntimeSnapshot = {
  at: number;
  providers: AdminPlatformProviders;
  limits: AdminPlatformLimits;
  maintenance: AdminPlatformMaintenance;
  debug: AdminPlatformDebug;
};

let runtimeCache: RuntimeSnapshot | null = null;

const PROVIDER_FLAG: Record<
  Extract<ApiUsageProvider, "ahrefs" | "dataforseo" | "gemini" | "openai" | "claude">,
  keyof AdminPlatformProviders
> = {
  ahrefs: "ahrefs_enabled",
  dataforseo: "dataforseo_enabled",
  gemini: "gemini_enabled",
  openai: "openai_enabled",
  claude: "claude_enabled",
};

export class ProviderDisabledError extends Error {
  readonly provider: string;

  constructor(provider: string) {
    super(`Provider "${provider}" is disabled in platform settings.`);
    this.name = "ProviderDisabledError";
    this.provider = provider;
  }
}

export class PlatformLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformLimitError";
  }
}

async function loadRuntimeSnapshot(): Promise<RuntimeSnapshot> {
  if (runtimeCache && Date.now() - runtimeCache.at < CACHE_TTL_MS) {
    return runtimeCache;
  }

  const defaults: RuntimeSnapshot = {
    at: Date.now(),
    providers: DEFAULT_PLATFORM_PROVIDERS,
    limits: DEFAULT_PLATFORM_LIMITS,
    maintenance: DEFAULT_PLATFORM_MAINTENANCE,
    debug: DEFAULT_PLATFORM_DEBUG,
  };

  if (!isServer) return defaults;

  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { data, error } = await getSupabaseAdmin()
      .from("platform_settings")
      .select("key, value")
      .in("key", ["providers", "limits", "maintenance", "debug"]);

    if (error) {
      console.warn("[platform_settings] runtime read failed:", error.message);
      runtimeCache = defaults;
      return defaults;
    }

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));
    const snapshot: RuntimeSnapshot = {
      at: Date.now(),
      providers: mergeSettingsSection(
        DEFAULT_PLATFORM_PROVIDERS,
        byKey.get("providers")
      ),
      limits: mergeSettingsSection(DEFAULT_PLATFORM_LIMITS, byKey.get("limits")),
      maintenance: mergeSettingsSection(
        DEFAULT_PLATFORM_MAINTENANCE,
        byKey.get("maintenance")
      ),
      debug: mergeSettingsSection(DEFAULT_PLATFORM_DEBUG, byKey.get("debug")),
    };
    runtimeCache = snapshot;
    return snapshot;
  } catch (err) {
    console.warn("[platform_settings] runtime read error:", err);
    runtimeCache = defaults;
    return defaults;
  }
}

export function invalidatePlatformRuntimeCache(): void {
  runtimeCache = null;
}

export async function getPlatformProviders(): Promise<AdminPlatformProviders> {
  return (await loadRuntimeSnapshot()).providers;
}

export async function getPlatformLimits(): Promise<AdminPlatformLimits> {
  return (await loadRuntimeSnapshot()).limits;
}

export async function getMaintenanceMode(): Promise<AdminPlatformMaintenance> {
  return (await loadRuntimeSnapshot()).maintenance;
}

export async function isAiDebugLoggingEnabled(): Promise<boolean> {
  const debug = (await loadRuntimeSnapshot()).debug;
  return Boolean(debug.ai_logging_full_prompts);
}

export async function isProviderEnabled(
  provider: keyof typeof PROVIDER_FLAG
): Promise<boolean> {
  const providers = await getPlatformProviders();
  return Boolean(providers[PROVIDER_FLAG[provider]]);
}

export async function assertProviderEnabled(
  provider: keyof typeof PROVIDER_FLAG
): Promise<void> {
  if (!(await isProviderEnabled(provider))) {
    throw new ProviderDisabledError(provider);
  }
}

export async function assertProjectKeywordCapacity(projectId: string): Promise<void> {
  const limits = await getPlatformLimits();
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const { count, error } = await getSupabaseAdmin()
    .from("keywords")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  if (error) throw new Error(error.message);
  if ((count ?? 0) >= limits.max_keywords_per_project) {
    throw new PlatformLimitError(
      `Keyword limit reached for this project (${limits.max_keywords_per_project} max).`
    );
  }
}

export async function assertProjectContentCapacity(projectId: string): Promise<void> {
  const limits = await getPlatformLimits();
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const { count, error } = await getSupabaseAdmin()
    .from("blogs")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  if (error) throw new Error(error.message);
  if ((count ?? 0) >= limits.max_content_generations_per_project) {
    throw new PlatformLimitError(
      `Content generation limit reached for this project (${limits.max_content_generations_per_project} max).`
    );
  }
}
