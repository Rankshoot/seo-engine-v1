-- ============================================================
-- Keyword Modal + Blog-Generation Coverage tables
-- Run once in Supabase SQL editor. Idempotent: safe to re-run.
-- ============================================================
--
-- Adds the per-keyword "modal" payload (overview / volume history / volume by
-- country / SERP top results / top ranking result) and the per-keyword "ideas"
-- pool (matching, questions, also-rank-for, also-talk-about, suggestions) that
-- power blog generation coverage.
--
-- It also extends the existing `keywords` table with the missing modal fields
-- (`normalized_keyword`, `global_volume`, `parent_volume`, `serp_features`,
-- `updated_at`) and adds a unique (project_id, normalized_keyword) index so we
-- never store case-different duplicates of the same keyword.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extend `keywords`
-- ─────────────────────────────────────────────────────────────────────────────

-- Stored generated column. Always == LOWER(TRIM(keyword)). Cannot be set
-- manually by the application — Postgres backfills it for every existing row
-- and recomputes on every UPDATE. This is what powers the cross-case unique
-- index below.
ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS normalized_keyword TEXT
  GENERATED ALWAYS AS (LOWER(TRIM(keyword))) STORED;

-- Worldwide search volume across all regions (Ahrefs `global_volume`).
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS global_volume INTEGER DEFAULT 0;

-- Search volume of the parent topic / cluster head (different from
-- `traffic_potential` — this is the parent keyword's own search volume).
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS parent_volume INTEGER DEFAULT 0;

-- SERP features Ahrefs surfaced for this keyword (featured snippet, PAA,
-- video, image pack, …). Each element is a `{ type, position?, … }` object.
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS serp_features JSONB DEFAULT '[]'::jsonb;

-- Mutation timestamp. Apps that update keyword rows should bump this.
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Cross-case uniqueness on (project_id, normalized_keyword). The existing
-- UNIQUE(project_id, keyword) constraint stays — both can coexist.
-- NOTE: if your project already has case-different duplicates (e.g.
-- "SEO Tool" + "seo tool"), this index creation will fail. Clean those up
-- first; current write paths normalize to lowercase so this is unlikely.
CREATE UNIQUE INDEX IF NOT EXISTS idx_keywords_project_normalized
  ON keywords(project_id, normalized_keyword);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. `keyword_details` — one row per keyword, modal payload
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS keyword_details (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id UUID NOT NULL UNIQUE REFERENCES keywords(id) ON DELETE CASCADE,
  -- Full Ahrefs Keywords-Explorer / overview row (includes intents, parent_topic, …).
  overview JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- [{ date, volume }] from /keywords-explorer/volume-history
  volume_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- [{ country, volume }] from /keywords-explorer/volume-by-country
  volume_by_country JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Top organic SERP results array (positions 1..N) from /serp-overview/serp-overview
  serp_top_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- The single highest-ranking result (for quick "currently winning" UI).
  top_ranking_result JSONB,
  last_fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. `keyword_ideas` — many rows per keyword, blog-coverage pool
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS keyword_ideas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id UUID NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (
    type IN ('terms_match', 'questions', 'also_rank_for', 'also_talk_about', 'search_suggestion')
  ),
  keyword TEXT NOT NULL,
  volume INTEGER DEFAULT 0,
  difficulty INTEGER DEFAULT 0,
  cpc NUMERIC(10,2) DEFAULT 0,
  traffic_potential INTEGER DEFAULT 0,
  intents JSONB DEFAULT '{}'::jsonb,
  parent_topic TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hot path: "give me all `also_rank_for` ideas for this keyword".
CREATE INDEX IF NOT EXISTS idx_keyword_ideas_keyword_id_type
  ON keyword_ideas(keyword_id, type);

-- Optional cross-keyword lookup ("how often does this idea phrase appear?").
CREATE INDEX IF NOT EXISTS idx_keyword_ideas_keyword
  ON keyword_ideas(keyword);
