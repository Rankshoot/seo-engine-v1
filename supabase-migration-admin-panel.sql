-- SerpCraft Admin Panel — platform RBAC, usage/error logging, audit trail, settings.
-- Run once in Supabase SQL Editor. Safe to re-run (idempotent).
-- Step 1 of admin panel: schema only. Application code wires in later steps.

-- ── Platform admins (roles + soft revoke) ───────────────────────────────────
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

INSERT INTO platform_admins (email, role, created_by, user_id)
SELECT 'padmanabhpaliwal23@gmail.com', 'owner', 'bootstrap', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM platform_admins
  WHERE LOWER(email) = 'padmanabhpaliwal23@gmail.com' AND revoked_at IS NULL
);

-- ── API usage logs (cost-normalized) ──────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at
  ON api_usage_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_created
  ON api_usage_logs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_project_created
  ON api_usage_logs (project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_provider_created
  ON api_usage_logs (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_feature_created
  ON api_usage_logs (feature, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_status_created
  ON api_usage_logs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_cache_hit
  ON api_usage_logs (provider, cache_hit, created_at DESC);

-- ── AI usage logs (redacted by default) ───────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at
  ON ai_usage_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_created
  ON ai_usage_logs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_project_created
  ON ai_usage_logs (project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_feature_created
  ON ai_usage_logs (feature, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_model_created
  ON ai_usage_logs (model, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_status_created
  ON ai_usage_logs (status, created_at DESC);

-- ── System error logs ─────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_system_error_logs_created_at
  ON system_error_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_error_logs_user_created
  ON system_error_logs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_system_error_logs_project_created
  ON system_error_logs (project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_system_error_logs_provider_created
  ON system_error_logs (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_error_logs_feature_created
  ON system_error_logs (feature, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_error_logs_status_created
  ON system_error_logs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_error_logs_severity_created
  ON system_error_logs (severity, created_at DESC);

-- ── Admin audit logs (every sensitive mutation) ───────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
  ON admin_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_created
  ON admin_audit_logs (admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action_created
  ON admin_audit_logs (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target
  ON admin_audit_logs (target_type, target_id, created_at DESC);

-- ── Platform settings (key-value, no secrets) ───────────────────────────────
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

INSERT INTO platform_settings (key, value) VALUES
  ('providers', '{
    "ahrefs_enabled": true,
    "dataforseo_enabled": true,
    "dataforseo_fallback_enabled": true,
    "gemini_enabled": true,
    "openai_enabled": false,
    "claude_enabled": false
  }'::jsonb),
  ('cache', '{"ttl_minutes": 1440}'::jsonb),
  ('limits', '{
    "max_keywords_per_project": 500,
    "max_content_generations_per_project": 100
  }'::jsonb),
  ('gemini', '{"default_model": "gemini-flash-latest"}'::jsonb),
  ('debug', '{"ai_logging_full_prompts": false}'::jsonb),
  ('maintenance', '{"enabled": false, "message": ""}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── RLS: deny direct client access; server uses service role ──────────────────
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
