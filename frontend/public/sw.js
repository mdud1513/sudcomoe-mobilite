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
  let data = { titre: "Scotrans", corps: "Mise à jour de votre course.", rideId: null, role: null };
  try {
    data = event.data.json();
  } catch {
    /* payload non-JSON, on garde les valeurs par défaut */
  }
  event.waitUntil(
    self.registration.showNotification(data.titre || "Scotrans", {
      body: data.corps || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.rideId || undefined, // remplace la précédente notif de la même course plutôt que d'empiler
      data: { rideId: data.rideId || null, role: data.role || null },
    })
  );
});

// Ramène l'utilisateur directement sur l'écran concerné par la notification (bon onglet, bonne course)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { rideId, role } = event.notification.data || {};
  const params = new URLSearchParams();
  if (role) params.set("role", role);
  if (rideId) params.set("course", rideId);
  const cible = `/${params.toString() ? `?${params.toString()}` : ""}`;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      const existante = clientsArr[0];
      if (existante) {
        return existante.navigate(cible).then((c) => c.focus());
      }
      return self.clients.openWindow(cible);
    })
  );
});
