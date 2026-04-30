-- Run once in Supabase SQL Editor. Adds the per-keyword provenance + Ahrefs
-- enrichment columns introduced by the keyword-discovery pipeline
-- (`runKeywordDiscoveryPipeline`). Idempotent: safe to re-run.

-- Where did this keyword come from?
--   industry        -> seed-driven Keywords Explorer (legacy + future)
--   competitor_gap  -> ranking on a competitor domain but not on ours
--   quick_win       -> own organic keyword sitting at positions 4–20
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'industry';

-- Multiple competitors can rank for the same gap keyword. Keep the full set
-- (sorted by traffic) so the UI can show "X competitors rank for this".
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS source_competitors TEXT[] DEFAULT '{}';

-- The exact ranking page URL for each `source_competitors` entry, in the
-- same order — used to deep-link into "the page beating us".
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS source_urls TEXT[] DEFAULT '{}';

-- Ahrefs Keywords Explorer / overview enrichment fields.
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS parent_topic TEXT DEFAULT '';
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS traffic_potential INTEGER DEFAULT 0;
-- Multi-intent flags (informational / commercial / transactional / branded / …)
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS intents JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_keywords_source_type ON keywords(source_type);
