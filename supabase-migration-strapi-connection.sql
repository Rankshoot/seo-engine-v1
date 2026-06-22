-- ============================================================
-- Strapi CMS connection credentials — stored per project
-- Run this once in your Supabase SQL Editor.
-- ============================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS strapi_base_url  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS strapi_api_token TEXT DEFAULT NULL;

-- Index for fast credential lookups (optional, projects table is small)
CREATE INDEX IF NOT EXISTS idx_projects_strapi_base_url
  ON projects(strapi_base_url)
  WHERE strapi_base_url IS NOT NULL;

-- NOTE: blogs.strapi_document_id / strapi_sync_status / strapi_sync_error / strapi_synced_at
-- are already present from a previous migration. No changes needed on the blogs table.
