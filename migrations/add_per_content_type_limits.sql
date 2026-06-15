-- ============================================================
-- Migration: Add per-content-type limits to subscription_plans
--            and user_quotas tables
-- Run this in your Supabase SQL editor
-- ============================================================

-- 1. Add per-content-type limit columns to subscription_plans
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS limit_blogs INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS limit_ebooks INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limit_whitepapers INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limit_linkedin INTEGER NOT NULL DEFAULT 5;

-- 2. Add per-content-type limit + usage + override columns to user_quotas
ALTER TABLE user_quotas
  ADD COLUMN IF NOT EXISTS limit_blogs INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS used_blogs INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_blogs INTEGER,
  ADD COLUMN IF NOT EXISTS limit_ebooks INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS used_ebooks INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_ebooks INTEGER,
  ADD COLUMN IF NOT EXISTS limit_whitepapers INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS used_whitepapers INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_whitepapers INTEGER,
  ADD COLUMN IF NOT EXISTS limit_linkedin INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS used_linkedin INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_linkedin INTEGER;

-- 3. Seed free plan defaults (update existing row)
UPDATE subscription_plans SET
  limit_blogs = 5,
  limit_ebooks = 0,
  limit_whitepapers = 0,
  limit_linkedin = 5
WHERE id = 'free';

-- 4. Always-log AI prompts setting in platform_settings (if you want full prompts by default)
-- This is optional. Set to true to store full prompts in ai_usage_logs.
-- UPDATE platform_settings SET value = 'true' WHERE key = 'debug.ai_logging_full_prompts';

-- 5. Seed per-content-type limits for all existing user_quotas rows
-- based on their current plan's new limits
UPDATE user_quotas uq
SET
  limit_blogs = sp.limit_blogs,
  limit_ebooks = sp.limit_ebooks,
  limit_whitepapers = sp.limit_whitepapers,
  limit_linkedin = sp.limit_linkedin
FROM users u
JOIN subscription_plans sp ON sp.id = u.plan_id
WHERE uq.user_id = u.id;
