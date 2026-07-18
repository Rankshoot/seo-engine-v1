/* Rankshoot service worker — Web Push for desktop/OS notifications.
 *
 * Receives a push from the server (sent when a background job finishes) and
 * shows an OS notification. To avoid double-notifying, it SUPPRESSES the
 * notification when an app window is already focused/visible — in that case the
 * open page has already updated the in-app bell (and shown a client-side
 * notification), so the OS-level one would be redundant. When the browser/tab
 * is closed, no client is focused, so the notification shows.
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }

  const title = data.title || "Rankshoot";
  const options = {
    body: data.body || "",
    icon: "/favicon.png",
    badge: "/favicon.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
    requireInteraction: false,
  };

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const focused = clients.some(
        (c) => c.focused || c.visibilityState === "visible",
      );
      // A focused app tab already surfaced this — don't double-notify.
      if (focused) return;
      await self.registration.showNotification(title, options);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus an existing tab if one is open, else open a new one.
      for (const c of clients) {
        if ("focus" in c) {
          await c.focus();
          if ("navigate" in c && url) {
            try {
              await c.navigate(url);
            } catch (e) {
              /* cross-origin or not allowed — ignore */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url);
    })(),
  );
});
