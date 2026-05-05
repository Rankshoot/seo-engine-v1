-- Optional provenance when a keyword was approved via the AI assistant (before/during calendar).
-- Idempotent — safe on existing databases.

ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS ai_source TEXT DEFAULT '';
