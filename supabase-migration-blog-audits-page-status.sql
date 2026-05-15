-- Denormalized page_status for cheap coverage aggregates (pagination).
-- Safe to run multiple times.

ALTER TABLE blog_audits
  ADD COLUMN IF NOT EXISTS page_status text NOT NULL DEFAULT 'ok';

UPDATE blog_audits
SET page_status = COALESCE(NULLIF(trim(analysis->>'page_status'), ''), 'ok')
WHERE page_status IS NULL OR page_status = 'ok';

COMMENT ON COLUMN blog_audits.page_status IS 'Mirrors analysis.page_status (ok|broken|redirected|empty) for SQL-friendly Content Health stats.';
