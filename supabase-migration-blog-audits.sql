-- Content Health audit: stores the analysis of each existing blog post we
-- scrape from the user's own website. Used to (a) surface repair suggestions
-- and content gaps, and (b) gate new-blog generation until the user has
-- reviewed their existing inventory.
-- Run once in Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS blog_audits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT DEFAULT '',
  word_count INTEGER DEFAULT 0,
  -- 0–100. Higher = better. Computed from LLM analysis + structural signals.
  health_score INTEGER DEFAULT 0,
  -- 'low' | 'medium' | 'high' — worst issue severity across the page.
  severity TEXT DEFAULT 'low',
  primary_keyword TEXT DEFAULT '',
  -- Full structured analysis: issues, fixes, content_gaps, internal_link_opportunities.
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Raw scraped markdown length — useful for debugging cache decisions.
  scraped_chars INTEGER DEFAULT 0,
  -- Error message if audit failed for this URL (HTTP/LLM/parse error).
  error TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, url)
);

CREATE INDEX IF NOT EXISTS idx_blog_audits_project_id ON blog_audits(project_id);
CREATE INDEX IF NOT EXISTS idx_blog_audits_health_score ON blog_audits(health_score);

NOTIFY pgrst, 'reload schema';
