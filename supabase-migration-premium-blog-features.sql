-- Migration: Per-user credit limits for premium blog generation features
-- Features: Ahrefs H2 keyword data, Ahrefs FAQ keyword data, Deep Analysis (DataForSEO)
-- Run in Supabase SQL editor

ALTER TABLE user_quotas
  ADD COLUMN IF NOT EXISTS limit_ahrefs_h2s    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS used_ahrefs_h2s     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_ahrefs_h2s INTEGER,
  ADD COLUMN IF NOT EXISTS limit_ahrefs_faqs   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS used_ahrefs_faqs    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_ahrefs_faqs INTEGER,
  ADD COLUMN IF NOT EXISTS limit_deep_analysis  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS used_deep_analysis   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_deep_analysis INTEGER;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
