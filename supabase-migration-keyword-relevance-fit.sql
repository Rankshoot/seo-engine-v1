-- Run once in Supabase SQL editor. Adds the two new per-keyword scorers
-- introduced by the relevance/business-fit pipeline upgrade. Safe to re-run.
ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS relevance_score INTEGER DEFAULT 0;

ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS business_fit_score INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_keywords_business_fit_score
  ON keywords(business_fit_score DESC);
