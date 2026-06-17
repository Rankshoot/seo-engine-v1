-- Image model selection per-user and per-plan.
-- Run once in Supabase SQL Editor. Safe to re-run (idempotent).

-- Add image_model override column to user_quotas
ALTER TABLE user_quotas
  ADD COLUMN IF NOT EXISTS image_model TEXT DEFAULT NULL;

-- Add default_image_model column to subscription_plans
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS default_image_model TEXT DEFAULT NULL;

-- Index for fast lookup (optional)
CREATE INDEX IF NOT EXISTS idx_user_quotas_image_model
  ON user_quotas (image_model)
  WHERE image_model IS NOT NULL;
