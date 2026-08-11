const CACHE = "scm-v1";
self.addEventListener("install", (e) => {
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  // network-first pour l'API, cache simple pour le reste
  if (e.request.url.includes("/api/")) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const res = await fetch(e.request);
        cache.put(e.request, res.clone());
        return res;
      } catch {
        const cached = await cache.match(e.request);
        return cached || Response.error();
      }
    })
  );
});

// Reçoit une notification push même si l'appli n'est pas ouverte au premier plan
self.addEventListener("push", (event) => {
  let data = { titre: "Sud-Comoé Mobilité", corps: "Mise à jour de votre course.", rideId: null };
  try {
    data = event.data.json();
  } catch {
    /* payload non-JSON, on garde les valeurs par défaut */
  }
  event.waitUntil(
    self.registration.showNotification(data.titre || "Sud-Comoé Mobilité", {
      body: data.corps || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.rideId || undefined, // remplace la précédente notif de la même course plutôt que d'empiler
      data: { rideId: data.rideId || null },
    })
  );
});

// Ramène l'utilisateur dans l'appli au clic sur la notification
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      if (clientsArr.length > 0) {
        return clientsArr[0].focus();
      }
      return self.clients.openWindow("/");
    })
  );
});
