// Service worker for Web Push alerts. It deliberately does no caching: the
// dashboard should always show live data, so it only receives and shows pushes.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = typeof data.title === "string" ? data.title : "Wheat temperature";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      tag: typeof data.tag === "string" ? data.tag : "wheat-alert",
      renotify: true,
      icon: "favicon.svg",
      data: { url: typeof data.url === "string" ? data.url : self.registration.scope },
    }),
  );
});

// Browsers occasionally renew a push subscription. Register the replacement with the
// API (passed as ?api= when the page registered this worker) so alerts keep arriving.
const API_BASE_URL = new URL(self.location.href).searchParams.get("api");

async function postJson(path, body) {
  return fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      if (!API_BASE_URL) return;
      const previous = event.oldSubscription;
      const next =
        event.newSubscription ||
        (previous ? await self.registration.pushManager.subscribe(previous.options) : null);
      if (next) await postJson("/api/v1/push/subscribe", { ...next.toJSON(), label: "Renewed device", renewed: true });
      if (previous) await postJson("/api/v1/push/unsubscribe", { endpoint: previous.endpoint });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url.startsWith(self.registration.scope));
      if (open) return open.focus();
      return self.clients.openWindow(target);
    }),
  );
});
