-- Idempotent: supports multiple calendar entries sharing the same scheduled_date.
-- No unique constraint ever existed on (project_id, scheduled_date), so this is
-- purely a read-performance index for per-day grouping queries.
CREATE INDEX IF NOT EXISTS idx_calendar_project_scheduled_date
  ON calendar_entries (project_id, scheduled_date);
