-- Brand Intelligence: add brand profile columns to projects table
-- Run this once in the Supabase SQL Editor.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS brand_primary_color   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_secondary_color TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_accent_color    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_logo_url        TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_visual_style    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_design_personality TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_image_style     TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_palette_json    JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_extracted_at    TIMESTAMPTZ DEFAULT NULL;

-- Also add brand_voice, brand_values, brand_description if not already present
-- (they exist in the TypeScript type but may be missing from the SQL schema)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS brand_voice       TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_values      TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_description TEXT DEFAULT NULL;
