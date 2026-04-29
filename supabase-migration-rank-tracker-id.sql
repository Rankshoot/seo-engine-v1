-- Migration: add ahrefs_rank_tracker_project_id per project
-- Run this in your Supabase SQL Editor (idempotent)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS ahrefs_rank_tracker_project_id BIGINT DEFAULT NULL;
