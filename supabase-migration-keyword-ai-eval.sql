-- Migration: Add Gemini deep-evaluation columns to keywords table.
-- Safe to run multiple times (idempotent via ADD COLUMN IF NOT EXISTS).

ALTER TABLE keywords ADD COLUMN IF NOT EXISTS ai_eval_score INTEGER DEFAULT NULL;
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS ai_eval_data  JSONB    DEFAULT NULL;
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS ai_eval_at    TIMESTAMPTZ DEFAULT NULL;
