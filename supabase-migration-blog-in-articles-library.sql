-- Saved articles library: user-curated list from the blog viewer ("Add this article").
-- Idempotent for existing databases.

ALTER TABLE blogs
  ADD COLUMN IF NOT EXISTS in_articles_library BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_blogs_project_articles_library
  ON blogs (project_id)
  WHERE in_articles_library = true;
