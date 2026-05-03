-- Migration: add ai_source column to calendar_entries
-- Tracks whether a calendar entry was created from an AI suggestion and from which page
-- Idempotent — safe to run on existing databases

ALTER TABLE calendar_entries
  ADD COLUMN IF NOT EXISTS ai_source TEXT DEFAULT '';
