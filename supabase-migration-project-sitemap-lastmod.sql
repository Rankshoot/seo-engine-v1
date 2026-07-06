-- ── Sitemap <lastmod> capture ────────────────────────────────────────────────
-- Stores each sitemap URL's declared <lastmod> so internal-link ranking can
-- prefer the site's most recently published/updated pages (newest blog posts)
-- over older ones. NULL when the sitemap doesn't declare one.
ALTER TABLE project_sitemap_urls ADD COLUMN IF NOT EXISTS lastmod TIMESTAMPTZ;

-- Ask PostgREST to reload its schema cache so the new column is immediately
-- queryable without a manual dashboard reload.
NOTIFY pgrst, 'reload schema';
