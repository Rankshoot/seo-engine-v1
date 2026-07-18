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
  opts?: { body?: string; tag?: string; url?: string },
): void {
  if (!osNotificationsSupported() || Notification.permission !== "granted") return;

  void (async () => {
    // Prefer the service-worker registration. On desktop Chrome/Brave the plain
    // `new Notification()` constructor is unreliable (and can silently do
    // nothing) once a service worker controls the page — `showNotification` is
    // the documented, dependable path, and it works whichever tab/Space the user
    // is on. Clicks route through the SW's `notificationclick` handler via `data.url`.
    try {
      const reg =
        "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) {
        await reg.showNotification(title, {
          body: opts?.body,
          tag: opts?.tag,
          icon: "/favicon.png",
          badge: "/favicon.png",
          data: { url: opts?.url ?? "/" },
        });
        return;
      }
    } catch {
      // fall through to the legacy constructor
    }

    // Fallback: no service worker available.
    try {
      const n = new Notification(title, {
        body: opts?.body,
        tag: opts?.tag,
        icon: "/favicon.png",
        badge: "/favicon.png",
      });
      const url = opts?.url;
      if (url) {
        n.onclick = () => {
          try {
            window.focus();
            window.location.href = url;
          } finally {
            n.close();
          }
        };
      }
    } catch {
      // give up quietly
    }
  })();
}
