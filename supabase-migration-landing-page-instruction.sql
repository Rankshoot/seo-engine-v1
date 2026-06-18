-- Add Custom Instruction column for landing page branding to projects table
-- Run this in the Supabase SQL Editor.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS brand_landing_page_instruction TEXT DEFAULT NULL;
