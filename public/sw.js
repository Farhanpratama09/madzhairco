/**
 * Madzhair.co Service Worker (v1.9)
 * - Handles Web Push notifications & click navigation to /admin.
 * - Intentionally does NOT cache dynamic HTML/API routes (/admin, /api/*, /tiket/*)
 *   to keep Supabase Auth sessions and live chair queue strictly fresh.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {
    title: "Madzhair.co",
    body: "Ada pembaruan jadwal antrean studio.",
    url: "/admin",
    tag: "madzhair-admin",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === "object") {
        data = {
          ...data,
          ...parsed,
        };
      }
    } catch {
      const text = event.data.text();
      if (text) {
        data.body = text;
      }
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/icons/icon-192.png",
      badge: data.badge || "/icons/icon-192.png",
      tag: data.tag || "madzhair-admin",
      renotify: true,
      data: {
        url: data.url || "/admin",
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath =
    (event.notification &&
      event.notification.data &&
      typeof event.notification.data.url === "string" &&
      event.notification.data.url) ||
    "/admin";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes("/admin") && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetPath);
        }
        return undefined;
      })
  );
});
