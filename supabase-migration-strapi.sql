-- ============================================================
-- Strapi CMS Integration
-- Idempotent — safe to run on existing databases.
-- ============================================================

-- projects: per-project Strapi credentials
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS strapi_base_url  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS strapi_api_token TEXT DEFAULT NULL;

-- blogs: Strapi sync state
ALTER TABLE blogs
  ADD COLUMN IF NOT EXISTS strapi_document_id TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS strapi_sync_status TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS strapi_sync_error  TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS strapi_synced_at   TIMESTAMPTZ DEFAULT NULL;

-- Index for upsert-by-seo_engine_blog_id lookups from the Strapi client
CREATE INDEX IF NOT EXISTS idx_blogs_strapi_document_id
  ON blogs(strapi_document_id)
  WHERE strapi_document_id IS NOT NULL;
