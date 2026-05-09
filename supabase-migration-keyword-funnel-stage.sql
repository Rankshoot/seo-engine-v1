-- Idempotent: add marketing funnel stage for keywords (TOFU | MOFU | BOFU).
-- Populated by Gemini on "AI intent" refresh; otherwise filled via intent+phrase heuristics on write.

ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS funnel_stage TEXT DEFAULT '';

COMMENT ON COLUMN keywords.funnel_stage IS 'TOFU|MOFU|BOFU — from Gemini batch intent refresh or heuristic on insert.';
