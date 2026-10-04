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
const text = async (r) => (await r.text()).replace(/<!-- -->/g, "");
const login = async (c, u, p) => {
  const r = await c.call("POST", "/api/auth/login", { username: u, password: p });
  if (r.status === 200) c.setCookie(r.headers.get("set-cookie").split(";")[0]);
  return r.status;
};

const owner = mk();
ok("login dueño", (await login(owner, USER, PASS)) === 200);

// ---------- historial con dos usuarios ----------
let r = await owner.call("POST", "/api/admin/users", { username: "zz_hist_ana", password: "clave-segura-1" });
const ana = (await json(r)).user;
const anaC = mk();
ok("login de la usuaria nueva", (await login(anaC, "zz_hist_ana", "clave-segura-1")) === 200);

r = await anaC.call("POST", "/api/songs", { title: "ZZ Hist cancion", body: "[C]uno", force: true });
const song = (await json(r)).song;
await anaC.call("PATCH", `/api/songs/${song.id}`, { body: "[D]dos" });
r = await owner.call("POST", "/api/setlists", { title: "ZZ Hist power", songIds: [song.id] });
const power = (await json(r)).setlist;
await owner.call("PATCH", `/api/setlists/${power.id}`, { title: "ZZ Hist power editado" });

r = await anaC.call("GET", "/admin/historial");
ok("el historial se abre con cualquier usuario del admin", r.status === 200);
let html = await text(r);
const norm = (h) => h.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/\s+/g, " ");
let t = norm(html);
ok("anota que la usuaria creó la canción", t.includes('zz_hist_ana creó la canción "ZZ Hist cancion"'), t.slice(0, 300));
ok("anota que la usuaria editó la canción", t.includes('zz_hist_ana editó la canción "ZZ Hist cancion"'));
ok("anota que el dueño creó el power", t.includes(`${USER} creó el power "ZZ Hist power"`));
ok("anota la edición del power (con el título nuevo)", t.includes(`${USER} editó el power "ZZ Hist power editado"`));
ok("sin sesión el historial redirige", (await mk().call("GET", "/admin/historial")).status === 307);

// ---------- copiar un power ----------
const all = (await json(await mk().call("GET", "/api/songs?limit=500"))).songs;
const [a, b] = all.slice(5, 7);
r = await owner.call("POST", "/api/setlists", {
  title: "ZZ Original", songIds: [a.id, b.id], transpose: { [a.id]: 3, [b.id]: -1 },
  dividers: [{ name: "ALABANZA", position: 0 }, { name: "OFRENDA", position: 1 }],
});
const orig = (await json(r)).setlist;
r = await owner.call("POST", `/api/setlists/${orig.id}/duplicate`);
const copy = (await json(r)).setlist;
ok("copiar => 200", r.status === 200 && !!copy?.id && copy.id !== orig.id);
ok("la copia se llama '... (copia)'", copy?.title === "ZZ Original (copia)", copy?.title);
const copyFull = (await json(await mk().call("GET", `/api/setlists/${copy.id}`))).setlist;
ok("la copia trae las mismas canciones y orden", copyFull.songs.map((s) => s.id).join() === [a.id, b.id].join());
ok("la copia trae los tonos", copyFull.songs[0].semitones === 3 && copyFull.songs[1].semitones === -1);
ok("la copia trae los divisores", JSON.stringify(copyFull.dividers) === JSON.stringify([{ name: "ALABANZA", position: 0 }, { name: "OFRENDA", position: 1 }]), JSON.stringify(copyFull.dividers));
await owner.call("PATCH", `/api/setlists/${copy.id}`, { title: "ZZ Copia editada", songIds: [a.id], transpose: { [a.id]: 0 }, dividers: [] });
const origAfter = (await json(await mk().call("GET", `/api/setlists/${orig.id}`))).setlist;
ok("editar la copia no toca el original", origAfter.songs.length === 2 && origAfter.dividers.length === 2 && origAfter.songs[0].semitones === 3);
ok("copiar sin sesión => 401", (await mk().call("POST", `/api/setlists/${orig.id}/duplicate`)).status === 401);
ok("copiar id inválido => 404", (await owner.call("POST", "/api/setlists/xx/duplicate")).status === 404);
ok("copiar power inexistente => 404", (await owner.call("POST", "/api/setlists/00000000-0000-4000-8000-000000000000/duplicate")).status === 404);
t = norm(await text(await owner.call("GET", "/admin/historial")));
ok("la copia queda en el historial", t.includes(`${USER} copió el power "ZZ Original"`));

// ---------- divisores al presentar ----------
const d = encodeURIComponent("ALABANZA.0,OFRENDA.1");
const base = `set=${a.id},${b.id}&t=3,-1&d=${d}`;
let v = await text(await fetch(`${BASE}/canciones/${a.id}?${base}&i=0&s=1`));
ok("al empezar muestra la pantalla de ALABANZA", v.includes("ALABANZA") && v.includes("tocá para empezar"));
v = await text(await fetch(`${BASE}/canciones/${b.id}?${base}&i=1&s=1`));
ok("al avanzar muestra OFRENDA antes de la canción", v.includes("OFRENDA") && v.includes("tocá para empezar"));
v = await text(await fetch(`${BASE}/canciones/${b.id}?${base}&i=1`));
ok("sin s=1 (al volver) no muestra la pantalla", !v.includes("tocá para empezar"));
ok("pero igual dice en qué sección está", v.includes("OFRENDA · "));
v = await text(await fetch(`${BASE}/canciones/${a.id}?set=${a.id},${b.id}&i=0&s=1`));
ok("un power sin divisores no muestra pantalla", !v.includes("tocá para empezar"));
v = await fetch(`${BASE}/canciones/${a.id}?set=${a.id}&i=0&s=1&d=${encodeURIComponent("XX.9,,.,FINAL.zz")}`);
ok("divisores inválidos en la URL no rompen", v.status === 200);
const p = await text(await fetch(`${BASE}/powers/${orig.id}`));
ok("la página del power manda los divisores al visor", p.includes("d=ALABANZA.0%2COFRENDA.1") || p.includes("d=ALABANZA.0,OFRENDA.1") || p.includes("ALABANZA.0"));
ok("'Presentar desde el principio' pide la pantalla (s=1)", /Presentar desde el principio/.test(p) && p.includes("s=1"));

// ---------- limpieza ----------
ok("borrar power original", (await owner.call("DELETE", `/api/setlists/${orig.id}`)).status === 200);
ok("borrar copia", (await owner.call("DELETE", `/api/setlists/${copy.id}`)).status === 200);
ok("borrar power de historial", (await owner.call("DELETE", `/api/setlists/${power.id}`)).status === 200);
ok("la usuaria borra su canción", (await anaC.call("DELETE", `/api/songs/${song.id}`)).status === 200);
t = norm(await text(await owner.call("GET", "/admin/historial")));
ok("el borrado queda anotado con el título", t.includes('zz_hist_ana eliminó la canción "ZZ Hist cancion"'));
ok("borrar la usuaria", (await owner.call("DELETE", `/api/admin/users/${ana.id}`)).status === 200);
t = norm(await text(await owner.call("GET", "/admin/historial")));
ok("el borrado de usuario queda anotado", t.includes(`${USER} eliminó el usuario "zz_hist_ana"`));

console.log(`\nHTTP3: ${pass} OK, ${fail} FAIL`);
