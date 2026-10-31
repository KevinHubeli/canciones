// HTTP: cambio de contraseña y respaldo (solo dueño).
//
// Contratos que asume (ver e2e/README.md):
//   POST /api/auth/password { current, next }  -> 200 si "current" es la clave vigente y "next" es válida (>= 8 caracteres)
//                                                 4xx si "current" no coincide o "next" es inválida; 401 sin sesión
//   GET  /api/admin/backup                     -> 200 con un JSON descargable, solo para el dueño (usuarios comunes y anónimos: 401/403)
import { PASS, client, json, loginOwner, main, makeSong, makeUser, ok, section, title } from "./lib.mjs";

await main("HTTP5", async () => {
  const owner = await loginOwner();
  const anon = client();

  // ---------- cambio de contraseña ----------
  section("cambio de contraseña");
  const u = await makeUser(owner, "clave", "clave-vieja-123");
  ok("sin sesión => 401", (await anon.post("/api/auth/password", { current: "a", next: "clave-nueva-456" })).status === 401);
  ok("cuerpo vacío => 400", (await u.client.call("POST", "/api/auth/password", undefined)).status === 400);
  ok("faltan campos => 400", (await u.client.post("/api/auth/password", { current: "clave-vieja-123" })).status === 400);
  ok("campos que no son texto => 400", (await u.client.post("/api/auth/password", { current: 1, next: { a: 1 } })).status === 400);

  let r = await u.client.post("/api/auth/password", { current: "no-es-la-clave", next: "clave-nueva-456" });
  ok("clave actual incorrecta => rechaza (4xx)", r.status >= 400 && r.status < 500, `status ${r.status}`);
  ok("…y la clave no cambió (la vieja sigue entrando)", (await client().login(u.username, "clave-vieja-123")) === 200);

  r = await u.client.post("/api/auth/password", { current: "clave-vieja-123", next: "corta" });
  ok("clave nueva muy corta => 400", r.status === 400, `status ${r.status}`);

  const oldCookie = u.client.cookie;
  r = await u.client.post("/api/auth/password", { current: "clave-vieja-123", next: "clave-nueva-456" });
  const changed = await json(r);
  ok("cambio correcto => 200", r.status === 200, `status ${r.status} ${JSON.stringify(changed)}`);
  ok("la respuesta no devuelve claves", !/clave-(vieja|nueva)/.test(JSON.stringify(changed ?? {})));
  const newCookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  ok("el cambio renueva la cookie de quien lo hizo", newCookie.startsWith("cancionero_session=") && newCookie !== oldCookie);
  const stale = client();
  stale.setCookie(oldCookie);
  ok("la sesión vieja deja de servir (el cambio cierra las demás sesiones)", (await stale.get("/api/setlists")).status === 401);
  const fresh = client();
  fresh.setCookie(newCookie);
  ok("la cookie nueva sí sirve", (await fresh.get("/api/setlists")).status === 200);
  ok("la clave vieja ya no entra", (await client().login(u.username, "clave-vieja-123")) === 401);
  ok("la clave nueva entra", (await client().login(u.username, "clave-nueva-456")) === 200);

  r = await u.client.post("/api/auth/password", { current: "clave-nueva-456", next: "clave-nueva-456" });
  ok("clave nueva igual a la actual => 400", r.status === 400, `status ${r.status}`);
  // El dueño usa las variables de entorno: desde la app no se le cambia la clave (no toca nada).
  r = await owner.post("/api/auth/password", { current: PASS, next: "otra-clave-larga-99" });
  ok("el dueño no cambia su clave desde la app (400)", r.status === 400, `status ${r.status}`);
  ok("…y su clave sigue siendo la de las variables de entorno", (await client().login(USER, PASS)) === 200);

  // ---------- respaldo ----------
  section("respaldo");
  const song = await makeSong(owner, "respaldo");
  ok("sin sesión => 401/403", [401, 403].includes((await anon.get("/api/admin/backup")).status));
  ok("un usuario común => 403", (await fresh.get("/api/admin/backup")).status === 403);
  r = await owner.get("/api/admin/backup");
  ok("el dueño descarga el respaldo => 200", r.status === 200, `status ${r.status}`);
  const raw = await r.text();
  ok("el respaldo es JSON válido", (() => { try { JSON.parse(raw); return true; } catch { return false; } })());
  ok("incluye la canción de prueba", raw.includes(title("respaldo")) && raw.includes(song.id));
  ok("NO incluye hashes de contraseñas", !raw.includes("scrypt:"));
  ok("NO incluye la clave del dueño", !raw.includes(PASS));
  ok("se descarga como archivo (Content-Disposition o JSON)", /attachment/i.test(r.headers.get("content-disposition") ?? "") || /json/i.test(r.headers.get("content-type") ?? ""));
  ok("pantalla /admin/respaldo del dueño => 200", (await owner.get("/admin/respaldo")).status === 200);
  ok("pantalla /admin/respaldo sin sesión redirige", (await anon.get("/admin/respaldo")).status === 307);
});
