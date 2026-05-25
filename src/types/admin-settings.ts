import type { PlatformAdminRole } from "@/constants/enums/platform-admin-role";

export interface AdminPlatformProviders {
  ahrefs_enabled: boolean;
  dataforseo_enabled: boolean;
  dataforseo_fallback_enabled: boolean;
  gemini_enabled: boolean;
  openai_enabled: boolean;
  claude_enabled: boolean;
  ahrefs_matching_terms_enabled: boolean;
  ahrefs_related_terms_enabled: boolean;
  ahrefs_search_suggestions_enabled: boolean;
  ahrefs_keyword_overview_enabled: boolean;
  ahrefs_volume_history_enabled: boolean;
  ahrefs_volume_by_country_enabled: boolean;
  ahrefs_serp_overview_enabled: boolean;
  ahrefs_organic_competitors_enabled: boolean;
  ahrefs_top_pages_enabled: boolean;
  ahrefs_organic_keywords_enabled: boolean;
  ahrefs_url_organic_keywords_enabled: boolean;
  ahrefs_domain_overview_enabled: boolean;
  ahrefs_pages_by_internal_links_enabled: boolean;
  ahrefs_crawled_pages_enabled: boolean;
  ahrefs_anchors_enabled: boolean;
  ahrefs_rank_tracker_competitors_overview_enabled: boolean;
  ahrefs_rank_tracker_competitors_pages_enabled: boolean;
}

export interface AdminPlatformLimits {
  max_keywords_per_project: number;
  max_content_generations_per_project: number;
}

export interface AdminPlatformCache {
  ttl_minutes: number;
}

export interface AdminPlatformGemini {
  default_model: string;
}

export interface AdminPlatformDebug {
  ai_logging_full_prompts: boolean;
}

export interface AdminPlatformMaintenance {
  enabled: boolean;
  message: string;
}

export interface AdminEnvKeyStatus {
  ahrefs: boolean;
  dataforseo: boolean;
  gemini: boolean;
  serper: boolean;
  clerk: boolean;
  supabase: boolean;
}

export interface AdminPlatformAdminRow {
  id: string;
  userId: string | null;
  email: string;
  role: PlatformAdminRole;
  createdBy: string | null;
  createdAt: string;
}

export interface AdminSettingsData {
  providers: AdminPlatformProviders;
  limits: AdminPlatformLimits;
  cache: AdminPlatformCache;
  gemini: AdminPlatformGemini;
  debug: AdminPlatformDebug;
  maintenance: AdminPlatformMaintenance;
  envKeys: AdminEnvKeyStatus;
  admins: AdminPlatformAdminRow[];
}

export interface AdminSettingsPatch {
  providers?: Partial<AdminPlatformProviders>;
  limits?: Partial<AdminPlatformLimits>;
  cache?: Partial<AdminPlatformCache>;
  gemini?: Partial<AdminPlatformGemini>;
  debug?: Partial<AdminPlatformDebug>;
  maintenance?: Partial<AdminPlatformMaintenance>;
}
