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
