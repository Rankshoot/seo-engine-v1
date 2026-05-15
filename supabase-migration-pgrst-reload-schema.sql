-- PostgREST caches the exposed schema. After CREATE TABLE / ADD COLUMN, run this so the API
-- stops returning "Could not find ... in the schema cache".
-- Safe to run anytime from Supabase SQL Editor.

NOTIFY pgrst, 'reload schema';
