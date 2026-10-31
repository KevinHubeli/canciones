// Reglas puras del service worker (qué se puede guardar, qué URLs se aceptan
// para uso sin conexión). Están en un archivo aparte, sin APIs del navegador,
// para poder probarlas con Node (cancionero-sw.test.ts). sw.js las carga con importScripts.
(function (root) {
  "use strict";

  var UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

  // Rutas que NUNCA se guardan: son del admin, tienen datos de sesión o son
  // descargas pesadas. Si alguien cierra sesión no tiene que quedar nada de esto en el celular.
  var NEVER_CACHE = [
    /^\/admin/,
    /^\/api\/auth/,
    /^\/api\/admin/,
    /^\/api\/setlists\/?$/,
    /^\/api\/setlists\/(recent-songs|last-tones)(\/|$)/,
    /^\/api\/songs\/(trash|duplicates|without-chords|import)(\/|$)/,
    /\/(versions|restore|match-lacuerda)(\/|$)/,
    /export-pptx/,
    /\.pptx$/i,
  ];

  var PRECACHE_ALLOWED = [
    new RegExp("^/canciones/" + UUID + "$"),
    new RegExp("^/api/songs/" + UUID + "$"),
    new RegExp("^/powers/" + UUID + "$"),
  ];

  function isNeverCachePath(pathname) {
    for (var i = 0; i < NEVER_CACHE.length; i++) {
      if (NEVER_CACHE[i].test(pathname)) return true;
    }
    return false;
  }

  /** ¿Se puede guardar la respuesta de esta URL? (la decisión por pedido, con los headers, la toma sw.js) */
  function isCacheableUrl(pathname, searchParams) {
    if (isNeverCachePath(pathname)) return false;
    // Cada búsqueda distinta sería una entrada nueva en el caché: solo se guarda el listado base.
    if (pathname === "/api/songs" && searchParams && searchParams.has("q")) return false;
    return true;
  }

  /** Los archivos de /_next/static llevan hash en el nombre: nunca cambian, van primero desde el caché. */
  function isImmutableAsset(pathname) {
    return pathname.indexOf("/_next/static/") === 0;
  }

  /** Clave de caché estable: mismos parámetros escritos distinto (a,b vs a%2Cb) dan la misma clave. */
  function normalizeKey(href, origin) {
    var url;
    try {
      url = new URL(href, origin);
    } catch {
      return null;
    }
    if (url.origin !== origin) return null;
    var params = new URLSearchParams(url.search);
    var qs = params.toString();
    return url.origin + url.pathname + (qs ? "?" + qs : "");
  }

  /**
   * Valida lo que manda la página para guardar sin conexión: solo strings del
   * mismo origen, solo canciones/powers/API de canciones, sin duplicados y con tope.
   * Devuelve las claves normalizadas (URL absoluta).
   */
  function validatePrecacheUrls(urls, origin, max) {
    if (!Array.isArray(urls)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < urls.length && out.length < max; i++) {
      var raw = urls[i];
      if (typeof raw !== "string" || raw.length === 0 || raw.length > 2000) continue;
      // Solo rutas del propio sitio: nada de "//otro.com" ni "https://otro.com".
      if (raw.charAt(0) !== "/" || raw.charAt(1) === "/" || raw.charAt(1) === "\\") continue;
      var key = normalizeKey(raw, origin);
      if (!key) continue;
      var pathname = new URL(key).pathname;
      var allowed = false;
      for (var j = 0; j < PRECACHE_ALLOWED.length; j++) {
        if (PRECACHE_ALLOWED[j].test(pathname)) allowed = true;
      }
      if (!allowed || isNeverCachePath(pathname)) continue;
      if (seen[key]) continue;
      seen[key] = true;
      out.push(key);
    }
    return out;
  }

  /** Archivos de /_next/static que menciona un HTML, para dejarlos guardados junto con la página. */
  function extractStaticAssets(html, max) {
    var found = [];
    var seen = {};
    var re = /\/_next\/static\/[A-Za-z0-9_\-./%~\[\]]+?\.(?:js|css)/g;
    var m;
    while ((m = re.exec(html)) !== null && found.length < max) {
      if (!seen[m[0]]) {
        seen[m[0]] = true;
        found.push(m[0]);
      }
    }
    return found;
  }

  var api = {
    isNeverCachePath: isNeverCachePath,
    isCacheableUrl: isCacheableUrl,
    isImmutableAsset: isImmutableAsset,
    normalizeKey: normalizeKey,
    validatePrecacheUrls: validatePrecacheUrls,
    extractStaticAssets: extractStaticAssets,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CancioneroSwRules = api;
})(typeof self !== "undefined" ? self : globalThis);
