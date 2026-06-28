-- ============================================================
-- Background jobs — durable, resumable long-running work
-- Run once in Supabase SQL editor. Idempotent — safe to re-run.
-- ============================================================
--
-- Why this exists:
--   Long-running operations (content audits today; keyword discovery, content
--   generation, and in-content images next) used to run INSIDE the HTTP request
--   that started them. If the user switched tabs, refreshed, or navigated away,
--   the work was lost and they had to re-run it — wasting paid API calls
--   (DataForSEO, Serper, Gemini, Claude).
--
--   This table makes that work durable: the request enqueues a job and returns
--   immediately; a worker (kicked immediately via best-effort self-dispatch, and
--   guaranteed by a Cloud Scheduler cron drain) runs it to completion regardless
--   of the client. The client polls job status and shows a skeleton until done.
--
--   `idempotency_key` dedupes in-flight work (e.g. the same URL audited twice in
--   quick succession reuses the running job instead of paying again).

CREATE TABLE IF NOT EXISTS background_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Nullable so account-level jobs (no project) are possible later.
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL DEFAULT '',
  -- e.g. 'content_audit' | 'keyword_discovery' | 'blog_generate' | ...
  type TEXT NOT NULL,
  -- 'pending' | 'running' | 'done' | 'failed'
  status TEXT NOT NULL DEFAULT 'pending',
  -- Dedupe key for active jobs (see partial unique index below).
  idempotency_key TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  -- Earliest time this job may run (used for retry backoff).
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Set when a worker claims the job; used to detect & requeue stuck jobs.
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- Drainer hot path: "find the next runnable pending job".
CREATE INDEX IF NOT EXISTS idx_background_jobs_status_run_after
  ON background_jobs(status, run_after);

-- Client status polling + resume: "active jobs for this project of these types".
CREATE INDEX IF NOT EXISTS idx_background_jobs_project_type_status
  ON background_jobs(project_id, type, status);

-- At most ONE active (pending/running) job per idempotency key — this is what
-- prevents duplicate paid API calls when the same work is requested twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_background_jobs_active_idempotency
  ON background_jobs(idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status IN ('pending', 'running');

-- ── Audit rows learn about their job so the UI can render a skeleton ──────────
-- 'done' default means every pre-existing audit row is treated as complete.
ALTER TABLE blog_audits ADD COLUMN IF NOT EXISTS job_status TEXT NOT NULL DEFAULT 'done';
ALTER TABLE blog_audits ADD COLUMN IF NOT EXISTS job_id UUID;

NOTIFY pgrst, 'reload schema';
