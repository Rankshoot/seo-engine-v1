-- Denormalize latest deep analysis score onto `blogs` for persistence and list UI.
-- Run once in Supabase SQL editor. Safe to re-run.

ALTER TABLE blogs ADD COLUMN IF NOT EXISTS deep_analysis_score INTEGER;
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS deep_analysis_updated_at TIMESTAMPTZ;

-- Backfill from existing cached rows (one-time sync for projects that already ran Deep Analysis).
UPDATE blogs b
SET
  deep_analysis_score = (da.analysis->>'deepAnalysisScore')::integer,
  deep_analysis_updated_at = da.updated_at
FROM blog_deep_analyses da
WHERE da.blog_id = b.id
  AND da.analysis ? 'deepAnalysisScore';

NOTIFY pgrst, 'reload schema';
