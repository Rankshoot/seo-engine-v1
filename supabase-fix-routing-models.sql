-- Fix stale/deprecated Claude model IDs in routing platform_settings
-- Run this in Supabase SQL Editor if you see errors like:
--   404 not_found_error: model: claude-3-5-sonnet-latest
--   404 not_found_error: model: claude-3-5-sonnet-20241022

-- Force-overwrite the routing row with correct current model IDs
UPDATE platform_settings
SET value = '{
  "blog":       "claude-sonnet-4-6",
  "ebook":      "claude-sonnet-4-6",
  "whitepaper": "claude-sonnet-4-6",
  "linkedin":   "claude-sonnet-4-6",
  "assistant":  "claude-sonnet-4-6",
  "fallback":   "gemini-2.5-pro"
}'::jsonb
WHERE key = 'routing';

-- Verify the update
SELECT key, value FROM platform_settings WHERE key = 'routing';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
