-- Cached SERP competitor deep analysis per generated blog (View Blog page).
-- Run once in Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS blog_deep_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  blog_id UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_keyword TEXT NOT NULL DEFAULT '',
  analysis JSONB NOT NULL DEFAULT jsonb_build_object(),
  trace JSONB NOT NULL DEFAULT jsonb_build_array(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blog_id)
);

CREATE INDEX IF NOT EXISTS idx_blog_deep_analyses_project_id ON blog_deep_analyses(project_id);

NOTIFY pgrst, 'reload schema';
