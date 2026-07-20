"use client";

import { savePushSubscription, deletePushSubscription } from "@/app/actions/push-actions";

/** VAPID public key → Uint8Array as required by pushManager.subscribe. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Back the array with an explicit ArrayBuffer so it satisfies BufferSource.
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function webPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!webPushSupported()) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!webPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function isPushSubscribed(): Promise<boolean> {
  return !!(await getExistingSubscription());
}

/**
 * Turn on desktop notifications.
 *
 * The important distinction: a plain `new Notification()` (used while the app is
 * OPEN) needs only the Notification permission — no push service. A push
 * *subscription* (for delivery when the app is CLOSED) additionally needs the
 * browser's push backend, which Brave blocks by default. So we treat permission
 * as the source of truth for "enabled" and register the push subscription as a
 * best-effort bonus. `closedTab` reports whether closed-app delivery is set up.
 */
export async function enablePush(): Promise<{ ok: boolean; error?: string; closedTab?: boolean }> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { ok: false, error: "This browser doesn't support notifications." };
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    return {
      ok: false,
      error:
        perm === "denied"
          ? "Notifications are blocked for this site. Allow them in your browser's site settings (and in macOS System Settings → Notifications for your browser), then try again."
          : "Notification permission was not granted.",
    };
  }

  // Permission is granted → in-app (foreground/backgrounded-tab) notifications
  // will work. Now try the push subscription for closed-app delivery.
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!webPushSupported() || !vapid) return { ok: true, closedTab: false };

  try {
    const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
    if (!reg) return { ok: true, closedTab: false };
    await navigator.serviceWorker.ready;

    const appServerKey = urlBase64ToUint8Array(vapid);
    let sub = await reg.pushManager.getSubscription();
    // A subscription made with a *different* VAPID key can't be reused — drop it.
    if (sub && !applicationKeysMatch(sub.options?.applicationServerKey, appServerKey)) {
      try { await sub.unsubscribe(); } catch { /* ignore */ }
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey });
    }

    const json = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } };
    const res = await savePushSubscription({
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    });
    return { ok: true, closedTab: res.success };
  } catch {
    // Push service blocked (e.g. Brave's default) or unreachable. Foreground
    // notifications still work — closed-app delivery just isn't available.
    return { ok: true, closedTab: false };
  }
}

/** True if an existing subscription's server key matches the current VAPID key. */
function applicationKeysMatch(existing: ArrayBuffer | null | undefined, current: Uint8Array): boolean {
  if (!existing) return false;
  const a = new Uint8Array(existing);
  if (a.length !== current.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== current[i]) return false;
  return true;
}

/** Turn off desktop push: unsubscribe locally and remove the server record. */
export async function disablePush(): Promise<{ ok: boolean }> {
  const sub = await getExistingSubscription();
  if (sub) {
    try {
      await deletePushSubscription(sub.endpoint);
    } catch {
      /* best effort */
    }
    try {
      await sub.unsubscribe();
    } catch {
      /* best effort */
    }
  }
  return { ok: true };
}
