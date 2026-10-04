const CACHE_NAME = "cancionero-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(["/", "/canciones"]).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Red primero (para que siempre se vea lo último si hay conexión), y si no
// hay red, lo que se haya guardado la última vez que se abrió esa página.
// Así una canción ya abierta se sigue viendo si se corta el wifi a mitad
// del culto.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/auth")) return;
  // Datos que solo ve el admin: no se guardan en el caché del navegador.
  if (url.pathname === "/api/setlists" || url.pathname === "/api/setlists/recent-songs") return;
  if (url.pathname.startsWith("/api/songs/without-chords")) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw new Error("Sin conexión y sin nada guardado para esta página.");
      }
    })
  );
});
