import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Server-side Web Push sender. Delivers OS notifications to a user's subscribed
 * browsers even when the app/tab is closed — used when a background job (e.g. a
 * blog generation) finishes. Best-effort: never throws to its caller, and prunes
 * subscriptions the push service reports as expired.
 */
let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:notifications@rankshoot.com';
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!userId || !ensureConfigured()) return;

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (!subs || subs.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        // 404/410 → the subscription is gone; drop it so we stop trying.
        if (code === 404 || code === 410) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        }
      }
    }),
  );
}
