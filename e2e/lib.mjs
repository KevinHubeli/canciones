// Utilidades compartidas por todos los tests e2e.
//
// Reglas de estos tests:
//  - Son autosuficientes: cada uno crea lo que necesita (canciones, powers,
//    usuarios) con el prefijo ZZ_e2e_ y lo borra al final, aunque falle.
//  - Toleran una base vacía: no dependen de ningún dato real.
//  - Escriben en la base a la que apunta el servidor. Por eso se niegan a correr
//    sin E2E_ALLOW_WRITES=1 y, salvo E2E_ALLOW_REMOTE=1, solo contra localhost.
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const BASE = (process.env.E2E_URL ?? "http://localhost:3100").replace(/\/+$/, "");
export const USER = process.env.E2E_USER ?? "tester";
export const PASS = process.env.E2E_PASS ?? "tmp-pass-123";

/** Todo lo que crean los tests lleva este prefijo (usuarios en minúsculas: zz_e2e_). */
export const PREFIX = "ZZ_e2e_";
/** Identificador de esta corrida: evita choques de títulos entre corridas o tests en paralelo. */
export const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 4);

export const title = (s) => `${PREFIX}${RUN}_${s}`;
export const username = (s) => `zz_e2e_${RUN}_${s}`.toLowerCase().slice(0, 30);
export const NIL_UUID = "00000000-0000-4000-8000-000000000000";

export const OUT_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "out");

// ---------------------------------------------------------------------------
// Guardas de seguridad
// ---------------------------------------------------------------------------

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Devuelve un texto con el problema, o null si es seguro correr. */
export function safetyProblem(env = process.env) {
  if (env.E2E_ALLOW_WRITES !== "1") {
    return [
      "Estos tests ESCRIBEN y BORRAN datos en la base a la que apunta el servidor.",
      "No los corras contra producción: apuntalos a una rama de Neon o a una base de prueba",
      "(DATABASE_URL de la rama en .env.local, o en las variables del servidor que levantes).",
      "",
      "Cuando estés seguro, repetí con:  E2E_ALLOW_WRITES=1",
    ].join("\n");
  }
  const url = (env.E2E_URL ?? "http://localhost:3100").trim();
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return `E2E_URL no es una URL válida: ${url}`;
  }
  if (!LOCAL_HOSTS.has(host) && env.E2E_ALLOW_REMOTE !== "1") {
    return [
      `E2E_URL apunta a "${host}", que no es localhost.`,
      "Los tests no corren contra servidores remotos salvo que lo pidas a propósito",
      "(y solo si ese servidor usa una base de prueba):  E2E_ALLOW_REMOTE=1",
    ].join("\n");
  }
  return null;
}

export function assertSafeEnv() {
  const problem = safetyProblem();
  if (problem) {
    console.error("\n[e2e] No se corre.\n" + problem + "\n");
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
let skipped = 0;

export function ok(name, cond, detail = "") {
  if (cond) passed++;
  else {
    failed++;
    console.log("  FAIL:", name, detail === "" ? "" : `\n        ${detail}`);
  }
  return !!cond;
}

export function skip(name, why = "") {
  skipped++;
  console.log("  SKIP:", name, why ? `(${why})` : "");
}

export function section(name) {
  console.log(`\n- ${name}`);
}

// ---------------------------------------------------------------------------
// Limpieza: se ejecuta siempre, en orden inverso al de creación
// ---------------------------------------------------------------------------

const cleanups = [];
export function onCleanup(label, fn) {
  cleanups.push({ label, fn });
}

async function runCleanups() {
  while (cleanups.length) {
    const { label, fn } = cleanups.pop();
    try {
      await fn();
    } catch (err) {
      console.log(`  (limpieza "${label}" falló: ${err?.message ?? err})`);
    }
  }
}

/**
 * Envuelve un test: verifica las guardas, comprueba que el servidor responda,
 * corre el test y SIEMPRE ejecuta la limpieza. Deja el código de salida en 1 si algo falló.
 */
export async function main(label, fn) {
  assertSafeEnv();
  const started = Date.now();
  try {
    await preflight();
    await fn();
  } catch (err) {
    failed++;
    console.log(`  ERROR inesperado: ${err?.stack ?? err}`);
  } finally {
    await runCleanups();
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `\n${label}: ${passed} OK, ${failed} FAIL${skipped ? `, ${skipped} salteados` : ""} (${secs}s)`
    );
    process.exitCode = failed ? 1 : 0;
  }
}

async function preflight() {
  try {
    const r = await fetch(`${BASE}/api/songs?limit=1`);
    if (r.status >= 500) throw new Error(`el servidor respondió ${r.status} (¿base de datos sin migrar o sin conexión?)`);
  } catch (err) {
    throw new Error(`No se pudo hablar con ${BASE}. ¿Está levantado el servidor? (${err?.message ?? err})`);
  }
}

// ---------------------------------------------------------------------------
// Cliente HTTP con cookie propia
// ---------------------------------------------------------------------------

let ipCounter = Math.floor(Math.random() * 200) + 20;

/**
 * Cada cliente manda un X-Forwarded-For propio: el límite de intentos de login
 * es por IP, y así los fallos de un test no bloquean a los demás.
 */
export function client() {
  let cookie = "";
  const ip = `10.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}.${Math.floor(Math.random() * 250) + 1}`;
  const self = {
    ip,
    get cookie() {
      return cookie;
    },
    setCookie(c) {
      cookie = c;
    },
    call(method, path, body, extraHeaders = {}) {
      return fetch(BASE + path, {
        method,
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": ip,
          ...(cookie ? { cookie } : {}),
          ...extraHeaders,
        },
        body: body === undefined || body === null ? undefined : JSON.stringify(body),
      });
    },
    get: (path) => self.call("GET", path),
    post: (path, body) => self.call("POST", path, body ?? {}),
    patch: (path, body) => self.call("PATCH", path, body ?? {}),
    del: (path) => self.call("DELETE", path),
    async login(user, pass) {
      const r = await self.call("POST", "/api/auth/login", { username: user, password: pass });
      if (r.status === 200) cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
      return r.status;
    },
  };
  return self;
}

export const json = async (r) => {
  try {
    return await r.json();
  } catch {
    return null;
  }
};
export const text = async (r) => (await r.text()).replace(/<!-- -->/g, "");
/** Texto visible de un HTML (sin etiquetas ni entidades comunes), con espacios colapsados. */
export const visible = (html) =>
  html
    .replace(/<!-- -->/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ");

/**
 * Las canciones que se borran van a la papelera. Al final de cada test se vacía la papelera,
 * pero SOLO si todo lo que hay adentro es de prueba (nunca se tocan canciones reales).
 * Devuelve cuántas canciones que no son de prueba quedaron.
 */
export async function purgeTestTrash(c) {
  const r = await c.get("/api/songs/trash");
  if (r.status !== 200) return 0; // todavía no existe la papelera
  const data = await json(r);
  const list = Array.isArray(data) ? data : (data?.songs ?? data?.trash ?? data?.items ?? []);
  const foreign = list.filter((s) => !String(s.title ?? "").startsWith(PREFIX));
  if (list.length && !foreign.length) await c.del("/api/songs/trash");
  return foreign.length;
}

/** Cliente del dueño ya logueado. */
export async function loginOwner() {
  const c = client();
  const status = await c.login(USER, PASS);
  if (status !== 200) {
    throw new Error(
      `No se pudo entrar como dueño (${status}). Revisá que E2E_USER/E2E_PASS coincidan con ADMIN_USER/ADMIN_PASSWORD del servidor` +
        (status === 429 ? " (o esperá unos minutos: hay demasiados intentos fallidos)." : ".")
    );
  }
  // Se registra primero => corre al final, cuando ya se borraron las canciones de prueba.
  onCleanup("papelera de prueba", () => purgeTestTrash(c));
  return c;
}

// ---------------------------------------------------------------------------
// Datos de prueba (cada uno registra su propio borrado)
// ---------------------------------------------------------------------------

export const DEFAULT_BODY = "[C]Primera línea de prueba\n[G]Segunda línea de prueba\n[Am]Tercera línea\n[F]Cuarta línea";

/** Crea una canción de prueba. Devuelve la canción. */
export async function makeSong(c, suffix, extra = {}) {
  const r = await c.post("/api/songs", {
    title: title(suffix),
    artist: "e2e",
    originalKey: "C",
    body: DEFAULT_BODY,
    force: true,
    ...extra,
  });
  const data = await json(r);
  if (r.status !== 200 || !data?.song?.id) {
    throw new Error(`No se pudo crear la canción de prueba "${suffix}" (${r.status}): ${JSON.stringify(data)}`);
  }
  const song = data.song;
  onCleanup(`canción ${suffix}`, () => c.del(`/api/songs/${song.id}`));
  return song;
}

/** Crea un power de prueba. Devuelve el power. */
export async function makePower(c, suffix, songIds = [], extra = {}) {
  const r = await c.post("/api/setlists", { title: title(suffix), songIds, ...extra });
  const data = await json(r);
  if (r.status !== 200 || !data?.setlist?.id) {
    throw new Error(`No se pudo crear el power de prueba "${suffix}" (${r.status}): ${JSON.stringify(data)}`);
  }
  const power = data.setlist;
  onCleanup(`power ${suffix}`, () => c.del(`/api/setlists/${power.id}`));
  return power;
}

/** Crea un usuario de prueba (lo hace el dueño). Devuelve { id, username, password, client } con la sesión abierta. */
export async function makeUser(owner, suffix, password = "clave-segura-1", { login = true } = {}) {
  const name = username(suffix);
  const r = await owner.post("/api/admin/users", { username: name, password });
  const data = await json(r);
  if (r.status !== 200 || !data?.user?.id) {
    throw new Error(`No se pudo crear el usuario de prueba "${name}" (${r.status}): ${JSON.stringify(data)}`);
  }
  const id = data.user.id;
  onCleanup(`usuario ${name}`, () => owner.del(`/api/admin/users/${id}`));
  const c = client();
  if (login) {
    const status = await c.login(name, password);
    if (status !== 200) throw new Error(`El usuario de prueba ${name} no pudo entrar (${status}).`);
  }
  return { id, username: name, password, client: c };
}

/** Lista de canciones de un GET /api/songs. */
export const songsOf = (data) => data?.songs ?? [];

// ---------------------------------------------------------------------------
// Navegador (solo los tests de UI)
// ---------------------------------------------------------------------------

/** Abre Chromium con una página móvil. Se cierra solo en la limpieza. */
export async function launchPage({ width = 390, height = 844, collectWarnings = false } = {}) {
  mkdirSync(OUT_DIR, { recursive: true });
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error("Falta playwright. Corré `npm ci` y `npx playwright install chromium`.");
  }
  const browser = await chromium.launch();
  onCleanup("navegador", () => browser.close());
  const page = await browser.newPage({ viewport: { width, height } });
  // El navegador también va con su propia IP de mentira (ver client()).
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": `10.99.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" || (collectWarnings && m.type() === "warning")) errors.push(m.text());
  });
  return { page, errors };
}

/** Errores de consola que no nos importan (favicon, manifest, service worker, DevTools, 409 esperados). */
export function relevantErrors(errors, extraIgnore = null) {
  return errors.filter(
    (e) => !/favicon|manifest|sw\.js|Download the React DevTools|status of 409/i.test(e) && !(extraIgnore && extraIgnore.test(e))
  );
}

export async function loginInPage(page, user = USER, pass = PASS) {
  await page.goto(BASE + "/admin/login");
  await page.fill('input[placeholder="Usuario"]', user);
  await page.fill('input[placeholder="Contraseña"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/admin", { timeout: 15000 });
}

/** Hace un fetch desde el navegador (con su cookie). */
export function pageApi(page, method, path, body) {
  return page.evaluate(
    async ([m, p, b]) => {
      const r = await fetch(p, {
        method: m,
        headers: { "Content-Type": "application/json" },
        body: b ? JSON.stringify(b) : undefined,
      });
      return { status: r.status, data: await r.json().catch(() => null) };
    },
    [method, path, body]
  );
}

export const shot = (page, name, opts = {}) => page.screenshot({ path: join(OUT_DIR, `${name}.png`), ...opts });
