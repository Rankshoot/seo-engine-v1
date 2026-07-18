-- ============================================================
-- Rankshoot AI memory — two layers
-- Run once in the Supabase SQL Editor. Idempotent — safe to re-run.
-- ============================================================
--
-- Layer 1: project_content_memory (USER-OWNED, per project)
--   A rolling set of structured memory entries the AI accumulates as the user
--   generates keywords / blogs / audits in a project — topics covered, style
--   learnings, user preferences, workflow activity. Injected into every
--   generation prompt so the agent "knows" the project. Fully visible and
--   editable in project Settings; deleting an entry (or clearing all) is a
--   REAL delete — it is never used again until new memory accumulates.
--
-- Layer 2: global_style_heuristics (BACKEND-ONLY, admin-visible)
--   Anonymized, style-only writing/structure patterns that correlate with
--   high-scoring content across ALL users. Never contains business names,
--   domains, products, or any tenant data (enforced in code before insert).
--   Read into prompts as light guidance; surfaced only in the admin panel
--   ("AI Memory" tab) where admins can prune entries.

-- ── Layer 1: per-project memory ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_content_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL DEFAULT '',
  -- 'topic_covered' | 'style' | 'preference' | 'audience_insight' | 'activity'
  kind TEXT NOT NULL DEFAULT 'style',
  content TEXT NOT NULL,
  -- Where the entry came from: 'blog_generate' | 'repair' | 'audit' | 'user'
  source TEXT NOT NULL DEFAULT 'blog_generate',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot path: "load this project's memory, newest first".
CREATE INDEX IF NOT EXISTS idx_project_content_memory_project_created
  ON project_content_memory(project_id, created_at DESC);

-- Marker set when the user clears a project's memory. Accumulation restarts
-- cleanly from this point; nothing before it is ever reused (rows are deleted).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS memory_cleared_at TIMESTAMPTZ DEFAULT NULL;

-- ── Layer 2: global anonymized style heuristics ──────────────────────────────
CREATE TABLE IF NOT EXISTS global_style_heuristics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- The anonymized pattern, e.g. "Question-phrased H2s with a direct answer
  -- in the first sentence get extracted into AI answers more often."
  heuristic TEXT NOT NULL,
  -- 'structure' | 'style' | 'seo' | 'aeo' | 'geo'
  category TEXT NOT NULL DEFAULT 'style',
  -- How many independent outcomes support this pattern (incremented on re-observation).
  evidence_count INTEGER NOT NULL DEFAULT 1,
  -- 'active' (used in prompts) | 'archived' (admin-pruned, kept for history)
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per distinct pattern — re-observations increment evidence_count.
CREATE UNIQUE INDEX IF NOT EXISTS uq_global_style_heuristics_text
  ON global_style_heuristics (lower(heuristic));

CREATE INDEX IF NOT EXISTS idx_global_style_heuristics_status
  ON global_style_heuristics(status, evidence_count DESC);

-- Reload PostgREST schema so the API exposes the new tables instantly.
NOTIFY pgrst, 'reload schema';
