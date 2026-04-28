-- ============================================================
-- Blog workflow status migration
-- Keeps exactly three editorial states for generated blog assets:
--   generated -> approved -> published
-- Safe to re-run.
-- ============================================================

ALTER TABLE blogs ALTER COLUMN status SET DEFAULT 'generated';

UPDATE blogs
SET status = 'generated'
WHERE status IS NULL
   OR status IN ('draft', 'ready', 'downloaded')
   OR status NOT IN ('generated', 'approved', 'published');

ALTER TABLE blogs DROP CONSTRAINT IF EXISTS blogs_status_check;
ALTER TABLE blogs
  ADD CONSTRAINT blogs_status_check
  CHECK (status IN ('generated', 'approved', 'published'));

NOTIFY pgrst, 'reload schema';
