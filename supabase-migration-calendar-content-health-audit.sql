-- Idempotent: snapshot of Content Health audit fed into calendar → blog generation writer notes.
ALTER TABLE calendar_entries
  ADD COLUMN IF NOT EXISTS content_health_audit JSONB DEFAULT NULL;

COMMENT ON COLUMN calendar_entries.content_health_audit IS 'Full Content Health audit payload when scheduled from audit page; consumed by generateBlog writer notes.';
