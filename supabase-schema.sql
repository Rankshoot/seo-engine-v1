-- ============================================================
-- SEO Engine – Supabase Schema
-- Run this entire file in your Supabase SQL Editor (once)
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  company TEXT NOT NULL,
  niche TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  target_region TEXT NOT NULL DEFAULT 'us',
  target_language TEXT NOT NULL DEFAULT 'en',
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_competitors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cached result of scraping the user's own site + competitors. One row per project.
-- Regenerated on demand when the user clicks "Refresh brief".
CREATE TABLE IF NOT EXISTS project_briefs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  scraped_urls TEXT[] DEFAULT '{}',
  scraped_chars INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id)
);

-- Per-blog Content Health audit results. One row per (project, url).
CREATE TABLE IF NOT EXISTS blog_audits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT DEFAULT '',
  word_count INTEGER DEFAULT 0,
  health_score INTEGER DEFAULT 0,
  severity TEXT DEFAULT 'low',
  primary_keyword TEXT DEFAULT '',
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  scraped_chars INTEGER DEFAULT 0,
  error TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, url)
);

CREATE TABLE IF NOT EXISTS keywords (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  volume INTEGER DEFAULT 0,
  kd INTEGER DEFAULT 0,
  cpc NUMERIC(10,2) DEFAULT 0,
  trend TEXT DEFAULT '+0%',
  monthly_searches JSONB DEFAULT '[]',
  secondary_keywords TEXT[] DEFAULT '{}',
  ai_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  source_url TEXT DEFAULT '',
  gap_competitor TEXT DEFAULT '',
  competition_level TEXT DEFAULT '',
  intent TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, keyword)
);

CREATE TABLE IF NOT EXISTS calendar_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  keyword_id UUID REFERENCES keywords(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  title TEXT NOT NULL,
  article_type TEXT NOT NULL DEFAULT 'How-to Guide',
  slug TEXT NOT NULL,
  focus_keyword TEXT NOT NULL,
  secondary_keywords TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blogs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES calendar_entries(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  meta_description TEXT DEFAULT '',
  word_count INTEGER DEFAULT 0,
  target_keyword TEXT DEFAULT '',
  article_type TEXT DEFAULT '',
  slug TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  research_sources INTEGER DEFAULT 0,
  external_links TEXT[] DEFAULT '{}',
  internal_links TEXT[] DEFAULT '{}',
  source_url TEXT DEFAULT '',
  repair_notes TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_project_briefs_project_id ON project_briefs(project_id);
CREATE INDEX IF NOT EXISTS idx_blog_audits_project_id ON blog_audits(project_id);
CREATE INDEX IF NOT EXISTS idx_blog_audits_health_score ON blog_audits(health_score);
CREATE INDEX IF NOT EXISTS idx_keywords_project_id ON keywords(project_id);
CREATE INDEX IF NOT EXISTS idx_keywords_status ON keywords(status);
CREATE INDEX IF NOT EXISTS idx_calendar_project_id ON calendar_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_calendar_date ON calendar_entries(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_blogs_entry_id ON blogs(entry_id);
CREATE INDEX IF NOT EXISTS idx_blogs_project_id ON blogs(project_id);
