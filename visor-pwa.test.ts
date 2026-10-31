// Pruebas del visor / PWA: contraste de colores, reglas y mensajes del service
// worker, links de powers y preferencias del visor. Se corre con: tsx visor-pwa.test.ts
import fs from "node:fs";
import vm from "node:vm";
import { buildPowerPrecacheUrls, formatServiceDate, powerDescription, songHref } from "./src/lib/powerView";
import {
  AUTOSCROLL_SPEEDS_PX_PER_SEC,
  DEFAULT_AUTOSCROLL_SPEED_INDEX,
  DEFAULT_TEXT_SIZE_INDEX,
  MAX_CAPO,
  TEXT_SIZES_PX,
  autoscrollStep,
  capoSummary,
  clampCapo,
  parseStoredIndex,
  swipeDirection,
} from "./src/lib/viewerPrefs";
import { keepExistingRecents, parseRecentSongs } from "./src/lib/recentSongs";
import { decodeDividers, mergeEntries, type SetlistDivider } from "./src/lib/dividers";

let failures = 0;
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failures++;
    console.log(`  FAIL: ${name}${detail ? " — " + detail : ""}`);
  }
}

// ---------- Contraste (WCAG) ----------
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Las pruebas leen los tokens reales de globals.css: si alguien los cambia, se revalidan solos.
const css = fs.readFileSync("src/app/globals.css", "utf8");
function tokensAfter(marker: string): Record<string, string> {
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`No se encontró "${marker}" en globals.css`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}
const light = tokensAfter(":root {");
const darkAuto = tokensAfter(':root:not([data-theme="light"])');
const darkManual = tokensAfter(':root[data-theme="dark"]');

{
  check("tokens: dark automático == dark manual", JSON.stringify(darkAuto) === JSON.stringify(darkManual));
  for (const [mode, t] of [
    ["claro", light],
    ["oscuro", darkManual],
  ] as const) {
    for (const bg of ["plum-deep", "night", "plum"]) {
      const lilac = ratio(t["lilac-light"], t[bg]);
      check(`contraste ${mode}: lilac-light sobre ${bg} >= 4.5`, lilac >= 4.5, lilac.toFixed(2));
      const mist = ratio(t["mist"], t[bg]);
      check(`contraste ${mode}: mist sobre ${bg} >= 7`, mist >= 7, mist.toFixed(2));
      const gold = ratio(t["chord-gold"], t[bg]);
      check(`contraste ${mode}: chord-gold sobre ${bg} >= 4.5`, gold >= 4.5, gold.toFixed(2));
      const accent = ratio(t["accent"], t[bg]);
      check(`contraste ${mode}: accent sobre ${bg} >= 4.5`, accent >= 4.5, accent.toFixed(2));
    }
    const onAccent = ratio(t["night"], t["accent"]);
    check(`contraste ${mode}: texto night sobre botón accent >= 4.5`, onAccent >= 4.5, onAccent.toFixed(2));
  }
  check("ratio: negro sobre blanco = 21", Math.abs(ratio("#000000", "#ffffff") - 21) < 0.01);
  check("ratio: igual color = 1", Math.abs(ratio("#8a8073", "#8a8073") - 1) < 1e-9);
  // El color viejo no cumplía: la prueba tiene que poder fallar.
  check("ratio: el lilac viejo (#8a8073) sobre #f6f3ee no llegaba a 4.5", ratio("#8a8073", "#f6f3ee") < 4.5);
}

// ---------- Reglas del service worker ----------
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rules = require("./public/sw-rules.js") as {
  isNeverCachePath: (p: string) => boolean;
  isCacheableUrl: (p: string, sp?: URLSearchParams) => boolean;
  isImmutableAsset: (p: string) => boolean;
  normalizeKey: (href: string, origin: string) => string | null;
  validatePrecacheUrls: (urls: unknown, origin: string, max: number) => string[];
  extractStaticAssets: (html: string, max: number) => string[];
};
const ORIGIN = "https://cancionero.example";
const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";

{
  const never = [
    "/admin",
    "/admin/papelera",
    "/admin/setlists/abc",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/admin/users",
    "/api/admin/stats",
    "/api/setlists",
    "/api/setlists/",
    "/api/setlists/recent-songs",
    "/api/setlists/last-tones",
    `/api/setlists/${ID1}/export-pptx`,
    "/api/songs/trash",
    "/api/songs/duplicates",
    "/api/songs/without-chords",
    `/api/songs/${ID1}/versions`,
    `/api/songs/${ID1}/versions/${ID2}`,
    `/api/songs/${ID1}/restore`,
    `/api/songs/${ID1}/match-lacuerda`,
    "/descarga/power.pptx",
  ];
  for (const p of never) check(`nunca se guarda: ${p}`, !rules.isCacheableUrl(p) && rules.isNeverCachePath(p));

  const yes = [
    "/",
    "/canciones",
    `/canciones/${ID1}`,
    `/powers/${ID1}`,
    `/powers/${ID1}/vista-previa`,
    `/api/songs/${ID1}`,
    `/api/setlists/${ID1}`,
    "/api/songs",
    "/offline.html",
    "/manifest.json",
  ];
  for (const p of yes) check(`se puede guardar: ${p}`, rules.isCacheableUrl(p, new URLSearchParams()));

  check("listado con búsqueda (q) no se guarda", !rules.isCacheableUrl("/api/songs", new URLSearchParams("q=alabar")));
  check("listado paginado sin búsqueda sí", rules.isCacheableUrl("/api/songs", new URLSearchParams("limit=24&offset=24")));
  check("/_next/static es inmutable", rules.isImmutableAsset("/_next/static/chunks/abc.js"));
  check("/_next/image no es inmutable", !rules.isImmutableAsset("/_next/image"));
  check("una canción no es inmutable", !rules.isImmutableAsset(`/canciones/${ID1}`));
}

{
  check("normalizeKey: mismo origen", rules.normalizeKey(`/canciones/${ID1}?a=1`, ORIGIN) === `${ORIGIN}/canciones/${ID1}?a=1`);
  check("normalizeKey: otro origen => null", rules.normalizeKey("https://otro.com/x", ORIGIN) === null);
  check(
    "normalizeKey: a,b y a%2Cb dan la misma clave",
    rules.normalizeKey(`/canciones/${ID1}?set=a,b&i=0`, ORIGIN) === rules.normalizeKey(`/canciones/${ID1}?set=a%2Cb&i=0`, ORIGIN)
  );
  check("normalizeKey: sin query no deja '?'", rules.normalizeKey("/canciones", ORIGIN) === `${ORIGIN}/canciones`);
}

{
  const ok = rules.validatePrecacheUrls(
    [`/canciones/${ID1}?set=${ID1},${ID2}&i=0`, `/api/songs/${ID1}`, `/powers/${ID3}`],
    ORIGIN,
    10
  );
  check("precache: acepta canciones, API de canciones y powers", ok.length === 3, String(ok.length));

  const bad = rules.validatePrecacheUrls(
    [
      "https://evil.com/canciones/" + ID1,
      "//evil.com/canciones/" + ID1,
      "/\\evil.com",
      "/admin",
      "/admin/papelera",
      "/api/auth/login",
      "/api/setlists",
      `/api/songs/${ID1}/versions`,
      `/api/setlists/${ID1}/export-pptx`,
      "/canciones/no-es-un-uuid",
      "/canciones",
      "/",
      42,
      null,
      {},
      "",
      "javascript:alert(1)",
      "/canciones/" + ID1 + "x".repeat(3000),
    ],
    ORIGIN,
    50
  );
  check("precache: rechaza todo lo que no corresponde", bad.length === 0, JSON.stringify(bad));

  check("precache: no-array => []", rules.validatePrecacheUrls("x", ORIGIN, 5).length === 0 && rules.validatePrecacheUrls(undefined, ORIGIN, 5).length === 0);

  const dup = rules.validatePrecacheUrls(
    [`/canciones/${ID1}?set=a,b&i=0`, `/canciones/${ID1}?set=a%2Cb&i=0`, `/canciones/${ID1}?set=a,b&i=0`],
    ORIGIN,
    10
  );
  check("precache: descarta duplicados (aunque estén escritos distinto)", dup.length === 1, String(dup.length));

  const many = Array.from({ length: 300 }, (_, i) => `/canciones/${ID1}?i=${i}`);
  check("precache: respeta el tope", rules.validatePrecacheUrls(many, ORIGIN, 120).length === 120);
}

{
  const html = `<script src="/_next/static/chunks/app-1a2b.js"></script><link href="/_next/static/css/app.css"><script src="/_next/static/chunks/app-1a2b.js"></script><img src="/_next/static/media/x.png"><script src="https://cdn.x/_next/static/y.js">`;
  const found = rules.extractStaticAssets(html, 10);
  check("assets: encuentra js y css sin repetir", found.length === 3 && found.includes("/_next/static/css/app.css"), found.join(","));
  check("assets: respeta el tope", rules.extractStaticAssets(html, 1).length === 1);
}

// ---------- Links del power y precarga ----------
{
  const songs = [ID1, ID2, ID3];
  const dividers: SetlistDivider[] = [
    { name: "ALABANZA", position: 0 },
    { name: "OFRENDA", position: 2 },
  ];
  const ctx = { ids: songs, semitones: [0, 2, -1], dividers };
  const first = songHref(ctx, 0)!;
  const u = new URL(first, ORIGIN);
  check("songHref: ruta de la canción", u.pathname === `/canciones/${ID1}`);
  check("songHref: set, i, t y d", u.searchParams.get("set") === songs.join(",") && u.searchParams.get("i") === "0" && u.searchParams.get("t") === "0,2,-1" && u.searchParams.get("d") === "ALABANZA.0,OFRENDA.2");
  check("songHref: sin forward no lleva s", !u.searchParams.has("s"));
  check("songHref: forward lleva s=1", new URL(songHref(ctx, 1, true)!, ORIGIN).searchParams.get("s") === "1");
  check("songHref: índice fuera de rango => null", songHref(ctx, 3) === null && songHref(ctx, -1) === null && songHref(ctx, 1.5) === null);
  check("songHref: sin divisores no lleva d", !new URL(songHref({ ids: songs }, 0)!, ORIGIN).searchParams.has("d"));
  // Los divisores que viajan en la URL se leen igual que como se guardaron.
  const back = decodeDividers(u.searchParams.get("d") ?? undefined, songs.length);
  check("songHref: los divisores sobreviven al ida y vuelta", JSON.stringify(back) === JSON.stringify(dividers));

  const urls = buildPowerPrecacheUrls(ctx);
  check("precache power: 3 URLs por canción", urls.length === 9, String(urls.length));
  const accepted = rules.validatePrecacheUrls(urls, ORIGIN, 120);
  check("precache power: el service worker acepta todas las URLs que arma la página", accepted.length === urls.length, `${accepted.length}/${urls.length}`);
  // Orden: canción 1 (lista, avanzando, API), canción 2, canción 3 -> el índice sube.
  const order = urls
    .filter((x) => x.startsWith("/canciones/") && !x.includes("s=1"))
    .map((x) => new URL(x, ORIGIN).searchParams.get("i"));
  check("precache power: sigue el orden del power", order.join() === "0,1,2", order.join());
  check("precache power: la canción 1 va primero", urls[0] === first);
  check("precache power: sin canciones => []", buildPowerPrecacheUrls({ ids: [] }).length === 0);
  const big = Array.from({ length: 80 }, (_, i) => `${i.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`);
  check("precache power: tope de 120", buildPowerPrecacheUrls({ ids: big }).length === 120);
  check(
    "precache power: ids repetidos no repiten URLs de API",
    buildPowerPrecacheUrls({ ids: [ID1, ID1] }).filter((x) => x.startsWith("/api/")).length === 1
  );

  // El número de cada canción (i) coincide con su lugar entre canciones, ignorando divisores.
  const entries = mergeEntries(songs, dividers);
  let n = -1;
  const indexes = entries.flatMap((e) => (e.kind === "song" ? [++n] : []));
  check("entradas del power: índices de canción consecutivos", indexes.join() === "0,1,2");
}

{
  check("fecha: formato es-AR", /domingo/.test(formatServiceDate("2026-11-01") ?? "") && /noviembre/.test(formatServiceDate("2026-11-01") ?? "") && /2026/.test(formatServiceDate("2026-11-01") ?? ""), String(formatServiceDate("2026-11-01")));
  check("fecha: no se corre por zona horaria", /\b1\b/.test(formatServiceDate("2026-11-01") ?? ""));
  check("fecha: inválida => null", formatServiceDate("2026-02-31") === null && formatServiceDate("hoy") === null && formatServiceDate("") === null && formatServiceDate(null) === null && formatServiceDate(undefined) === null);
  check("descripción: con fecha", powerDescription(5, "2026-11-01").startsWith("5 canciones · "));
  check("descripción: singular", powerDescription(1) === "1 canción");
  check("descripción: vacío", powerDescription(0) === "Sin canciones todavía");
  check("descripción: fecha inválida se ignora", powerDescription(2, "basura") === "2 canciones");
}

// ---------- Preferencias del visor ----------
{
  check("tamaños de letra: crecen y llegan a 28", TEXT_SIZES_PX.every((v, i, a) => i === 0 || v > a[i - 1]) && TEXT_SIZES_PX[TEXT_SIZES_PX.length - 1] === 28);
  check("tamaño por defecto sigue siendo 16px", TEXT_SIZES_PX[DEFAULT_TEXT_SIZE_INDEX] === 16);
  check("velocidades crecen", AUTOSCROLL_SPEEDS_PX_PER_SEC.every((v, i, a) => i === 0 || v > a[i - 1]));
  check("velocidad por defecto = 50px/s (2px cada 40ms de antes)", AUTOSCROLL_SPEEDS_PX_PER_SEC[DEFAULT_AUTOSCROLL_SPEED_INDEX] === 50);

  check("parseStoredIndex: válido", parseStoredIndex("3", 6, 1) === 3);
  check("parseStoredIndex: null/vacío => default", parseStoredIndex(null, 6, 1) === 1 && parseStoredIndex("", 6, 1) === 1 && parseStoredIndex("  ", 6, 1) === 1);
  check("parseStoredIndex: fuera de rango => default", parseStoredIndex("6", 6, 1) === 1 && parseStoredIndex("-1", 6, 1) === 1);
  check("parseStoredIndex: basura => default", parseStoredIndex("abc", 6, 1) === 1 && parseStoredIndex("2.5", 6, 1) === 1);
  check("parseStoredIndex: un índice viejo (0..2) sigue valiendo", parseStoredIndex("2", TEXT_SIZES_PX.length, 1) === 2);

  check("clampCapo", clampCapo(-3) === 0 && clampCapo(99) === MAX_CAPO && clampCapo(3.4) === 3 && clampCapo(NaN) === 0);
  check("capoSummary: con capo", capoSummary(3, "G") === "Capo 3 · tocá en G");
  check("capoSummary: sin capo", capoSummary(0, "G") === "Sin capo");

  const base = { dx: -120, dy: 10, durationMs: 200, maxTouches: 1, pageScale: 1 };
  check("swipe: izquierda => siguiente", swipeDirection(base) === "next");
  check("swipe: derecha => anterior", swipeDirection({ ...base, dx: 120 }) === "prev");
  check("swipe: muy corto no cuenta", swipeDirection({ ...base, dx: -50 }) === null);
  check("swipe: scroll diagonal no cuenta", swipeDirection({ ...base, dx: -120, dy: 80 }) === null);
  check("swipe: casi vertical no cuenta", swipeDirection({ ...base, dx: -90, dy: 200 }) === null);
  check("swipe: gesto lento no cuenta", swipeDirection({ ...base, durationMs: 1500 }) === null);
  check("swipe: pellizco (2 dedos) no cuenta", swipeDirection({ ...base, maxTouches: 2 }) === null);
  check("swipe: con zoom no cuenta", swipeDirection({ ...base, pageScale: 1.6 }) === null);
  check("swipe: justo en el umbral cuenta", swipeDirection({ ...base, dx: -80, dy: 40 }) === "next");

  let pending = 0;
  let moved = 0;
  for (let i = 0; i < 60; i++) {
    const s = autoscrollStep(pending, 20, 1000 / 60);
    pending = s.pending;
    moved += s.move;
  }
  check("desfile: 20px/s durante ~1s avanza ~20px aunque sean fracciones", moved >= 19 && moved <= 20, String(moved));
  check("desfile: un tick atrasado se acota", autoscrollStep(0, 110, 5000).move <= 12);
  check("desfile: dt negativo no retrocede", autoscrollStep(0, 50, -20).move === 0);
}

// ---------- Recientes ----------
{
  check("recientes: null/vacío", parseRecentSongs(null).length === 0 && parseRecentSongs("").length === 0);
  {
    const kept = keepExistingRecents(
      [{ id: "a", title: "A", artist: "" }, { id: "b", title: "B", artist: "" }, { id: "c", title: "C", artist: "" }],
      new Set(["b"])
    );
    check("recientes: se descartan las que ya no existen", kept.length === 1 && kept[0].id === "b");
    check("recientes: sin ninguna existente queda vacío", keepExistingRecents([{ id: "a", title: "A", artist: "" }], new Set()).length === 0);
  }
  check("recientes: JSON roto", parseRecentSongs("{rota").length === 0);
  check("recientes: no es un array", parseRecentSongs('{"a":1}').length === 0);
  const raw = JSON.stringify([{ id: "a", title: "Uno", artist: "X" }, null, 5, { id: 3, title: "t" }, { id: "a", title: "Repetida", artist: "Y" }, { id: "b", title: "Dos" }]);
  const parsed = parseRecentSongs(raw);
  check("recientes: descarta lo roto y repetidos", parsed.length === 2 && parsed[0].id === "a" && parsed[1].id === "b" && parsed[1].artist === "", JSON.stringify(parsed));
}

// ---------- service worker: se carga de verdad con un entorno simulado ----------
type FakeCache = {
  store: Map<string, Response>;
  put(k: string | { url: string }, r: Response): Promise<void>;
  add(k: string): Promise<void>;
  match(k: string | { url: string }): Promise<Response | undefined>;
  keys(): Promise<{ url: string }[]>;
  delete(k: string | { url: string }): Promise<boolean>;
};

function makeSw(fetchImpl: (url: string) => Promise<Response>) {
  const named = new Map<string, FakeCache>();
  const keyOf = (k: string | { url: string }) => new URL(typeof k === "string" ? k : k.url, ORIGIN).toString();
  function makeCache(): FakeCache {
    const store = new Map<string, Response>();
    return {
      store,
      async put(k, r) {
        store.set(keyOf(k), r);
      },
      async add(k) {
        store.set(keyOf(k), await fetchImpl(keyOf(k)));
      },
      async match(k) {
        return store.get(keyOf(k));
      },
      async keys() {
        return [...store.keys()].map((url) => ({ url }));
      },
      async delete(k) {
        return store.delete(keyOf(k));
      },
    };
  }
  const caches = {
    async open(name: string) {
      if (!named.has(name)) named.set(name, makeCache());
      return named.get(name)!;
    },
    async keys() {
      return [...named.keys()];
    },
    async delete(name: string) {
      return named.delete(name);
    },
    async match(k: string | { url: string }) {
      for (const c of named.values()) {
        const hit = await c.match(k);
        if (hit) return hit;
      }
      return undefined;
    },
  };
  const handlers: Record<string, ((e: unknown) => void)[]> = {};
  const sandbox: Record<string, unknown> = {
    caches,
    fetch: (input: string | { url: string }) => fetchImpl(typeof input === "string" ? input : input.url),
    Response,
    URL,
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout,
    importScripts: (path: string) => {
      vm.runInContext(fs.readFileSync("public" + path, "utf8"), context);
    },
  };
  sandbox.self = sandbox;
  sandbox.location = { origin: ORIGIN };
  sandbox.clients = { claim: async () => {} };
  sandbox.addEventListener = (type: string, fn: (e: unknown) => void) => {
    (handlers[type] ||= []).push(fn);
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync("public/sw.js", "utf8"), context, { filename: "sw.js" });

  async function dispatch(type: string, extra: Record<string, unknown> = {}) {
    const waits: Promise<unknown>[] = [];
    const event = { ...extra, waitUntil: (p: Promise<unknown>) => waits.push(p) };
    for (const fn of handlers[type] ?? []) fn(event);
    await Promise.all(waits);
  }
  return { caches, named, dispatch, handlers };
}

function htmlResponse(body: string): Response {
  const res = new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  Object.defineProperty(res, "type", { value: "basic" });
  return res;
}

async function swTests() {
  // 1) activar: borra los cachés viejos y deja los vigentes.
  {
    const sw = makeSw(async () => htmlResponse(""));
    await sw.caches.open("cancionero-v1");
    await sw.caches.open("cancionero-v2");
    await sw.caches.open("cancionero-offline-v2");
    await sw.caches.open("otra-cosa");
    await sw.dispatch("activate");
    const names = (await sw.caches.keys()).sort().join();
    check("sw activate: borra versiones viejas y ajenas, conserva las vigentes", names === "cancionero-offline-v2,cancionero-v2", names);
  }

  // 2) clear-caches: borra TODO y avisa.
  {
    const sw = makeSw(async () => htmlResponse(""));
    for (const n of ["cancionero-v1", "cancionero-v2", "cancionero-offline-v2"]) await (await sw.caches.open(n)).put("/x", htmlResponse("x"));
    const sent: unknown[] = [];
    await sw.dispatch("message", { data: { type: "clear-caches" }, source: { postMessage: (m: unknown) => sent.push(m) } });
    check("sw clear-caches: no queda ningún caché", (await sw.caches.keys()).length === 0);
    check("sw clear-caches: avisa a la página", JSON.stringify(sent) === JSON.stringify([{ type: "caches-cleared" }]));
    await sw.dispatch("message", { data: "texto suelto" });
    await sw.dispatch("message", { data: null });
    await sw.dispatch("message", { data: { type: "otra" } });
    check("sw message: ignora mensajes que no entiende", true);
  }

  // 3) precache: solo URLs válidas, guarda las páginas y los archivos que nombran.
  {
    const fetched: string[] = [];
    const sw = makeSw(async (url) => {
      fetched.push(url);
      if (url.includes("/_next/static/")) return htmlResponse("// js");
      if (url.includes("/api/songs/")) return Object.assign(htmlResponse("{}"), {});
      if (url.includes(ID3)) return new Response("no", { status: 404 });
      return htmlResponse(`<html><script src="/_next/static/chunks/viewer-abc.js"></script></html>`);
    });
    const sent: { type: string; ok: number; failed: number; total: number; token: string }[] = [];
    const urls = [
      `/canciones/${ID1}?set=${ID1},${ID2}&i=0`,
      `/canciones/${ID2}?set=${ID1},${ID2}&i=1`,
      `/api/songs/${ID1}`,
      `/canciones/${ID3}`,
      "/admin",
      "https://evil.com/x",
      `/api/songs/${ID1}/versions`,
    ];
    await sw.dispatch("message", {
      data: { type: "precache", urls, token: "t1" },
      source: { postMessage: (m: never) => sent.push(m) },
    });
    const offline = sw.named.get("cancionero-offline-v2");
    check("sw precache: guarda las páginas válidas", !!offline && offline.store.size === 3, String(offline?.store.size));
    check("sw precache: nunca pide el admin ni otros orígenes", !fetched.some((u) => u.includes("/admin") || u.includes("evil.com") || u.includes("versions")), fetched.join(" | "));
    check("sw precache: guarda el script que nombra el HTML", !!sw.named.get("cancionero-v2")?.store.has(`${ORIGIN}/_next/static/chunks/viewer-abc.js`));
    const done = sent[0];
    check("sw precache: informa resultado con el token", !!done && done.type === "precache-done" && done.token === "t1" && done.ok === 3 && done.failed === 1 && done.total === 4, JSON.stringify(done));
    const stored = await sw.caches.match(`/canciones/${ID1}?set=${ID1}%2C${ID2}&i=0`);
    check("sw precache: la clave coincide aunque la coma venga escapada", !!stored);
  }
}

swTests()
  .catch((err) => {
    failures++;
    console.log("  FAIL: error en las pruebas del service worker —", err);
  })
  .finally(() => {
    // sw.js tiene que compilar como script clásico (importScripts, sin import/export).
    try {
      new vm.Script(fs.readFileSync("public/sw.js", "utf8"));
      passed++;
    } catch (err) {
      failures++;
      console.log("  FAIL: sw.js no compila —", err);
    }
    // offline.html y manifest
    const offline = fs.readFileSync("public/offline.html", "utf8");
    check("offline.html: en español y con botón de reintentar", /lang="es"/.test(offline) && /Reintentar/.test(offline) && /Sin conexión/.test(offline));
    const manifest = JSON.parse(fs.readFileSync("public/manifest.json", "utf8"));
    check("manifest: lang, id, scope", manifest.lang === "es" && manifest.id === "/" && manifest.scope === "/");
    check("manifest: shortcuts Buscar y Admin", Array.isArray(manifest.shortcuts) && manifest.shortcuts.map((s: { short_name: string }) => s.short_name).join() === "Buscar,Admin");
    check(
      "manifest: ningún ícono declarado maskable (no lo es)",
      !manifest.icons.some((i: { purpose?: string }) => (i.purpose ?? "").includes("maskable"))
    );
    const layout = fs.readFileSync("src/app/layout.tsx", "utf8");
    check("layout: no bloquea el zoom", !/maximumScale|user-scalable/.test(layout));

    console.log(`\nRESULTADO: ${passed} OK, ${failures} FAIL`);
    process.exit(failures > 0 ? 1 : 0);
  });
