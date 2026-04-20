-- Phase 1: site-aware keyword discovery.
-- Stores the Business Brief we extract by scraping the user's own domain
-- (plus competitors) so we don't re-scrape on every keyword discovery.
-- Run once in Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS project_briefs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  scraped_urls TEXT[] DEFAULT '{}',
  -- Concatenated scraped text length for quick debugging. Raw text lives only in logs.
  scraped_chars INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_briefs_project_id ON project_briefs(project_id);

-- Reload PostgREST schema cache so the new table is available immediately.
NOTIFY pgrst, 'reload schema';
