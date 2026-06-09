import type {
  AdminPlatformCache,
  AdminPlatformDebug,
  AdminPlatformGemini,
  AdminPlatformLimits,
  AdminPlatformMaintenance,
  AdminPlatformProviders,
  AdminPlatformRouting,
  AdminPlatformCostControls,
} from "@/types/admin-settings";

export const DEFAULT_PLATFORM_PROVIDERS: AdminPlatformProviders = {
  ahrefs_enabled: true,
  dataforseo_enabled: true,
  dataforseo_fallback_enabled: true,
  gemini_enabled: true,
  openai_enabled: true,
  claude_enabled: true,
  // ── Active Ahrefs endpoints (cost-optimised set) ──────────────────────────
  // Keyword discovery: matching-terms + related-terms only
  ahrefs_matching_terms_enabled: true,
  ahrefs_related_terms_enabled: true,
  ahrefs_search_suggestions_enabled: false,
  ahrefs_keyword_overview_enabled: false,
  ahrefs_volume_history_enabled: false,
  ahrefs_volume_by_country_enabled: false,
  ahrefs_serp_overview_enabled: false,
  ahrefs_organic_competitors_enabled: true,
  ahrefs_top_pages_enabled: false,
  ahrefs_organic_keywords_enabled: true,
  ahrefs_url_organic_keywords_enabled: false,
  ahrefs_domain_overview_enabled: false,
  ahrefs_pages_by_internal_links_enabled: false,
  ahrefs_crawled_pages_enabled: false,
  ahrefs_anchors_enabled: false,
  ahrefs_rank_tracker_competitors_overview_enabled: false,
  ahrefs_rank_tracker_competitors_pages_enabled: false,
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

export const DEFAULT_PLATFORM_ROUTING: AdminPlatformRouting = {
  blog: "claude-sonnet-4-6",
  ebook: "claude-sonnet-4-6",
  whitepaper: "claude-sonnet-4-6",
  linkedin: "claude-sonnet-4-6",
  assistant: "gemini-3-pro-preview",
  fallback: "gemini-2.5-pro",
};

export const DEFAULT_PLATFORM_COST_CONTROLS: AdminPlatformCostControls = {
  global_monthly_limit_usd: 500.00,
  global_daily_limit_usd: 50.00,
  project_monthly_limit_usd: 50.00,
  user_monthly_limit_usd: 25.00,
  soft_limit_percent: 80.0,
  warning_threshold_usd: 10.00,
};

export function mergeSettingsSection<T>(defaults: T, stored: unknown): T {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return defaults;
  return { ...defaults, ...(stored as Partial<T>) };
}
