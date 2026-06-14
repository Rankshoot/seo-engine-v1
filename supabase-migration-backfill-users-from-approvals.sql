-- Backfill: create missing `users` rows for every clerk user in `user_approvals`.
-- Safe to re-run (uses INSERT ... ON CONFLICT DO NOTHING).

INSERT INTO public.users (id, email, plan_id, subscription_status, created_at, updated_at)
SELECT
  ua.clerk_user_id,
  ua.email,
  'free',
  'inactive',
  COALESCE(ua.created_at, now()),
  now()
FROM public.user_approvals ua
WHERE NOT EXISTS (
  SELECT 1 FROM public.users u WHERE u.id = ua.clerk_user_id
)
ON CONFLICT (id) DO NOTHING;

-- Backfill: create missing `user_quotas` rows for every user now in `users`.
-- Pulls limits from the 'free' subscription_plans row; falls back to column defaults.

INSERT INTO public.user_quotas (
  user_id,
  limit_projects,
  limit_keywords_fetched,
  limit_keywords_explored,
  limit_standard_content,
  limit_premium_content,
  limit_ai_credits,
  used_projects,
  used_keywords_fetched,
  used_keywords_explored,
  used_standard_content,
  used_premium_content,
  used_ai_credits,
  created_at,
  updated_at
)
SELECT
  u.id,
  COALESCE(sp.limit_projects, 1),
  COALESCE(sp.limit_keywords_fetched, 50),
  COALESCE(sp.limit_keywords_explored, 10),
  COALESCE(sp.limit_standard_content, 2),
  COALESCE(sp.limit_premium_content, 0),
  COALESCE(sp.limit_ai_credits, 10),
  0, 0, 0, 0, 0, 0,
  now(),
  now()
FROM public.users u
LEFT JOIN public.subscription_plans sp ON sp.id = u.plan_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_quotas uq WHERE uq.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;
