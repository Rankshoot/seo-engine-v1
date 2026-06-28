-- ============================================================
-- Project sitemap → enhanced internal linking
-- Run once in Supabase SQL editor. Idempotent — safe to re-run.
-- ============================================================
--
-- Why this exists:
--   Generated content (blogs / ebooks / whitepapers) was only internally
--   linking to a handful of pages (mostly the homepage / landing page) because
--   the internal-link pool was limited to the brief's best-effort
--   `internal_link_candidates`. This migration lets each project capture its
--   full sitemap once, cache every discovered URL, and feed a relevance-ranked
--   subset into the generation prompt so the AI deep-links to other blog/content
--   pages.
--
--   Sitemap config lives on `projects` (NOT on the cacheable `project_briefs`
--   row, which is wiped/rebuilt on every "Refresh brief"). The discovered URLs
--   live in their own table so large sites paginate cleanly.

-- ── 1. Sitemap config on the project ────────────────────────────────────────
-- The sitemap URL we fetch from (auto-discovered from the domain, or set by the
-- user). Empty string = not configured yet.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sitemap_url TEXT NOT NULL DEFAULT '';

-- How the sitemap_url was set: '' (none) | 'auto' (discovered) | 'manual' (user).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sitemap_source TEXT NOT NULL DEFAULT '';

-- Discovery / fetch lifecycle, so we never re-probe on every page load:
--   'pending' — never attempted
--   'found'   — a sitemap resolved and URLs were stored
--   'empty'   — a sitemap resolved but contained no usable content URLs
--   'failed'  — no sitemap could be found / fetched
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sitemap_status TEXT NOT NULL DEFAULT 'pending';

-- When the URL inventory was last (re)fetched.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sitemap_synced_at TIMESTAMPTZ;

-- Cached count of stored URLs (so settings/badges don't COUNT(*) every render).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sitemap_url_count INTEGER NOT NULL DEFAULT 0;

-- When the existing-user onboarding prompt was dismissed. NULL = not dismissed.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sitemap_prompt_dismissed_at TIMESTAMPTZ;

-- ── 2. Discovered sitemap URLs (full inventory, one row per URL) ─────────────
CREATE TABLE IF NOT EXISTS project_sitemap_urls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Absolute, canonical URL of the page.
  url TEXT NOT NULL,
  -- URL pathname (lower-cased), kept for cheap lexical relevance ranking.
  path TEXT NOT NULL DEFAULT '',
  -- Coarse classification used to bias ranking: 'blog' | 'page'.
  kind TEXT NOT NULL DEFAULT 'page',
  -- Best-effort human title (derived from the slug when the sitemap has none).
  title TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- One row per (project, url). Re-syncing upserts instead of duplicating.
  UNIQUE (project_id, url)
);

-- Hot path: "load every sitemap URL for this project".
CREATE INDEX IF NOT EXISTS idx_project_sitemap_urls_project_id
  ON project_sitemap_urls(project_id);

-- Filtered loads by kind (e.g. blog-only ranking).
CREATE INDEX IF NOT EXISTS idx_project_sitemap_urls_project_kind
  ON project_sitemap_urls(project_id, kind);

-- Ask PostgREST to reload its schema cache so the new columns/table are
-- immediately queryable without a manual dashboard reload.
NOTIFY pgrst, 'reload schema';
