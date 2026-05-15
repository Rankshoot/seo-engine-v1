-- Raw hybrid-reader markdown for Content Health audits (Analyze URL + batch).
-- Idempotent for existing projects.

ALTER TABLE blog_audits ADD COLUMN IF NOT EXISTS scraped_markdown TEXT;

COMMENT ON COLUMN blog_audits.scraped_markdown IS 'Markdown from hybridReadUrl before LLM diagnosis; capped in app (~750k chars).';
