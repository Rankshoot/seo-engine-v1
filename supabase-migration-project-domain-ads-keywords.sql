-- ============================================================
-- Cached Google Ads "keywords for site" list per project (DataForSEO)
-- Run once in Supabase SQL editor. Idempotent — safe to re-run.
-- ============================================================
--
-- The keyword discovery "Domain data" tab reads this snapshot and merges it
-- with `keywords` for saved statuses. DataForSEO is NOT called on page load —
-- only when the user clicks Re-discover / Refresh (or the empty-state fetch).

CREATE TABLE IF NOT EXISTS project_domain_ads_keywords (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  target_domain TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT 'us',
  language TEXT NOT NULL DEFAULT 'en',
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
