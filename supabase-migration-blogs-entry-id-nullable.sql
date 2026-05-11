-- Imported / standalone blogs are not tied to a calendar row.
ALTER TABLE blogs ALTER COLUMN entry_id DROP NOT NULL;
