-- ============================================================
-- Existing Users Auto-Approval Migration
-- Run AFTER supabase-migration-user-approvals.sql
-- Inserts all existing project owners as 'approved' so they
-- retain access without going through the approval flow.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
-- ============================================================

INSERT INTO user_approvals (clerk_user_id, email, status, requested_at, reviewed_at, review_notes)
SELECT DISTINCT
  p.user_id AS clerk_user_id,
  COALESCE(p.user_id, '') AS email,
  'approved' AS status,
  MIN(p.created_at) AS requested_at,
  MIN(p.created_at) AS reviewed_at,
  'Auto-approved: existing user before approval system was introduced' AS review_notes
FROM projects p
WHERE p.user_id IS NOT NULL
GROUP BY p.user_id
ON CONFLICT (clerk_user_id) DO NOTHING;
