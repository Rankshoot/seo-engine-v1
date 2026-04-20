-- Run once in Supabase SQL editor to add DataForSEO metrics (competition + intent)
-- to existing keyword rows. Safe to re-run.
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS competition_level TEXT DEFAULT '';
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS intent TEXT DEFAULT '';
