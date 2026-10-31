/* Service worker del Cancionero.
 *
 * - Red primero para páginas y API (siempre se ve lo último si hay conexión);
 *   si la red tarda más de unos segundos o no hay, sale la copia guardada.
 * - Caché primero para /_next/static (archivos con hash: nunca cambian).
 * - Nunca guarda el admin, la sesión, el listado de powers ni las descargas
 *   (ver sw-rules.js).
 * - Si no hay red ni copia, una navegación muestra /offline.html.
 * - Mensajes de la página:
 *     { type: "clear-caches" }                  borra TODO (al cerrar sesión)
 *     { type: "precache", urls, token }         guarda esas URLs para usarlas sin conexión
 */
importScripts("/sw-rules.js");

const rules = self.CancioneroSwRules;

// Si cambia la estrategia, se sube la versión: al activarse se borran las anteriores.
const RUNTIME_CACHE = "cancionero-v2";
// Lo que se guardó a pedido (power abierto con wifi): aparte, para que la poda del runtime no lo toque.
const OFFLINE_CACHE = "cancionero-offline-v2";
const KNOWN_CACHES = [RUNTIME_CACHE, OFFLINE_CACHE];

const MAX_RUNTIME_ENTRIES = 300;
const MAX_OFFLINE_ENTRIES = 400;
const MAX_PRECACHE_URLS = 120;
const MAX_PRECACHE_ASSETS = 80;
// Con copia guardada, si la red no responde en este tiempo se muestra la copia (wifi malo en pleno culto).
const SLOW_NETWORK_MS = 4000;
const OFFLINE_URL = "/offline.html";
const PROTECTED_PATHS = ["/", "/canciones", OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(RUNTIME_CACHE).then((cache) =>
      // Una por una: si falla "/" (sin red) igual se guarda la pantalla sin conexión.
      Promise.all([OFFLINE_URL, "/", "/canciones"].map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !KNOWN_CACHES.includes(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isStorable(response) {
  return response && response.status === 200 && response.type === "basic";
}

function isRscRequest(request, url) {
  return (
    request.headers.get("rsc") === "1" ||
    request.headers.has("next-router-prefetch") ||
    url.searchParams.has("_rsc")
  );
}

async function matchAny(key) {
  return caches.match(key, { ignoreVary: true });
}

async function trimCache(cache, max) {
  const keys = await cache.keys();
  let extra = keys.length - max;
  for (const request of keys) {
    if (extra <= 0) break;
    if (PROTECTED_PATHS.includes(new URL(request.url).pathname)) continue;
    await cache.delete(request);
    extra--;
  }
}

async function store(cacheName, key, response, max) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(key, response);
    await trimCache(cache, max);
  } catch {
    // Cuota llena o respuesta no guardable: se sigue sin esa copia.
  }
}

function offlineJson() {
  return new Response(JSON.stringify({ error: "Sin conexión." }), {
    status: 503,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function offlineFallback(request, key) {
  if (request.mode === "navigate") {
    const url = new URL(key);
    // Abrir una canción del power sin la marca de "avanzar" (o sin el power) es mejor que nada.
    const withoutS = new URL(url);
    withoutS.searchParams.delete("s");
    const withoutQuery = url.origin + url.pathname;
    for (const candidate of [withoutS.toString(), withoutQuery]) {
      const hit = await matchAny(rules.normalizeKey(candidate, url.origin));
      if (hit) return hit;
    }
    const page = await matchAny(OFFLINE_URL);
    if (page) return page;
    return new Response("Sin conexión.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  if (new URL(request.url).pathname.startsWith("/api/")) return offlineJson();
  return Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Pedidos parciales (rangos) y los de navegación interna de Next (RSC): no se tocan.
  if (request.headers.has("range") || isRscRequest(request, url)) return;

  const isStatic = rules.isImmutableAsset(url.pathname);
  if (url.pathname.startsWith("/_next/") && !isStatic) return;

  if (!rules.isCacheableUrl(url.pathname, url.searchParams)) {
    // Nada se guarda, pero si no hay red una navegación muestra la pantalla de aviso.
    if (request.mode === "navigate") {
      event.respondWith(
        fetch(request).catch(async () => (await matchAny(OFFLINE_URL)) || Response.error())
      );
    }
    return;
  }

  if (isStatic) {
    event.respondWith(cacheFirst(event, request));
    return;
  }

  const key = rules.normalizeKey(request.url, self.location.origin);
  if (!key) return;
  networkFirst(event, request, key);
});

async function cacheFirst(event, request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (isStorable(response)) {
    // Se guarda en segundo plano para no demorar la respuesta (clone() antes: después el cuerpo está en uso).
    event.waitUntil(store(RUNTIME_CACHE, request, response.clone(), MAX_RUNTIME_ENTRIES));
  }
  return response;
}

function networkFirst(event, request, key) {
  const network = fetch(request);

  // La copia se guarda siempre que llegue la respuesta, aunque ya se haya mostrado la guardada.
  event.waitUntil(
    network
      .then((response) => {
        if (!isStorable(response)) return;
        return store(RUNTIME_CACHE, key, response.clone(), MAX_RUNTIME_ENTRIES);
      })
      .catch(() => {})
  );

  event.respondWith(
    (async () => {
      const cached = await matchAny(key);
      if (!cached) {
        try {
          return await network;
        } catch {
          return offlineFallback(request, key);
        }
      }
      const slow = new Promise((resolve) => setTimeout(() => resolve(null), SLOW_NETWORK_MS));
      const winner = await Promise.race([network.catch(() => null), slow]);
      // Un error del servidor (caída de la base) no pisa una página que andaba bien.
      return winner && winner.status < 500 ? winner : cached;
    })()
  );
}

// ---- Mensajes de la página ----

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "clear-caches") {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(() => event.source && event.source.postMessage({ type: "caches-cleared" }))
        .catch(() => {})
    );
    return;
  }

  if (data.type === "precache") {
    event.waitUntil(precache(data.urls, data.token, event.source));
  }
});

async function runPool(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function precache(urls, token, source) {
  const keys = rules.validatePrecacheUrls(urls, self.location.origin, MAX_PRECACHE_URLS);
  let ok = 0;
  let failed = 0;
  const assets = new Set();

  await runPool(keys, 4, async (key) => {
    try {
      const response = await fetch(key, { credentials: "same-origin" });
      if (!isStorable(response)) {
        failed++;
        return;
      }
      const type = response.headers.get("content-type") || "";
      if (type.includes("text/html") && assets.size < MAX_PRECACHE_ASSETS) {
        // El HTML nombra los archivos de la app que necesita: se guardan también,
        // si no la página guardada abriría pero sin sus scripts.
        const html = await response.clone().text();
        for (const asset of rules.extractStaticAssets(html, MAX_PRECACHE_ASSETS)) assets.add(asset);
      }
      await store(OFFLINE_CACHE, key, response, MAX_OFFLINE_ENTRIES);
      ok++;
    } catch {
      failed++;
    }
  });

  await runPool([...assets].slice(0, MAX_PRECACHE_ASSETS), 4, async (path) => {
    try {
      if (await caches.match(path)) return;
      const response = await fetch(path);
      if (isStorable(response)) await store(RUNTIME_CACHE, path, response, MAX_RUNTIME_ENTRIES);
    } catch {
      // Un archivo que no se pudo bajar no invalida el resto.
    }
  });

  if (source) {
    source.postMessage({ type: "precache-done", token, ok, failed, total: keys.length });
  }
}
