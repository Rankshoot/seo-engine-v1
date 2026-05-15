-- Idempotent: add marketing funnel stage for keywords (TOFU | MOFU | BOFU).
-- Populated by Gemini on "AI intent" refresh; otherwise filled via intent+phrase heuristics on write.
--
-- Run this in the Supabase SQL Editor if you see:
--   Could not find the 'funnel_stage' column of 'keywords' in the schema cache

ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS funnel_stage TEXT DEFAULT '';

COMMENT ON COLUMN keywords.funnel_stage IS 'TOFU|MOFU|BOFU — from Gemini batch intent refresh or heuristic on insert.';

-- Refresh PostgREST schema cache so the API sees the new column immediately.
NOTIFY pgrst, 'reload schema';
