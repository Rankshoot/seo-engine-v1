-- ============================================================
-- Content Studio (phase 5) — Ebook / Whitepaper / LinkedIn support.
-- Idempotent: safe to re-run on any environment.
-- ============================================================
--
-- Adds two columns to `blogs`:
--   content_type   — 'blog' | 'ebook' | 'whitepaper' | 'linkedin'
--                    Defaults to 'blog' so existing rows keep working.
--   content_data   — JSONB envelope for type-specific payloads
--                    (chapters for ebooks, sections for whitepapers,
--                     hooks/cta/hashtags for LinkedIn).
--
-- The existing markdown body still lives in `blogs.content`; ebook /
-- whitepaper rendering reads structured chapters from `content_data`
-- when present and falls back to plain markdown otherwise.

ALTER TABLE blogs
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'blog'
    CHECK (content_type IN ('blog', 'ebook', 'whitepaper', 'linkedin'));

ALTER TABLE blogs
  ADD COLUMN IF NOT EXISTS content_data JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Index used by the unified Content History query (type + status + project).
CREATE INDEX IF NOT EXISTS idx_blogs_content_type
  ON blogs(project_id, content_type, status);

-- Backfill: any existing row with article_type starting with "Instant ·",
-- "Repair", or "Import" is still a blog (markdown). The default 'blog'
-- value covers it without needing an UPDATE pass.
