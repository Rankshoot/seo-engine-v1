-- ============================================================
-- Competitor Benchmarking Engine — standalone idempotent migration
-- Run once per existing project DB. Safe to re-run.
-- ============================================================

-- 1. A competitor = one domain we've benchmarked for a project.
--    project_competitors (existing table) still owns "which domains
--    has the user listed as competitors" — this table adds the
--    *benchmark* layer on top (scrape snapshots, averages, scores).
CREATE TABLE IF NOT EXISTS competitors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  title TEXT DEFAULT '',
  rank_score INTEGER DEFAULT 0,
  pages_scraped INTEGER DEFAULT 0,
  avg_word_count INTEGER DEFAULT 0,
  avg_h2 NUMERIC(6,2) DEFAULT 0,
  avg_h3 NUMERIC(6,2) DEFAULT 0,
  avg_images NUMERIC(6,2) DEFAULT 0,
  avg_internal_links NUMERIC(6,2) DEFAULT 0,
  avg_external_links NUMERIC(6,2) DEFAULT 0,
  faq_pages_pct INTEGER DEFAULT 0,
  top_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations TEXT[] DEFAULT '{}',
  last_benchmarked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, domain)
);

-- 2. Every keyword / long-tail / question we lifted out of a
--    competitor's page. We don't dedupe into the main `keywords`
--    table — those are the user's shortlist. These rows are the
--    raw extraction pool that feeds gap analysis.
CREATE TABLE IF NOT EXISTS competitor_keywords (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'primary', -- 'primary' | 'longtail' | 'question'
  freq INTEGER DEFAULT 1,
  source_url TEXT DEFAULT '',
  source_title TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Resolved gap table — one row per (project, keyword) that
--    competitors rank for and we don't. The `gap_type` tells the UI
--    whether the user has the keyword (weak) or not at all (missing),
--    and `opportunity_score` drives the Opportunity Dashboard sort.
CREATE TABLE IF NOT EXISTS keyword_gaps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  gap_type TEXT NOT NULL DEFAULT 'missing', -- 'missing' | 'weak' | 'untapped'
  opportunity_score INTEGER DEFAULT 0,
  volume INTEGER DEFAULT 0,
  kd INTEGER DEFAULT 0,
  trend TEXT DEFAULT '+0%',
  trend_pct NUMERIC(6,2) DEFAULT 0,
  competitor_weakness INTEGER DEFAULT 0,
  top_competitor_domain TEXT DEFAULT '',
  top_competitor_url TEXT DEFAULT '',
  reasoning TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_competitors_project_id ON competitors(project_id);
CREATE INDEX IF NOT EXISTS idx_competitor_keywords_project_id ON competitor_keywords(project_id);
CREATE INDEX IF NOT EXISTS idx_competitor_keywords_competitor_id ON competitor_keywords(competitor_id);
CREATE INDEX IF NOT EXISTS idx_keyword_gaps_project_id ON keyword_gaps(project_id);
CREATE INDEX IF NOT EXISTS idx_keyword_gaps_score ON keyword_gaps(opportunity_score DESC);

-- ============================================================
-- 4. `keywords` table schema repair
--    Older deployments of this app were provisioned before we added the
--    analysis-score columns, intent/competition metadata, and the gap
--    pointer columns. Writes from `research-actions.ts`,
--    `competitor-actions.ts`, and `keyword-actions.ts` fail with
--    "Could not find the 'gap_competitor' column of 'keywords' in the
--    schema cache" when those columns are missing. This block is
--    idempotent — every `ADD COLUMN` uses `IF NOT EXISTS`.
-- ============================================================
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS keyword_analysis_score INTEGER DEFAULT 0;
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS relevance_score       INTEGER DEFAULT 0;
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS business_fit_score    INTEGER DEFAULT 0;
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS source_url            TEXT    DEFAULT '';
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS gap_competitor        TEXT    DEFAULT '';
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS competition_level     TEXT    DEFAULT '';
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS intent                TEXT    DEFAULT '';

-- Supabase's PostgREST caches the table schema; reload it so the API picks
-- up the new columns immediately without needing a project restart.
NOTIFY pgrst, 'reload schema';
