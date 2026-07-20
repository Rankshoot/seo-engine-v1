-- Idempotent: tracks the current/last AI-scoring run per project + scope so the
-- UI can restore "scoring in progress" state after a refresh or navigation,
-- and poll for progress/completion instead of only knowing about a run while
-- the triggering component stays mounted and awaited.
CREATE TABLE IF NOT EXISTS keyword_ai_scoring_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('organic', 'competitor')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'error')),
  total INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, scope)
);

CREATE INDEX IF NOT EXISTS idx_keyword_ai_scoring_runs_project ON keyword_ai_scoring_runs (project_id);
