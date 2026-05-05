-- Idempotent: add Ahrefs-style multi-intent JSONB on `keywords` if your DB predates
-- `supabase-migration-keyword-discovery-pipeline.sql`. The keywords table UI reads the
-- scalar `intent` column; this column is optional enrichment only.
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS intents JSONB DEFAULT '{}'::jsonb;
