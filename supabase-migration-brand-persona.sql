-- Migration to add brand persona fields to the projects table
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS brand_voice TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS brand_values TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS brand_description TEXT DEFAULT '';

-- Reload PostgREST schema so the API exposes the new columns instantly
NOTIFY pgrst, 'reload schema';
