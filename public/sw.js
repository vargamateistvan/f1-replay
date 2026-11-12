/* global self, clients */
// Push only: deliberately no fetch handler, offline cache or forced activation.
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let message;
    try {
      message = event.data?.json();
    } catch {
      console.warn("F1 Replay received an invalid push payload.");
    }
    const valid = message?.version === 1 &&
      typeof message.title === "string" && typeof message.body === "string";
    await self.registration.showNotification(valid ? message.title : "F1 Replay", {
      body: valid ? message.body : "Open F1 Replay to see the latest update.",
      icon: "/app-icon-192.png",
      badge: "/app-icon-192.png",
      tag: valid && typeof message.tag === "string" ? message.tag : "f1-replay-update",
      data: { url: valid && typeof message.url === "string" ? message.url : "/home" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    let target = new URL("/home", self.location.origin);
    try {
      const requested = new URL(event.notification.data?.url ?? "/home", self.location.origin);
      if (requested.origin === self.location.origin && !requested.username && !requested.password) {
        target = requested;
      }
    } catch {
      console.warn("F1 Replay received an invalid notification destination.");
    }
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      const navigated = await existing.navigate(target.href);
      if (navigated) {
        await navigated.focus();
        return;
      }
    }
    await clients.openWindow(target.href);
  })());
});
