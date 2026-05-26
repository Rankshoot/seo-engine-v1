-- Idempotent Migration: Add source column to keywords table and adjust unique constraints to include source.

-- 1. Add source column with default 'organic' to support legacy rows
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'organic';

-- 2. Drop old unique constraints if they exist
ALTER TABLE keywords DROP CONSTRAINT IF EXISTS keywords_project_id_keyword_key;
ALTER TABLE keywords DROP CONSTRAINT IF EXISTS idx_keywords_project_normalized;

-- 3. Add new unique constraint including source
ALTER TABLE keywords ADD CONSTRAINT keywords_project_id_keyword_source_key UNIQUE (project_id, keyword, source);

-- 4. Re-create idx_keywords_project_normalized to include source
DROP INDEX IF EXISTS idx_keywords_project_normalized;
CREATE UNIQUE INDEX IF NOT EXISTS idx_keywords_project_normalized
  ON keywords(project_id, normalized_keyword, source);

-- 5. Create index on source column for fast tab filtering
CREATE INDEX IF NOT EXISTS idx_keywords_source ON keywords(source);
