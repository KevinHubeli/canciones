// HTTP: permisos sin sesión, login, búsqueda, canciones, importador y powers.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BASE, NIL_UUID, OUT_DIR, USER, PASS, client, json, main, makePower, makeSong, ok, onCleanup, purgeTestTrash,
  section, songsOf, title,
} from "./lib.mjs";

await main("HTTP", async () => {
  const anon = client();

  // 1) sin sesión
  section("sin sesión");
  ok("GET /admin sin sesión redirige", (await anon.get("/admin")).status === 307);
  ok("POST /api/setlists sin sesión => 401", (await anon.post("/api/setlists", { title: "x" })).status === 401);
  ok("POST /api/songs sin sesión => 401", (await anon.post("/api/songs", { title: "x", body: "y" })).status === 401);
  ok("PATCH /api/songs/:id sin sesión => 401", (await anon.patch(`/api/songs/${NIL_UUID}`, {})).status === 401);
  ok("DELETE /api/songs/:id sin sesión => 401", (await anon.del(`/api/songs/${NIL_UUID}`)).status === 401);
  ok("GET /api/setlists sin sesión => 401", (await anon.get("/api/setlists")).status === 401);
  ok(
    "cookie falsa => redirige",
    (await fetch(BASE + "/admin", { redirect: "manual", headers: { cookie: "cancionero_session=abc.def" } })).status === 307
  );

  // 2) login
  section("login");
  const bad = client();
  ok("login incorrecto => 401", (await bad.login(USER, "mal-" + Date.now())) === 401);
  const c = client();
  const loginRes = await c.call("POST", "/api/auth/login", { username: USER, password: PASS });
  ok("login correcto => 200", loginRes.status === 200);
  c.setCookie((loginRes.headers.get("set-cookie") ?? "").split(";")[0]);
  onCleanup("papelera de prueba", () => purgeTestTrash(c));
  ok("devuelve cookie de sesión", c.cookie.startsWith("cancionero_session="));
  ok("la cookie es httpOnly", /httponly/i.test(loginRes.headers.get("set-cookie") ?? ""));
  ok("GET /admin con sesión => 200", (await c.get("/admin")).status === 200);
  ok("GET /admin/powers/nuevo => 200", (await c.get("/admin/powers/nuevo")).status === 200);
  const body400 = await anon.call("POST", "/api/auth/login", undefined);
  ok("login sin cuerpo => 400 (no 500)", body400.status === 400, `status ${body400.status}`);

  // 3) búsqueda (con datos propios; la base puede estar vacía)
  section("búsqueda");
  const pctSong = await makeSong(c, "100% Alabanza", { tags: ["Alabanza"] });
  const plainSong = await makeSong(c, "Zarzamora única", { artist: "e2e-artista-raro" });
  const empty = await json(await anon.get("/api/songs?limit=500"));
  ok("lista pública => 200 con la forma esperada", Array.isArray(empty?.songs));
  const all = songsOf(empty);
  ok("las canciones recién creadas se leen por id", (await anon.get(`/api/songs/${pctSong.id}`)).status === 200 && (await anon.get(`/api/songs/${plainSong.id}`)).status === 200);
  const pct = songsOf(await json(await anon.get("/api/songs?q=%25&limit=500")));
  ok("q='%' no devuelve todo (comodín escapado)", pct.length < all.length, `got ${pct.length}/${all.length}`);
  ok("q='%' encuentra la que tiene % literal", pct.some((s) => s.id === pctSong.id));
  const byTitle = songsOf(await json(await anon.get(`/api/songs?q=${encodeURIComponent("Zarzamora")}&limit=5`)));
  ok("búsqueda por título encuentra la canción", byTitle.some((s) => s.id === plainSong.id));
  const noAccent = songsOf(await json(await anon.get(`/api/songs?q=${encodeURIComponent("zarzamóra")}&limit=5`)));
  ok("búsqueda con tilde distinta anda", noAccent.some((s) => s.id === plainSong.id));
  const byArtist = songsOf(await json(await anon.get(`/api/songs?q=${encodeURIComponent("e2e-artista-raro")}&limit=5`)));
  ok("búsqueda por artista anda", byArtist.some((s) => s.id === plainSong.id));
  const byTag = songsOf(await json(await anon.get("/api/songs?tag=Alabanza&limit=500")));
  ok("filtro por tag trae la que lo tiene", byTag.some((s) => s.id === pctSong.id) && !byTag.some((s) => s.id === plainSong.id));
  ok("limit=abc&offset=-4 no rompe", (await anon.get("/api/songs?limit=abc&offset=-4")).status === 200);
  ok("limit enorme se topa en vez de romper", (await anon.get("/api/songs?limit=99999999")).status === 200);
  ok("q con comillas y barras no rompe", (await anon.get(`/api/songs?q=${encodeURIComponent(`'"\\;--`)}`)).status === 200);
  ok("GET /api/songs/no-uuid => 404", (await anon.get("/api/songs/hola")).status === 404);
  ok("GET /api/songs/uuid-inexistente => 404", (await anon.get(`/api/songs/${NIL_UUID}`)).status === 404);

  // 4) canción en texto plano
  section("canciones");
  const plain = "La        Mi\nEres Tú la única razón\nDo#m7      Re\nadoración";
  let r = await c.post("/api/songs", {
    title: title("plano"), artist: "t", originalKey: "La", tags: ["Alabanza", "Inventado"], body: plain,
  });
  const created = await json(r);
  ok("crear canción => 200", r.status === 200, JSON.stringify(created));
  const songId = created?.song?.id;
  if (songId) onCleanup("canción plana", () => c.del(`/api/songs/${songId}`));
  ok("se guardó con corchetes", created?.song?.body.startsWith("[La]Eres"), created?.song?.body);
  ok("tag inválido descartado", JSON.stringify(created?.song?.tags) === '["Alabanza"]');
  ok("título vacío => 400", (await c.post("/api/songs", { title: "  ", body: "x" })).status === 400);
  ok("letra vacía => 400", (await c.post("/api/songs", { title: "x", body: "   " })).status === 400);
  ok("cuerpo no JSON => 400", (await c.call("POST", "/api/songs", undefined)).status === 400);
  r = await fetch(`${BASE}/canciones/${songId}`);
  const html = await r.text();
  ok("página de la canción => 200", r.status === 200);
  ok("la página trae el título", html.includes(title("plano")));
  r = await c.patch(`/api/songs/${songId}`, { body: "Sol    Re\nOtra letra" });
  const patched = await json(r);
  ok("editar canción => 200", r.status === 200);
  ok("editar también convierte el texto plano", patched?.song?.body.includes("[Sol]"), patched?.song?.body);
  ok("PATCH con id inválido => 404", (await c.patch("/api/songs/xx", { title: "a" })).status === 404);
  ok("PATCH de canción inexistente => 404", (await c.patch(`/api/songs/${NIL_UUID}`, { title: "a" })).status === 404);

  // 5) importador: hostname estricto
  section("importador");
  for (const url of ["https://lacuerda.net.evil.com/x", "https://evil.com/lacuerda.net", "http://127.0.0.1/cifraclub", "no-es-url"]) {
    r = await c.post("/api/songs/import", { url });
    ok(`import rechaza ${url}`, r.status === 400, `status ${r.status}`);
  }
  ok("import sin sesión => 401", (await anon.post("/api/songs/import", { url: "https://www.lacuerda.net/x" })).status === 401);

  // 6) powers
  section("powers");
  const a = await makeSong(c, "power A");
  const b = await makeSong(c, "power B");
  r = await c.post("/api/setlists", {
    title: title("power"),
    songIds: [a.id, "no-uuid", songId, a.id, 123, b.id],
    transpose: { [a.id]: 2 },
    dividers: [
      { name: "ALABANZA", position: 0 },
      { name: "XX", position: 1 },
      { name: "OFRENDA", position: 2 },
      { name: "FINAL", position: 99 },
    ],
  });
  const sl = await json(r);
  ok("crear power => 200", r.status === 200, JSON.stringify(sl));
  const slId = sl?.setlist?.id;
  onCleanup("power http-test", () => c.del(`/api/setlists/${slId}`));
  r = await anon.get(`/api/setlists/${slId}`);
  let got = (await json(r))?.setlist;
  ok("power público se puede leer", r.status === 200);
  ok("ids inválidos y duplicados descartados", got.songs.length === 3, `songs=${got.songs.length}`);
  ok(
    "divisores saneados",
    JSON.stringify(got.dividers.map((d) => d.name)) === '["ALABANZA","OFRENDA","FINAL"]',
    JSON.stringify(got.dividers)
  );
  ok("FINAL quedó al final (pos 3)", got.dividers[2].position === 3);
  ok("semitonos guardados", got.songs[0].semitones === 2);

  r = await fetch(`${BASE}/powers/${slId}`);
  const phtml = await r.text();
  ok("página del power => 200", r.status === 200);
  ok("la página muestra los divisores", ["ALABANZA", "OFRENDA", "FINAL"].every((n) => phtml.includes(n)));
  ok(
    "orden: ALABANZA antes que OFRENDA antes que FINAL",
    phtml.indexOf("ALABANZA") < phtml.indexOf("OFRENDA") && phtml.indexOf("OFRENDA") < phtml.indexOf("FINAL")
  );

  r = await fetch(`${BASE}/api/setlists/${slId}/export-pptx`);
  ok("export pptx => 200", r.status === 200);
  ok("export pptx content-type", (r.headers.get("content-type") ?? "").includes("presentationml"));
  const buf = Buffer.from(await r.arrayBuffer());
  ok("pptx es un zip", buf.slice(0, 2).toString() === "PK");
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "http-power.pptx"), buf);

  // quitar divisores y mover canciones (PATCH)
  r = await c.patch(`/api/setlists/${slId}`, { songIds: [b.id, a.id], dividers: [{ name: "MINISTRACIÓN", position: 1 }] });
  ok("PATCH power => 200", r.status === 200);
  got = (await json(await anon.get(`/api/setlists/${slId}`)))?.setlist;
  ok("PATCH: canciones reordenadas", got.songs[0].id === b.id && got.songs.length === 2);
  ok("PATCH: divisor nuevo", got.dividers.length === 1 && got.dividers[0].name === "MINISTRACIÓN" && got.dividers[0].position === 1);
  await c.patch(`/api/setlists/${slId}`, { title: title("renombrado") });
  got = (await json(await anon.get(`/api/setlists/${slId}`)))?.setlist;
  ok("PATCH solo título no pierde divisores", got.title === title("renombrado") && got.dividers.length === 1);
  ok("PATCH id inválido => 404", (await c.patch("/api/setlists/no-uuid", {})).status === 404);
  ok("power sin título => 400", (await c.post("/api/setlists", { songIds: [a.id] })).status === 400);

  // power vacío con solo divisor
  const emptyPower = await makePower(c, "vacío", [], { dividers: [{ name: "FINAL", position: 0 }] });
  r = await fetch(`${BASE}/api/setlists/${emptyPower.id}/export-pptx`);
  ok("export de power sin canciones => 400", r.status === 400);
  r = await fetch(`${BASE}/powers/${emptyPower.id}`);
  ok("página de power sin canciones => 200", r.status === 200);

  // 7) borrado
  section("borrado");
  ok("borrar power", (await c.del(`/api/setlists/${slId}`)).status === 200);
  ok("power borrado => 404", (await anon.get(`/api/setlists/${slId}`)).status === 404);
  ok("borrar canción de prueba", (await c.del(`/api/songs/${songId}`)).status === 200);
  ok("canción borrada => 404", (await anon.get(`/api/songs/${songId}`)).status === 404);
  ok("borrar de nuevo => 404", (await c.del(`/api/songs/${songId}`)).status === 404);
  ok("logout", (await c.post("/api/auth/logout")).status < 400);
});
