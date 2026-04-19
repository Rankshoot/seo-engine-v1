-- Run once in Supabase SQL editor if keywords table already exists without these columns.
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT '';
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS gap_competitor TEXT DEFAULT '';
