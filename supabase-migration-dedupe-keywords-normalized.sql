-- ============================================================
-- Deduplicate keywords before idx_keywords_project_normalized
-- ============================================================
-- Error 23505: duplicate (project_id, normalized_keyword) — e.g. "Software
-- Engineering" vs "software engineering" both normalize to the same value.
--
-- Run this ONCE in Supabase SQL Editor, then create the index (statement at bottom).
-- Idempotent: if there are no duplicates, statements are no-ops (except the index).
--
-- Winner per duplicate group: approved > pending > rejected, then highest
-- keyword_analysis_score, then volume, then oldest created_at, then smallest id.
-- ============================================================

BEGIN;

CREATE TEMP TABLE kw_duplicate_merge (
  winner_id UUID NOT NULL,
  loser_id UUID NOT NULL,
  PRIMARY KEY (loser_id)
);

INSERT INTO kw_duplicate_merge (winner_id, loser_id)
WITH ranked AS (
  SELECT
    id,
    project_id,
    LOWER(TRIM(keyword)) AS norm_k,
    ROW_NUMBER() OVER (
      PARTITION BY project_id, LOWER(TRIM(keyword))
      ORDER BY
        CASE status
          WHEN 'approved' THEN 0
          WHEN 'pending' THEN 1
          WHEN 'rejected' THEN 2
          ELSE 3
        END,
        COALESCE(keyword_analysis_score, 0) DESC,
        COALESCE(volume, 0) DESC,
        created_at ASC,
        id ASC
    ) AS rn
  FROM keywords
)
SELECT w.id AS winner_id, l.id AS loser_id
FROM ranked w
JOIN ranked l
  ON w.project_id = l.project_id
 AND w.norm_k = l.norm_k
 AND w.rn = 1
 AND l.rn > 1
ON CONFLICT (loser_id) DO NOTHING;

-- Optional tables (added in supabase-migration-keyword-modal-tables.sql) — skip if not created yet.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'keyword_details'
  ) THEN
    DELETE FROM keyword_details kd
    USING kw_duplicate_merge m
    WHERE kd.keyword_id = m.loser_id;
  END IF;
END;
$$;

-- Calendar: point at surviving keyword.
UPDATE calendar_entries ce
SET keyword_id = m.winner_id
FROM kw_duplicate_merge m
WHERE ce.keyword_id = m.loser_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'keyword_ideas'
  ) THEN
    UPDATE keyword_ideas ki
    SET keyword_id = m.winner_id
    FROM kw_duplicate_merge m
    WHERE ki.keyword_id = m.loser_id;

    DELETE FROM keyword_ideas ki
    WHERE ki.id IN (
      SELECT id
      FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY keyword_id, type, keyword
            ORDER BY created_at ASC, id ASC
          ) AS n
        FROM keyword_ideas
      ) d
      WHERE d.n > 1
    );
  END IF;
END;
$$;

DELETE FROM keywords k
USING kw_duplicate_merge m
WHERE k.id = m.loser_id;

DROP TABLE kw_duplicate_merge;

COMMIT;

-- Safe to re-run: no duplicate (project_id, normalized_keyword) left.
CREATE UNIQUE INDEX IF NOT EXISTS idx_keywords_project_normalized
  ON keywords(project_id, normalized_keyword);
