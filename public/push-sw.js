// Imported into the Workbox-generated service worker (see vite.config.ts
// workbox.importScripts) so push notifications work even when the app tab
// is closed — generateSW mode doesn't let us hand-write the main SW file.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Fixrly", body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Fixrly", {
      body: payload.body || "",
      icon: "/pwa-192x192.png",
      badge: "/icon.png",
      data: payload.data || {},
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const bookingId = event.notification.data?.booking_id;
  const url = bookingId ? "/bookings" : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
