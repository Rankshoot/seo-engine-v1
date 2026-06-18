-- Landing Page Theme & Custom Styling: add layout columns to projects table
-- Run this once in the Supabase SQL Editor.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS brand_ref_landing_page_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_theme               TEXT DEFAULT 'light',
  ADD COLUMN IF NOT EXISTS brand_screenshot_url      TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_font_family         TEXT DEFAULT 'Inter, sans-serif',
  ADD COLUMN IF NOT EXISTS brand_button_style        TEXT DEFAULT 'rounded-full',
  ADD COLUMN IF NOT EXISTS brand_cta_link            TEXT DEFAULT NULL;
