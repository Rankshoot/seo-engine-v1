-- Migration to add ahrefs_discovery_state column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ahrefs_discovery_state JSONB DEFAULT '{}'::jsonb;
