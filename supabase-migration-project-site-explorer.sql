-- ============================================================
-- Project Site Explorer cache (Ahrefs)
-- Run once in Supabase SQL editor. Idempotent — safe to re-run.
-- ============================================================
--
-- Stores the per-project Ahrefs Site Explorer snapshot (domain overview +
-- organic competitors + top pages) so the project overview page does NOT
-- hit Ahrefs on every visit.
--
-- Reads are gated by `last_fetched_at`. Writes happen only when the user
-- clicks the "Refresh data" button, or on the very first overview load if
-- no row exists yet.

CREATE TABLE IF NOT EXISTS project_site_explorer (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  -- Resolved root domain that was actually queried (e.g. "example.com").
  target TEXT NOT NULL DEFAULT '',
  -- Region the snapshot was fetched for (us / uk / …). Stored so we can
  -- bust the cache automatically if the project's target_region changes.
  region TEXT NOT NULL DEFAULT 'us',
  -- Single Ahrefs domain-overview row.
  overview JSONB,
  -- Array of organic-competitor rows.
  competitors JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Array of top-pages rows.
  top_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hot path: "load the snapshot for this project".
CREATE INDEX IF NOT EXISTS idx_project_site_explorer_project_id
  ON project_site_explorer(project_id);
