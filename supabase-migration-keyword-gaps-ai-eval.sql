-- Migration: Add Gemini AI evaluation columns to keyword_gaps table.
-- Safe to run multiple times (idempotent via ADD COLUMN IF NOT EXISTS).

ALTER TABLE keyword_gaps ADD COLUMN IF NOT EXISTS ai_eval_score INTEGER   DEFAULT NULL;
ALTER TABLE keyword_gaps ADD COLUMN IF NOT EXISTS ai_eval_data  JSONB     DEFAULT NULL;
ALTER TABLE keyword_gaps ADD COLUMN IF NOT EXISTS ai_eval_at    TIMESTAMPTZ DEFAULT NULL;
