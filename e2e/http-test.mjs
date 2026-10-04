const BASE = process.env.E2E_URL ?? "http://localhost:3100";
const USER = process.env.E2E_USER ?? "tester";
const PASS = process.env.E2E_PASS ?? "tmp-pass-123";
let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) pass++;
  else { fail++; console.log("  FAIL:", name, detail); }
};
let cookie = "";
const call = async (method, path, body, opts = {}) => {
  const res = await fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: { "Content-Type": "application/json", ...(cookie && !opts.anon ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
};
const json = async (res) => { try { return await res.json(); } catch { return null; } };

// 1) sin sesión
ok("GET /admin sin sesión redirige", (await call("GET", "/admin", null, { anon: true })).status === 307);
ok("POST /api/setlists sin sesión => 401", (await call("POST", "/api/setlists", { title: "x" }, { anon: true })).status === 401);
ok("POST /api/songs sin sesión => 401", (await call("POST", "/api/songs", { title: "x", body: "y" }, { anon: true })).status === 401);
ok("PATCH /api/songs/:id sin sesión => 401", (await call("PATCH", "/api/songs/00000000-0000-0000-0000-000000000000", {}, { anon: true })).status === 401);
ok("GET /api/setlists sin sesión => 401", (await call("GET", "/api/setlists", null, { anon: true })).status === 401);
ok("cookie falsa => redirige", (await fetch(BASE + "/admin", { redirect: "manual", headers: { cookie: "cancionero_session=abc.def" } })).status === 307);

// 2) login
let r = await call("POST", "/api/auth/login", { username: USER, password: "mal" }, { anon: true });
ok("login incorrecto => 401", r.status === 401);
r = await call("POST", "/api/auth/login", { username: USER, password: PASS }, { anon: true });
ok("login correcto => 200", r.status === 200);
cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
ok("devuelve cookie de sesión", cookie.startsWith("cancionero_session="));
ok("GET /admin con sesión => 200", (await call("GET", "/admin")).status === 200);
ok("GET /admin/powers/nuevo => 200", (await call("GET", "/admin/powers/nuevo")).status === 200);

// 3) búsqueda
const all = await json(await call("GET", "/api/songs?limit=500", null, { anon: true }));
ok("lista completa (sin tope de 100)", all.songs.length > 100, `got ${all.songs.length}`);
const pct = await json(await call("GET", "/api/songs?q=%25&limit=500", null, { anon: true }));
ok("q='%' no devuelve todo (comodín escapado)", pct.songs.length < all.songs.length, `got ${pct.songs.length}`);
const acc = await json(await call("GET", "/api/songs?q=cancion&limit=5", null, { anon: true }));
ok("búsqueda sin tilde anda", Array.isArray(acc.songs));
const badLimit = await call("GET", "/api/songs?limit=abc&offset=-4", null, { anon: true });
ok("limit/offset basura no rompe", badLimit.status === 200);
ok("GET /api/songs/no-uuid => 404", (await call("GET", "/api/songs/hola", null, { anon: true })).status === 404);

// 4) canción en texto plano
const plain = "La        Mi\nEres Tú la única razón\nDo#m7      Re\nadoración";
r = await call("POST", "/api/songs", { title: "ZZ TEST plano", artist: "t", originalKey: "La", tags: ["Alabanza", "Inventado"], body: plain });
const created = await json(r);
ok("crear canción => 200", r.status === 200, JSON.stringify(created));
const songId = created?.song?.id;
ok("se guardó con corchetes", created?.song?.body.startsWith("[La]Eres"), created?.song?.body);
ok("tag inválido descartado", JSON.stringify(created?.song?.tags) === '["Alabanza"]');
r = await call("POST", "/api/songs", { title: "  ", body: "x" });
ok("título vacío => 400", r.status === 400);
r = await call("POST", "/api/songs", { title: "x", body: "   " });
ok("letra vacía => 400", r.status === 400);
r = await fetch(BASE + `/canciones/${songId}`);
const html = await r.text();
ok("página de la canción => 200", r.status === 200);
ok("la página trae el título", html.includes("ZZ TEST plano"));
r = await call("PATCH", `/api/songs/${songId}`, { body: "Sol    Re\nOtra letra" });
const patched = await json(r);
ok("editar canción => 200", r.status === 200);
ok("editar también convierte el texto plano", patched?.song?.body.includes("[Sol]"), patched?.song?.body);

// 5) importador: hostname estricto
for (const url of ["https://lacuerda.net.evil.com/x", "https://evil.com/lacuerda.net", "http://127.0.0.1/cifraclub", "no-es-url"]) {
  r = await call("POST", "/api/songs/import", { url });
  ok(`import rechaza ${url}`, r.status === 400, `status ${r.status}`);
}

// 6) powers
const [a, b] = all.songs;
r = await call("POST", "/api/setlists", {
  title: "ZZ TEST power",
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
r = await call("GET", `/api/setlists/${slId}`, null, { anon: true });
let got = (await json(r))?.setlist;
ok("power público se puede leer", r.status === 200);
ok("ids inválidos y duplicados descartados", got.songs.length === 3, `songs=${got.songs.length}`);
ok("divisores saneados", JSON.stringify(got.dividers.map((d) => d.name)) === '["ALABANZA","OFRENDA","FINAL"]', JSON.stringify(got.dividers));
ok("FINAL quedó al final (pos 3)", got.dividers[2].position === 3);
ok("semitonos guardados", got.songs[0].semitones === 2);

r = await fetch(BASE + `/powers/${slId}`);
const phtml = await r.text();
ok("página del power => 200", r.status === 200);
ok("la página muestra los divisores", ["ALABANZA", "OFRENDA", "FINAL"].every((n) => phtml.includes(n)));
ok("orden: ALABANZA antes que OFRENDA antes que FINAL", phtml.indexOf("ALABANZA") < phtml.indexOf("OFRENDA") && phtml.indexOf("OFRENDA") < phtml.indexOf("FINAL"));

r = await fetch(BASE + `/api/setlists/${slId}/export-pptx`);
ok("export pptx => 200", r.status === 200);
ok("export pptx content-type", (r.headers.get("content-type") ?? "").includes("presentationml"));
const buf = Buffer.from(await r.arrayBuffer());
ok("pptx es un zip", buf.slice(0, 2).toString() === "PK");
(await import("node:fs")).writeFileSync("e2e/out/http-power.pptx", buf);

// quitar divisores y mover canciones (PATCH)
r = await call("PATCH", `/api/setlists/${slId}`, { songIds: [b.id, a.id], dividers: [{ name: "MINISTRACIÓN", position: 1 }] });
ok("PATCH power => 200", r.status === 200);
got = (await json(await call("GET", `/api/setlists/${slId}`, null, { anon: true })))?.setlist;
ok("PATCH: canciones reordenadas", got.songs[0].id === b.id && got.songs.length === 2);
ok("PATCH: divisor nuevo", got.dividers.length === 1 && got.dividers[0].name === "MINISTRACIÓN" && got.dividers[0].position === 1);
r = await call("PATCH", `/api/setlists/${slId}`, { title: "ZZ TEST renombrado" });
got = (await json(await call("GET", `/api/setlists/${slId}`, null, { anon: true })))?.setlist;
ok("PATCH solo título no pierde divisores", got.title === "ZZ TEST renombrado" && got.dividers.length === 1);
r = await call("PATCH", `/api/setlists/no-uuid`, {});
ok("PATCH id inválido => 404", r.status === 404);
r = await call("POST", "/api/setlists", { songIds: [a.id] });
ok("power sin título => 400", r.status === 400);

// power vacío con solo divisor
r = await call("POST", "/api/setlists", { title: "ZZ TEST vacío", songIds: [], dividers: [{ name: "FINAL", position: 0 }] });
const emptyId = (await json(r))?.setlist?.id;
r = await fetch(BASE + `/api/setlists/${emptyId}/export-pptx`);
ok("export de power sin canciones => 400", r.status === 400);
r = await fetch(BASE + `/powers/${emptyId}`);
ok("página de power sin canciones => 200", r.status === 200);

// 7) limpieza
ok("borrar power", (await call("DELETE", `/api/setlists/${slId}`)).status === 200);
ok("borrar power vacío", (await call("DELETE", `/api/setlists/${emptyId}`)).status === 200);
ok("power borrado => 404", (await call("GET", `/api/setlists/${slId}`, null, { anon: true })).status === 404);
ok("borrar canción de prueba", (await call("DELETE", `/api/songs/${songId}`)).status === 200);
ok("canción borrada => 404", (await call("GET", `/api/songs/${songId}`, null, { anon: true })).status === 404);
ok("logout", (await call("POST", "/api/auth/logout")).status < 400);

console.log(`\nHTTP: ${pass} OK, ${fail} FAIL`);
