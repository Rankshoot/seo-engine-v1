import type {
  AdminPlatformCache,
  AdminPlatformDebug,
  AdminPlatformGemini,
  AdminPlatformLimits,
  AdminPlatformMaintenance,
  AdminPlatformProviders,
} from "@/types/admin-settings";

export const DEFAULT_PLATFORM_PROVIDERS: AdminPlatformProviders = {
  ahrefs_enabled: true,
  dataforseo_enabled: true,
  dataforseo_fallback_enabled: true,
  gemini_enabled: true,
  openai_enabled: false,
  claude_enabled: false,
};

export const DEFAULT_PLATFORM_LIMITS: AdminPlatformLimits = {
  max_keywords_per_project: 500,
  max_content_generations_per_project: 100,
};

export const DEFAULT_PLATFORM_CACHE: AdminPlatformCache = {
  ttl_minutes: 1440,
};

export const DEFAULT_PLATFORM_GEMINI: AdminPlatformGemini = {
  default_model: "gemini-flash-latest",
};

export const DEFAULT_PLATFORM_DEBUG: AdminPlatformDebug = {
  ai_logging_full_prompts: false,
};

export const DEFAULT_PLATFORM_MAINTENANCE: AdminPlatformMaintenance = {
  enabled: false,
  message: "",
};

export function mergeSettingsSection<T>(defaults: T, stored: unknown): T {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return defaults;
  return { ...defaults, ...(stored as Partial<T>) };
}
