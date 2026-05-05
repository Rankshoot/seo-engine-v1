-- Run once in Supabase SQL editor if keywords table already exists without these columns.
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT '';
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS gap_competitor TEXT DEFAULT '';
-- Provenance for keyword rows (industry vs competitor_gap vs quick_win).
-- Also required for nested PostgREST selects like keywords(source_type,...).
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'industry';
CREATE INDEX IF NOT EXISTS idx_keywords_source_type ON keywords(source_type);
