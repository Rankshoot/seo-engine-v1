-- Migration: add last_benchmarked_competitor_snapshot to projects
-- Idempotent — safe to run on existing databases.
-- Stores the normalized sorted competitor list used in the last successful benchmark run.
-- Used by the UI to detect when project_competitors have changed since the last benchmark.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS last_benchmarked_competitor_snapshot TEXT DEFAULT NULL;
