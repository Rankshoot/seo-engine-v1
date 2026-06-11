-- ============================================================
-- SEO Engine – Pricing & Subscription Plans Schema
-- ============================================================

-- 1. Create subscription_plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY, -- 'free', 'pro', 'enterprise'
  name TEXT NOT NULL,
  monthly_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  stripe_price_id TEXT DEFAULT NULL,
  limit_projects INTEGER NOT NULL DEFAULT 0,
  limit_keywords_fetched INTEGER NOT NULL DEFAULT 0,
  limit_keywords_explored INTEGER NOT NULL DEFAULT 0,
  limit_standard_content INTEGER NOT NULL DEFAULT 0,
  limit_premium_content INTEGER NOT NULL DEFAULT 0,
  limit_ai_credits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create users/profiles table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, -- Clerk User ID
  email TEXT NOT NULL,
  plan_id TEXT REFERENCES subscription_plans(id) DEFAULT 'free',
  stripe_customer_id TEXT DEFAULT NULL,
  stripe_subscription_id TEXT DEFAULT NULL,
  subscription_status TEXT DEFAULT 'inactive',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create user_quotas table
CREATE TABLE IF NOT EXISTS user_quotas (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  
  -- Base limits from plan
  limit_projects INTEGER NOT NULL DEFAULT 1,
  limit_keywords_fetched INTEGER NOT NULL DEFAULT 50,
  limit_keywords_explored INTEGER NOT NULL DEFAULT 10,
  limit_standard_content INTEGER NOT NULL DEFAULT 2,
  limit_premium_content INTEGER NOT NULL DEFAULT 0,
  limit_ai_credits INTEGER NOT NULL DEFAULT 10,
  
  -- Admin overrides
  override_projects INTEGER DEFAULT NULL,
  override_keywords_fetched INTEGER DEFAULT NULL,
  override_keywords_explored INTEGER DEFAULT NULL,
  override_standard_content INTEGER DEFAULT NULL,
  override_premium_content INTEGER DEFAULT NULL,
  override_ai_credits INTEGER DEFAULT NULL,
  
  -- Current usage counters
  used_projects INTEGER NOT NULL DEFAULT 0,
  used_keywords_fetched INTEGER NOT NULL DEFAULT 0,
  used_keywords_explored INTEGER NOT NULL DEFAULT 0,
  used_standard_content INTEGER NOT NULL DEFAULT 0,
  used_premium_content INTEGER NOT NULL DEFAULT 0,
  used_ai_credits INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create processed_stripe_events table for idempotency
CREATE TABLE IF NOT EXISTS processed_stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Stored function for atomic quota checking and deduction
CREATE OR REPLACE FUNCTION deduct_user_quota(
  p_user_id TEXT,
  p_quota_key TEXT,
  p_amount INT
) RETURNS BOOLEAN AS $$
DECLARE
  v_limit INT;
  v_used INT;
  v_override INT;
  v_effective_limit INT;
BEGIN
  -- Get current limits and used values based on p_quota_key
  IF p_quota_key = 'projects' THEN
    SELECT limit_projects, used_projects, override_projects INTO v_limit, v_used, v_override FROM user_quotas WHERE user_id = p_user_id;
  ELSIF p_quota_key = 'keywords_fetched' THEN
    SELECT limit_keywords_fetched, used_keywords_fetched, override_keywords_fetched INTO v_limit, v_used, v_override FROM user_quotas WHERE user_id = p_user_id;
  ELSIF p_quota_key = 'keywords_explored' THEN
    SELECT limit_keywords_explored, used_keywords_explored, override_keywords_explored INTO v_limit, v_used, v_override FROM user_quotas WHERE user_id = p_user_id;
  ELSIF p_quota_key = 'standard_content' THEN
    SELECT limit_standard_content, used_standard_content, override_standard_content INTO v_limit, v_used, v_override FROM user_quotas WHERE user_id = p_user_id;
  ELSIF p_quota_key = 'premium_content' THEN
    SELECT limit_premium_content, used_premium_content, override_premium_content INTO v_limit, v_used, v_override FROM user_quotas WHERE user_id = p_user_id;
  ELSIF p_quota_key = 'ai_credits' THEN
    SELECT limit_ai_credits, used_ai_credits, override_ai_credits INTO v_limit, v_used, v_override FROM user_quotas WHERE user_id = p_user_id;
  ELSE
    RETURN FALSE;
  END IF;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_effective_limit := COALESCE(v_override, v_limit);

  IF v_used + p_amount > v_effective_limit THEN
    RETURN FALSE;
  END IF;

  -- Perform the update
  IF p_quota_key = 'projects' THEN
    UPDATE user_quotas SET used_projects = used_projects + p_amount WHERE user_id = p_user_id;
  ELSIF p_quota_key = 'keywords_fetched' THEN
    UPDATE user_quotas SET used_keywords_fetched = used_keywords_fetched + p_amount WHERE user_id = p_user_id;
  ELSIF p_quota_key = 'keywords_explored' THEN
    UPDATE user_quotas SET used_keywords_explored = used_keywords_explored + p_amount WHERE user_id = p_user_id;
  ELSIF p_quota_key = 'standard_content' THEN
    UPDATE user_quotas SET used_standard_content = used_standard_content + p_amount WHERE user_id = p_user_id;
  ELSIF p_quota_key = 'premium_content' THEN
    UPDATE user_quotas SET used_premium_content = used_premium_content + p_amount WHERE user_id = p_user_id;
  ELSIF p_quota_key = 'ai_credits' THEN
    UPDATE user_quotas SET used_ai_credits = used_ai_credits + p_amount WHERE user_id = p_user_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 6. Seed default subscription plans
INSERT INTO subscription_plans (id, name, monthly_price, stripe_price_id, limit_projects, limit_keywords_fetched, limit_keywords_explored, limit_standard_content, limit_premium_content, limit_ai_credits)
VALUES
  ('free', 'Free Tier', 0.00, NULL, 1, 50, 10, 2, 0, 10),
  ('pro', 'Pro Plan', 49.00, 'price_pro_placeholder', 5, 1000, 200, 30, 5, 200),
  ('enterprise', 'Enterprise Plan', 299.00, 'price_ent_placeholder', 20, 10000, 2000, 150, 30, 1000)
ON CONFLICT (id) DO NOTHING;
