// Service worker : reçoit les notifications push (même appli fermée) et rouvre l'agenda au clic.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(d.title || "Mon agenda", {
    body: d.body || "", tag: d.tag, icon: "/icon-192.png"
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) =>
      list.length ? list[0].focus() : self.clients.openWindow("/"))
  );
});
