-- Full deep analysis JSON on `blogs` when `blog_deep_analyses` is not used or unavailable.
-- Run in Supabase SQL Editor (whole file). Safe to re-run.

ALTER TABLE blogs ADD COLUMN IF NOT EXISTS deep_analysis JSONB;

-- Required: PostgREST only sees new columns after this (otherwise the app gets
-- "Could not find the 'deep_analysis' column of 'blogs' in the schema cache").
NOTIFY pgrst, 'reload schema';

-- If the app still errors for ~60s, run `supabase-migration-pgrst-reload-schema.sql` again,
-- or pause/resume the project in Dashboard as a last resort.
