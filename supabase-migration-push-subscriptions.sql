-- ============================================================
-- Web Push subscriptions — one row per browser/device the user
-- has opted into desktop/OS notifications on. Used by the server
-- to deliver "your blog is ready" pushes even when the app/tab is
-- closed. Run once in the Supabase SQL editor. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  -- The push service endpoint uniquely identifies a browser subscription.
  endpoint TEXT NOT NULL,
  -- Encryption keys the push service needs (from PushSubscription.toJSON()).
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One subscription row per endpoint. Re-subscribing upserts (refreshes keys).
CREATE UNIQUE INDEX IF NOT EXISTS uq_push_subscriptions_endpoint
  ON push_subscriptions(endpoint);

-- Server send path: "all subscriptions for this user".
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id);

NOTIFY pgrst, 'reload schema';
