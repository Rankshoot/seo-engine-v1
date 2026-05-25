-- Add competitor ranking position and search intent flags to keyword_gaps.
-- These are populated from Ahrefs organic-keywords data during competitor benchmarking.

ALTER TABLE keyword_gaps
  ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT NULL;

ALTER TABLE keyword_gaps
  ADD COLUMN IF NOT EXISTS is_informational BOOLEAN DEFAULT FALSE;

ALTER TABLE keyword_gaps
  ADD COLUMN IF NOT EXISTS is_navigational BOOLEAN DEFAULT FALSE;

ALTER TABLE keyword_gaps
  ADD COLUMN IF NOT EXISTS is_commercial BOOLEAN DEFAULT FALSE;

ALTER TABLE keyword_gaps
  ADD COLUMN IF NOT EXISTS is_transactional BOOLEAN DEFAULT FALSE;

ALTER TABLE keyword_gaps
  ADD COLUMN IF NOT EXISTS is_branded BOOLEAN DEFAULT FALSE;
