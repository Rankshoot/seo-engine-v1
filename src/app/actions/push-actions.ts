'use server';

import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';

/** Persist (upsert) a browser push subscription for the signed-in user. */
export async function savePushSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: 'Not authenticated' };
  if (!sub.endpoint || !sub.p256dh || !sub.auth) {
    return { success: false, error: 'Invalid subscription' };
  }

  const { error } = await supabaseAdmin.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.userAgent ?? '',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Remove a push subscription (user turned desktop push off, or unsubscribed). */
export async function deletePushSubscription(endpoint: string): Promise<{ success: boolean }> {
  const { userId } = await auth();
  if (!userId) return { success: false };
  await supabaseAdmin
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint);
  return { success: true };
}
