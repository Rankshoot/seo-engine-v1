"use client";

/**
 * Thin wrapper over the browser Notification API for OS-level notifications.
 *
 * Works while the app is open in a tab (foreground or backgrounded) — which
 * covers "notify me when my blog is ready" for an online user. Closed-browser
 * push (Push API + service worker + VAPID) is a later addition; this module is
 * the client-facing surface either way.
 */

export type OsPermission = NotificationPermission | "unsupported";

export function osNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function osNotificationPermission(): OsPermission {
  if (!osNotificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestOsNotificationPermission(): Promise<OsPermission> {
  if (!osNotificationsSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showOsNotification(
  title: string,
  opts?: { body?: string; tag?: string; onClick?: () => void },
): void {
  if (!osNotificationsSupported() || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body: opts?.body,
      tag: opts?.tag,
      icon: "/favicon.png",
      badge: "/favicon.png",
    });
    if (opts?.onClick) {
      n.onclick = () => {
        try {
          window.focus();
          opts.onClick?.();
        } finally {
          n.close();
        }
      };
    }
  } catch {
    // Some browsers throw if constructed without a service worker on mobile.
  }
}
