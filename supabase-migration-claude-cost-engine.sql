-- SerpCraft / Rankit AI Content Engine Migration
-- Step 1: Alter ai_usage_logs to add cache tracking and cost savings columns
ALTER TABLE ai_usage_logs 
  ADD COLUMN IF NOT EXISTS tokens_cached_read INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_cached_write INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_savings_usd NUMERIC(14, 6) DEFAULT 0.000000;

-- Step 2: Enable Claude by default in providers platform_settings
UPDATE platform_settings 
SET value = value || '{"claude_enabled": true}'::jsonb 
WHERE key = 'providers';

-- Step 3: Insert default routing and cost controls keys
INSERT INTO platform_settings (key, value) VALUES
  ('routing', '{
    "blog": "claude-sonnet-4-6",
    "ebook": "claude-sonnet-4-6",
    "whitepaper": "claude-sonnet-4-6",
    "linkedin": "claude-sonnet-4-6",
    "assistant": "claude-sonnet-4-6",
    "fallback": "gemini-2.5-pro"
  }'::jsonb),
  ('cost_controls', '{
    "global_monthly_limit_usd": 500.00,
    "global_daily_limit_usd": 50.00,
    "project_monthly_limit_usd": 50.00,
    "user_monthly_limit_usd": 25.00,
    "soft_limit_percent": 80.0,
    "warning_threshold_usd": 10.00
  }'::jsonb)
ON CONFLICT (key) DO UPDATE 
SET value = EXCLUDED.value;

-- Reload Schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
