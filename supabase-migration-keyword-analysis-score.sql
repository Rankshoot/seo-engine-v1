-- Run once in Supabase SQL editor to add the composite keyword-analysis score
-- produced by the upgraded DataForSEO pipeline. Safe to re-run.
ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS keyword_analysis_score INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_keywords_keyword_analysis_score
  ON keywords(keyword_analysis_score DESC);
