const BASE = process.env.E2E_URL ?? "http://localhost:3100";
const USER = process.env.E2E_USER ?? "tester";
const PASS = process.env.E2E_PASS ?? "tmp-pass-123";
let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) pass++;
  else { fail++; console.log("  FAIL:", name, detail); }
};
const mk = () => {
  let cookie = "";
  return {
    setCookie: (c) => (cookie = c),
    call: (method, path, body) =>
      fetch(BASE + path, {
        method,
        redirect: "manual",
        headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      }),
  };
};
const json = async (r) => { try { return await r.json(); } catch { return null; } };
const login = async (c, username, password) => {
  const r = await c.call("POST", "/api/auth/login", { username, password });
  if (r.status === 200) c.setCookie(r.headers.get("set-cookie").split(";")[0]);
  return r.status;
};

const owner = mk();
ok("login dueño", (await login(owner, USER, PASS)) === 200);

// ---------- #8 usuarios ----------
let r = await owner.call("GET", "/api/admin/users");
ok("dueño lista usuarios", r.status === 200);
for (const [u, p, why] of [["ab", "password123", "usuario corto"], ["Maria Perez", "password123", "usuario con espacio"], ["maria", "corta", "clave corta"]]) {
  r = await owner.call("POST", "/api/admin/users", { username: u, password: p });
  ok(`rechaza ${why}`, r.status === 400, `status ${r.status}`);
}
r = await owner.call("POST", "/api/admin/users", { username: USER, password: "password123" });
ok("rechaza el nombre del dueño", r.status === 409);
r = await owner.call("POST", "/api/admin/users", { username: "ZZ_Test_Ana", password: "clave-segura-1" });
const created = await json(r);
ok("crea usuario (se guarda en minúsculas)", r.status === 200 && created.user.username === "zz_test_ana", JSON.stringify(created));
const userId = created?.user?.id;
ok("no se puede repetir", (await owner.call("POST", "/api/admin/users", { username: "zz_test_ana", password: "otra-clave-12" })).status === 409);
ok("la respuesta no trae la clave", !JSON.stringify(created).includes("hash") && !JSON.stringify(created).includes("scrypt"));

const ana = mk();
ok("login con clave mala => 401", (await login(ana, "zz_test_ana", "mala-clave-1")) === 401);
ok("login usuario inexistente => 401", (await login(ana, "nadie_existe", "clave-segura-1")) === 401);
ok("login usuario nuevo (mayúsculas da igual)", (await login(ana, "ZZ_TEST_ANA", "clave-segura-1")) === 200);
ok("el usuario nuevo entra al admin", (await ana.call("GET", "/admin")).status === 200);
ok("el usuario nuevo puede crear canciones", (await ana.call("GET", "/api/setlists")).status === 200);
ok("el usuario nuevo NO ve usuarios (403)", (await ana.call("GET", "/api/admin/users")).status === 403);
ok("el usuario nuevo NO crea usuarios (403)", (await ana.call("POST", "/api/admin/users", { username: "otro_user", password: "clave-segura-1" })).status === 403);
ok("el usuario nuevo NO ve la pantalla de usuarios", (await ana.call("GET", "/admin/usuarios")).status === 307);
ok("sin sesión: /api/admin/users => 403", (await mk().call("GET", "/api/admin/users")).status === 403);
ok("dueño ve la pantalla de usuarios", (await owner.call("GET", "/admin/usuarios")).status === 200);

ok("borrar con id inválido => 404", (await owner.call("DELETE", "/api/admin/users/hola")).status === 404);
ok("dueño borra al usuario", (await owner.call("DELETE", `/api/admin/users/${userId}`)).status === 200);
ok("borrado: su cookie vieja deja de servir (API)", (await ana.call("GET", "/api/setlists")).status === 401);
ok("borrado: ya no puede entrar", (await login(mk(), "zz_test_ana", "clave-segura-1")) === 401);

// ---------- #6 duplicadas ----------
const all = await json(await mk().call("GET", "/api/songs?limit=500"));
const base = all.songs[0];
r = await owner.call("POST", "/api/songs", { title: base.title.toLowerCase(), body: "[C]prueba" });
const dup = await json(r);
ok("crear con título repetido (otra grafía) => 409", r.status === 409 && dup.duplicateOf?.id === base.id, JSON.stringify(dup));
r = await owner.call("POST", "/api/songs", { title: base.title, body: "[C]prueba duplicada", force: true });
const forced = await json(r);
ok("con force: true se guarda igual", r.status === 200);
r = await owner.call("GET", "/api/songs/duplicates");
const groups = (await json(r)).groups;
ok("lista de duplicadas => 200", r.status === 200);
const g = groups.find((x) => x.songs.some((s) => s.id === forced.song.id));
ok("la nueva aparece en un grupo de duplicadas", !!g && g.songs.length >= 2);
ok("cada copia trae cantidad de acordes", g?.songs.every((s) => typeof s.chordCount === "number" && typeof s.bodyLength === "number"));
ok("duplicadas sin sesión => 401", (await mk().call("GET", "/api/songs/duplicates")).status === 401);
ok("pantalla de duplicadas => 200", (await owner.call("GET", "/admin/duplicados")).status === 200);
ok("borrar la copia de prueba", (await owner.call("DELETE", `/api/songs/${forced.song.id}`)).status === 200);
const groupsAfter = (await json(await owner.call("GET", "/api/songs/duplicates"))).groups;
ok("ya no figura el grupo de prueba", !groupsAfter.some((x) => x.songs.some((s) => s.id === forced.song.id)));

// ---------- #5 último tono ----------
const [a, b] = all.songs.slice(1, 3);
r = await owner.call("POST", "/api/setlists", { title: "ZZ TEST tonos A", songIds: [a.id, b.id], transpose: { [a.id]: 3, [b.id]: -2 } });
const A = (await json(r)).setlist.id;
r = await owner.call("GET", "/api/setlists/last-tones");
let tones = (await json(r)).tones;
ok("last-tones => 200", r.status === 200);
ok("trae el tono de la última vez", tones[a.id]?.semitones === 3 && tones[b.id]?.semitones === -2, JSON.stringify(tones[a.id]));
ok("trae el nombre del power", tones[a.id]?.setlistTitle === "ZZ TEST tonos A");
r = await owner.call("POST", "/api/setlists", { title: "ZZ TEST tonos B", songIds: [a.id], transpose: { [a.id]: 5 } });
const B = (await json(r)).setlist.id;
tones = (await json(await owner.call("GET", "/api/setlists/last-tones"))).tones;
ok("gana el power más reciente", tones[a.id]?.semitones === 5 && tones[b.id]?.semitones === -2);
tones = (await json(await owner.call("GET", `/api/setlists/last-tones?exclude=${B}`))).tones;
ok("exclude deja afuera el power que se edita", tones[a.id]?.semitones === 3);
ok("exclude inválido no rompe", (await owner.call("GET", "/api/setlists/last-tones?exclude=xx")).status === 200);
ok("last-tones sin sesión => 401", (await mk().call("GET", "/api/setlists/last-tones")).status === 401);

// ---------- #4 vista previa ----------
r = await owner.call("PATCH", `/api/setlists/${A}`, { dividers: [{ name: "ALABANZA", position: 0 }, { name: "FINAL", position: 2 }] });
ok("armar power con divisores", r.status === 200);
r = await fetch(BASE + `/powers/${A}/vista-previa`);
const html = (await r.text()).replace(/<!-- -->/g, "");
ok("vista previa => 200", r.status === 200);
ok("muestra los divisores", html.includes("ALABANZA") && html.includes("FINAL"));
ok("muestra los títulos de las canciones", html.includes(a.title.toUpperCase().replace(/&/g, "&amp;")) || html.includes(a.title.toUpperCase()));
ok("muestra el link de descarga", html.includes(`/api/setlists/${A}/export-pptx`));
ok("vista previa de power inexistente => 404", (await fetch(BASE + "/powers/00000000-0000-4000-8000-000000000000/vista-previa")).status === 404);
ok("vista previa con id inválido => 404", (await fetch(BASE + "/powers/xx/vista-previa")).status === 404);
const exp = await fetch(BASE + `/api/setlists/${A}/export-pptx`);
ok("el export sigue andando tras el refactor", exp.status === 200);
const nPreview = (html.match(/(\d+) de (\d+)/g) ?? []).length;
const total = Number(html.match(/(\d+) diapositivas/)?.[1]);
ok("la cantidad de diapositivas coincide con la vista previa", nPreview === total, `${nPreview} vs ${total}`);

ok("limpiar power A", (await owner.call("DELETE", `/api/setlists/${A}`)).status === 200);
ok("limpiar power B", (await owner.call("DELETE", `/api/setlists/${B}`)).status === 200);

console.log(`\nHTTP2: ${pass} OK, ${fail} FAIL`);
