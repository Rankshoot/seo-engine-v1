-- ============================================================
-- SEO Engine – Supabase Schema
-- Run this entire file in your Supabase SQL Editor (once)
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  company TEXT NOT NULL,
  niche TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  target_region TEXT NOT NULL DEFAULT 'us',
  target_language TEXT NOT NULL DEFAULT 'en',
  description TEXT DEFAULT '',
  ahrefs_rank_tracker_project_id BIGINT DEFAULT NULL,
  last_benchmarked_competitor_snapshot TEXT DEFAULT NULL,
  -- Strapi CMS integration (per-project credentials). See supabase-migration-strapi.sql.
  strapi_base_url  TEXT DEFAULT NULL,
  strapi_api_token TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_competitors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cached result of scraping the user's own site + competitors. One row per project.
-- Regenerated on demand when the user clicks "Refresh brief".
CREATE TABLE IF NOT EXISTS project_briefs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  scraped_urls TEXT[] DEFAULT '{}',
  scraped_chars INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id)
);

-- Per-blog Content Health audit results. One row per (project, url).
CREATE TABLE IF NOT EXISTS blog_audits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT DEFAULT '',
  word_count INTEGER DEFAULT 0,
  health_score INTEGER DEFAULT 0,
  severity TEXT DEFAULT 'low',
  primary_keyword TEXT DEFAULT '',
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Mirrors analysis.page_status for lightweight coverage queries.
  page_status TEXT NOT NULL DEFAULT 'ok',
  scraped_chars INTEGER DEFAULT 0,
  scraped_markdown TEXT,
  error TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, url)
);

CREATE TABLE IF NOT EXISTS keywords (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  volume INTEGER DEFAULT 0,
  kd INTEGER DEFAULT 0,
  cpc NUMERIC(10,2) DEFAULT 0,
  trend TEXT DEFAULT '+0%',
  monthly_searches JSONB DEFAULT '[]',
  secondary_keywords TEXT[] DEFAULT '{}',
  ai_score INTEGER DEFAULT 0,
  keyword_analysis_score INTEGER DEFAULT 0,
  relevance_score INTEGER DEFAULT 0,
  business_fit_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  source_url TEXT DEFAULT '',
  gap_competitor TEXT DEFAULT '',
  competition_level TEXT DEFAULT '',
  intent TEXT DEFAULT '',
  funnel_stage TEXT DEFAULT '',
  -- Keyword-discovery pipeline columns. See supabase-migration-keyword-discovery-pipeline.sql.
  source_type TEXT DEFAULT 'industry',
  ai_source TEXT DEFAULT '',
  source_competitors TEXT[] DEFAULT '{}',
  source_urls TEXT[] DEFAULT '{}',
  parent_topic TEXT DEFAULT '',
  traffic_potential INTEGER DEFAULT 0,
  intents JSONB DEFAULT '{}'::jsonb,
  -- Keyword modal columns. See supabase-migration-keyword-modal-tables.sql.
  --   normalized_keyword is a STORED generated column == LOWER(TRIM(keyword)).
  --   Postgres maintains it automatically; never assign it from app code.
  normalized_keyword TEXT GENERATED ALWAYS AS (LOWER(TRIM(keyword))) STORED,
  global_volume INTEGER DEFAULT 0,
  parent_volume INTEGER DEFAULT 0,
  serp_features JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, keyword)
);

-- Older databases may already have `keywords` without this column; `CREATE TABLE IF NOT EXISTS`
-- does not add new columns. Required before `idx_keywords_project_normalized` below.
ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS normalized_keyword TEXT
  GENERATED ALWAYS AS (LOWER(TRIM(keyword))) STORED;

-- Older databases may already have `keywords` without funnel_stage; `CREATE TABLE IF NOT EXISTS`
-- does not add new columns. See supabase-migration-keyword-funnel-stage.sql.
ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS funnel_stage TEXT DEFAULT '';

-- Gemini deep-evaluation columns. See supabase-migration-keyword-ai-eval.sql.
ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS ai_eval_score INTEGER DEFAULT NULL;
ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS ai_eval_data JSONB DEFAULT NULL;
ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS ai_eval_at TIMESTAMPTZ DEFAULT NULL;

-- Gemini AI eval for competitor keyword gaps. See supabase-migration-keyword-gaps-ai-eval.sql.
ALTER TABLE keyword_gaps
  ADD COLUMN IF NOT EXISTS ai_eval_score INTEGER DEFAULT NULL;
ALTER TABLE keyword_gaps
  ADD COLUMN IF NOT EXISTS ai_eval_data JSONB DEFAULT NULL;
ALTER TABLE keyword_gaps
  ADD COLUMN IF NOT EXISTS ai_eval_at TIMESTAMPTZ DEFAULT NULL;

-- Ahrefs ranking position and search intent flags. See supabase-migration-keyword-gaps-intents.sql.
ALTER TABLE keyword_gaps
  ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT NULL;
ALTER TABLE keyword_gaps
  ADD COLUMN IF NOT EXISTS is_informational BOOLEAN DEFAULT FALSE;
ALTER TABLE keyword_gaps
  ADD COLUMN IF NOT EXISTS is_navigational BOOLEAN DEFAULT FALSE;
ALTER TABLE keyword_gaps
  ADD COLUMN IF NOT EXISTS is_commercial BOOLEAN DEFAULT FALSE;
ALTER TABLE keyword_gaps
  ADD COLUMN IF NOT EXISTS is_transactional BOOLEAN DEFAULT FALSE;
ALTER TABLE keyword_gaps
  ADD COLUMN IF NOT EXISTS is_branded BOOLEAN DEFAULT FALSE;

-- One-row-per-keyword modal payload (overview / history / by-country / SERP).
CREATE TABLE IF NOT EXISTS keyword_details (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id UUID NOT NULL UNIQUE REFERENCES keywords(id) ON DELETE CASCADE,
  overview JSONB NOT NULL DEFAULT '{}'::jsonb,
  volume_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  volume_by_country JSONB NOT NULL DEFAULT '[]'::jsonb,
  serp_top_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_ranking_result JSONB,

  last_fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Many-rows-per-keyword "ideas" pool for blog-generation coverage.
CREATE TABLE IF NOT EXISTS keyword_ideas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id UUID NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (
    type IN ('terms_match', 'questions', 'also_rank_for', 'also_talk_about', 'search_suggestion')
  ),
  keyword TEXT NOT NULL,
  volume INTEGER DEFAULT 0,
  difficulty INTEGER DEFAULT 0,
  cpc NUMERIC(10,2) DEFAULT 0,
  traffic_potential INTEGER DEFAULT 0,
  intents JSONB DEFAULT '{}'::jsonb,
  parent_topic TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calendar_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  keyword_id UUID REFERENCES keywords(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  title TEXT NOT NULL,
  article_type TEXT NOT NULL DEFAULT 'How-to Guide',
  slug TEXT NOT NULL,
  focus_keyword TEXT NOT NULL,
  secondary_keywords TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'scheduled',
  content_health_audit JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blogs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID REFERENCES calendar_entries(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  meta_description TEXT DEFAULT '',
  word_count INTEGER DEFAULT 0,
  target_keyword TEXT DEFAULT '',
  article_type TEXT DEFAULT '',
  slug TEXT DEFAULT '',
  status TEXT DEFAULT 'generated' CHECK (status IN ('generated', 'approved', 'published')),
  research_sources INTEGER DEFAULT 0,
  external_links TEXT[] DEFAULT '{}',
  internal_links TEXT[] DEFAULT '{}',
  in_articles_library BOOLEAN NOT NULL DEFAULT false,
  source_url TEXT DEFAULT '',
  repair_notes TEXT[] DEFAULT '{}',
  deep_analysis JSONB,
  deep_analysis_score INTEGER,
  deep_analysis_updated_at TIMESTAMPTZ,
  -- Content Studio (phase 5) — see supabase-migration-content-studio.sql
  content_type TEXT NOT NULL DEFAULT 'blog'
    CHECK (content_type IN ('blog', 'ebook', 'whitepaper', 'linkedin')),
  content_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Strapi CMS sync state. See supabase-migration-strapi.sql.
  strapi_document_id TEXT        DEFAULT NULL,
  strapi_sync_status TEXT        DEFAULT NULL,
  strapi_sync_error  TEXT        DEFAULT NULL,
  strapi_synced_at   TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cached SERP competitor comparison for View Blog → Deep Analysis.
CREATE TABLE IF NOT EXISTS blog_deep_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  blog_id UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_keyword TEXT NOT NULL DEFAULT '',
  analysis JSONB NOT NULL DEFAULT jsonb_build_object(),
  trace JSONB NOT NULL DEFAULT jsonb_build_array(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blog_id)
);
-- Older databases may already have `blogs` without these columns; CREATE TABLE IF NOT EXISTS
-- never adds new columns. See supabase-migration-content-studio.sql.
ALTER TABLE blogs
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'blog';
ALTER TABLE blogs
  ADD COLUMN IF NOT EXISTS content_data JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================
-- Competitor Benchmarking Engine (phase 5)
-- See supabase-migration-competitor-benchmark.sql for details.
-- ============================================================
CREATE TABLE IF NOT EXISTS competitors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  title TEXT DEFAULT '',
  rank_score INTEGER DEFAULT 0,
  pages_scraped INTEGER DEFAULT 0,
  avg_word_count INTEGER DEFAULT 0,
  avg_h2 NUMERIC(6,2) DEFAULT 0,
  avg_h3 NUMERIC(6,2) DEFAULT 0,
  avg_images NUMERIC(6,2) DEFAULT 0,
  avg_internal_links NUMERIC(6,2) DEFAULT 0,
  avg_external_links NUMERIC(6,2) DEFAULT 0,
  faq_pages_pct INTEGER DEFAULT 0,
  top_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations TEXT[] DEFAULT '{}',
  last_benchmarked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, domain)
);

CREATE TABLE IF NOT EXISTS competitor_keywords (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'primary',
  freq INTEGER DEFAULT 1,
  source_url TEXT DEFAULT '',
  source_title TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS keyword_gaps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  gap_type TEXT NOT NULL DEFAULT 'missing',
  opportunity_score INTEGER DEFAULT 0,
  volume INTEGER DEFAULT 0,
  kd INTEGER DEFAULT 0,
  trend TEXT DEFAULT '+0%',
  trend_pct NUMERIC(6,2) DEFAULT 0,
  competitor_weakness INTEGER DEFAULT 0,
  top_competitor_domain TEXT DEFAULT '',
  top_competitor_url TEXT DEFAULT '',
  reasoning TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, keyword)
);

-- Cached Ahrefs Site Explorer snapshot per project (overview, organic
-- competitors, top pages). Refreshed manually by the user — never on a
-- normal page load.
CREATE TABLE IF NOT EXISTS project_site_explorer (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  target TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT 'us',
  overview JSONB,
  competitors JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_project_briefs_project_id ON project_briefs(project_id);
CREATE INDEX IF NOT EXISTS idx_blog_audits_project_id ON blog_audits(project_id);
CREATE INDEX IF NOT EXISTS idx_blog_audits_health_score ON blog_audits(health_score);
CREATE INDEX IF NOT EXISTS idx_keywords_project_id ON keywords(project_id);
CREATE INDEX IF NOT EXISTS idx_keywords_status ON keywords(status);
CREATE INDEX IF NOT EXISTS idx_keywords_source_type ON keywords(source_type);
-- Fails with 23505 if case/whitespace variants of the same phrase exist.
-- Run `supabase-migration-dedupe-keywords-normalized.sql` first, then re-run this line.
CREATE UNIQUE INDEX IF NOT EXISTS idx_keywords_project_normalized
  ON keywords(project_id, normalized_keyword);
CREATE INDEX IF NOT EXISTS idx_keyword_ideas_keyword_id_type
  ON keyword_ideas(keyword_id, type);
CREATE INDEX IF NOT EXISTS idx_keyword_ideas_keyword
  ON keyword_ideas(keyword);
CREATE INDEX IF NOT EXISTS idx_calendar_project_id ON calendar_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_calendar_date ON calendar_entries(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_blogs_entry_id ON blogs(entry_id);
CREATE INDEX IF NOT EXISTS idx_blogs_project_id ON blogs(project_id);
CREATE INDEX IF NOT EXISTS idx_blog_deep_analyses_project_id ON blog_deep_analyses(project_id);
CREATE INDEX IF NOT EXISTS idx_blogs_content_type
  ON blogs(project_id, content_type, status);
CREATE INDEX IF NOT EXISTS idx_competitors_project_id ON competitors(project_id);
CREATE INDEX IF NOT EXISTS idx_competitor_keywords_project_id ON competitor_keywords(project_id);
CREATE INDEX IF NOT EXISTS idx_competitor_keywords_competitor_id ON competitor_keywords(competitor_id);
CREATE INDEX IF NOT EXISTS idx_keyword_gaps_project_id ON keyword_gaps(project_id);
CREATE INDEX IF NOT EXISTS idx_keyword_gaps_score ON keyword_gaps(opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_project_site_explorer_project_id
  ON project_site_explorer(project_id);

-- Cached DataForSEO Google Ads keywords-for-site payload per project (domain tab).
-- Refreshed only via explicit user action — never on a normal GET.
CREATE TABLE IF NOT EXISTS project_domain_ads_keywords (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  target_domain TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT 'us',
  language TEXT NOT NULL DEFAULT 'en',
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Admin panel (platform RBAC, usage/error logging, audit, settings)
-- See supabase-migration-admin-panel.sql for incremental apply.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin'
    CHECK (role IN ('owner', 'admin', 'support')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_admins_email_active
  ON platform_admins (LOWER(email))
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_platform_admins_user_id_active
  ON platform_admins (user_id)
  WHERE revoked_at IS NULL AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_admins_role_active
  ON platform_admins (role)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS api_usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  feature TEXT NOT NULL DEFAULT '',
  endpoint TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'error', 'cached')),
  latency_ms INTEGER,
  cached BOOLEAN NOT NULL DEFAULT false,
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  credits_used NUMERIC(14, 4),
  estimated_cost_usd NUMERIC(14, 6),
  error_message TEXT DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  feature TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  prompt_summary TEXT NOT NULL DEFAULT '',
  prompt_full TEXT,
  response_full TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  estimated_cost_usd NUMERIC(14, 6),
  status TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'error')),
  error_message TEXT DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_error_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  feature TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON api_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_created ON api_usage_logs (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_project_created ON api_usage_logs (project_id, created_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_provider_created ON api_usage_logs (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_feature_created ON api_usage_logs (feature, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_status_created ON api_usage_logs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_cache_hit ON api_usage_logs (provider, cache_hit, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON ai_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_created ON ai_usage_logs (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_project_created ON ai_usage_logs (project_id, created_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_feature_created ON ai_usage_logs (feature, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_model_created ON ai_usage_logs (model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_status_created ON ai_usage_logs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_error_logs_created_at ON system_error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_error_logs_user_created ON system_error_logs (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_error_logs_project_created ON system_error_logs (project_id, created_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_error_logs_provider_created ON system_error_logs (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_error_logs_feature_created ON system_error_logs (feature, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_error_logs_status_created ON system_error_logs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_error_logs_severity_created ON system_error_logs (severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_created ON admin_audit_logs (admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action_created ON admin_audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target ON admin_audit_logs (target_type, target_id, created_at DESC);

-- ── User Approval System ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_approvals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clerk_user_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'revoked')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  review_notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_approvals_clerk_user_id ON user_approvals(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_approvals_status ON user_approvals(status);
CREATE INDEX IF NOT EXISTS idx_user_approvals_email ON user_approvals(email);
