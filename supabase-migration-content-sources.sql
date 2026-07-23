-- ============================================================
-- Custom Knowledge Sources — user-uploaded reports/docs/links the
-- content generator studies and cites (e.g. an industry report).
-- Run once in Supabase SQL editor. Idempotent — safe to re-run.
-- ============================================================
--
-- Why this exists:
--   Clients want their own source material (a downloaded industry report, a
--   whitepaper, a reference URL) fed into blog generation so the AI cites REAL
--   data points from it — where genuinely relevant, not forced — and interlinks
--   to the canonical report page. A source is uploaded/added ONCE per project;
--   at generation time only the most relevant excerpts (retrieved by embedding
--   similarity) are injected into the prompt, so a 100 MB report never has to
--   fit in the context window.
--
--   Access is server-only via the service role (no RLS anywhere in this schema);
--   every query filters by user_id / project_id explicitly.

-- ── The source record (one per uploaded file or added link) ──────────────────
CREATE TABLE IF NOT EXISTS content_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Clerk user id (TEXT), matches the rest of the schema.
  user_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT 'Untitled source',
  -- 'file' (uploaded PDF/DOCX/TXT/MD) | 'link' (a URL we scrape)
  kind TEXT NOT NULL DEFAULT 'file',
  original_filename TEXT,
  file_size_bytes BIGINT,
  mime_type TEXT,
  -- Path inside the private `content-sources` storage bucket (file kind).
  storage_path TEXT,
  -- The URL we scraped (link kind).
  source_url TEXT,
  -- The canonical page the article should interlink to when it cites this source.
  cite_url TEXT,
  -- 'always' → auto-injected into every blog for the project (e.g. the flagship
  --            report the client wants cited everywhere).
  -- 'optional' → only used for a blog when the user selects it in the form.
  scope TEXT NOT NULL DEFAULT 'optional',
  -- 'pending' (queued) | 'processing' | 'ready' | 'failed'
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT NOT NULL DEFAULT '',
  -- Populated when ingestion completes.
  char_count INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  -- Full extracted text (capped). Small/medium reports are fed to the writer
  -- wholesale; only reports too large for the context window fall back to
  -- embedding retrieval over `content_source_chunks`.
  extracted_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent add for projects that already ran an earlier version of this file.
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS extracted_text TEXT;

-- List a project's sources; find the "always" sources fast at generation time.
CREATE INDEX IF NOT EXISTS idx_content_sources_project
  ON content_sources(project_id, status);
CREATE INDEX IF NOT EXISTS idx_content_sources_project_scope
  ON content_sources(project_id, scope, status);

-- ── Extracted, embedded chunks (the retrievable units) ───────────────────────
-- Embeddings are stored as JSONB float arrays (no pgvector dependency); cosine
-- similarity is computed in JS, consistent with src/lib/relevance.ts.
CREATE TABLE IF NOT EXISTS content_source_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES content_sources(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL DEFAULT '',
  embedding JSONB,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Load all chunks for a source (retrieval + cascade cleanup).
CREATE INDEX IF NOT EXISTS idx_content_source_chunks_source
  ON content_source_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_content_source_chunks_project
  ON content_source_chunks(project_id);

NOTIFY pgrst, 'reload schema';
