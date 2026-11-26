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

function resolveSafeSameOriginPath(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return "/admin";
  }

  try {
    const parsed = new URL(rawUrl.trim(), self.location.origin);
    if (
      parsed.origin !== self.location.origin ||
      (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    ) {
      return "/admin";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/admin";
  } catch {
    return "/admin";
  }
}

self.addEventListener("push", (event) => {
  let data = {
    title: "Madzhair Barber & Co",
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

  const safeUrl = resolveSafeSameOriginPath(data.url);

  event.waitUntil(
    self.registration.showNotification(String(data.title || "Madzhair Barber & Co"), {
      body: String(data.body || ""),
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: String(data.tag || "madzhair-admin"),
      renotify: true,
      data: {
        url: safeUrl,
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath = resolveSafeSameOriginPath(
    event.notification && event.notification.data
      ? event.notification.data.url
      : "/admin"
  );

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
