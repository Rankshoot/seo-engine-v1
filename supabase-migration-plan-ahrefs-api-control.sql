-- ============================================================-- SEO Engine – Plan-Based Ahrefs API Control Migration-- Adds per-plan toggles for all 4 Ahrefs API endpoints-- ============================================================

-- 1. Add API control columns to subscription_plans
ALTER TABLE subscription_plans 
  ADD COLUMN IF NOT EXISTS enable_ahrefs_matching_terms BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_ahrefs_organic_competitors BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_ahrefs_blog_headings BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ahrefs_blog_faqs BOOLEAN NOT NULL DEFAULT false;

-- 2. Update existing plans with proper defaults
-- Free plan: Only basic APIs enabled
UPDATE subscription_plans 
SET 
  enable_ahrefs_matching_terms = true,
  enable_ahrefs_organic_competitors = true,
  enable_ahrefs_blog_headings = false,
  enable_ahrefs_blog_faqs = false
WHERE id = 'free';

-- Pro plan: Only basic APIs enabled (admin can enable extras)
UPDATE subscription_plans 
SET 
  enable_ahrefs_matching_terms = true,
  enable_ahrefs_organic_competitors = true,
  enable_ahrefs_blog_headings = false,
  enable_ahrefs_blog_faqs = false
WHERE id = 'pro';

-- Enterprise plan: Only basic APIs enabled (admin can enable extras)
UPDATE subscription_plans 
SET 
  enable_ahrefs_matching_terms = true,
  enable_ahrefs_organic_competitors = true,
  enable_ahrefs_blog_headings = false,
  enable_ahrefs_blog_faqs = false
WHERE id = 'enterprise';

-- 3. Ensure any other plans get sensible defaults
UPDATE subscription_plans 
SET 
  enable_ahrefs_matching_terms = COALESCE(enable_ahrefs_matching_terms, true),
  enable_ahrefs_organic_competitors = COALESCE(enable_ahrefs_organic_competitors, true),
  enable_ahrefs_blog_headings = COALESCE(enable_ahrefs_blog_headings, false),
  enable_ahrefs_blog_faqs = COALESCE(enable_ahrefs_blog_faqs, false)
WHERE enable_ahrefs_matching_terms IS NULL;
