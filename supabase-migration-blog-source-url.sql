-- Adds `source_url` + `repair_notes` to the `blogs` table so we can track
-- which existing website page a generated blog was repaired from AND what
-- the LLM actually changed during the repair.
-- Run once in the Supabase SQL editor. Safe to re-run.

ALTER TABLE blogs ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT '';
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS repair_notes TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_blogs_source_url ON blogs(source_url);

NOTIFY pgrst, 'reload schema';
