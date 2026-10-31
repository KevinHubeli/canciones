// HTTP: usuarios (dueño vs. usuarios de la base), canciones duplicadas, último tono y vista previa.
import {
  BASE, NIL_UUID, USER, client, json, loginOwner, main, makePower, makeSong, ok, section, text, title, username,
} from "./lib.mjs";

await main("HTTP2", async () => {
  const owner = await loginOwner();
  const anon = client();

  // ---------- usuarios ----------
  section("usuarios");
  let r = await owner.get("/api/admin/users");
  ok("dueño lista usuarios", r.status === 200);
  for (const [u, p, why] of [
    ["ab", "password123", "usuario corto"],
    ["Maria Perez", "password123", "usuario con espacio"],
    [username("clavecorta"), "corta", "clave corta"],
    [username("clavefacil"), "password123", "clave obvia (password123)"],
    [username("clavesec"), "12345678", "clave secuencial"],
  ]) {
    r = await owner.post("/api/admin/users", { username: u, password: p });
    ok(`rechaza ${why}`, r.status === 400, `status ${r.status}`);
  }
  if (/^[a-z0-9._-]{3,30}$/.test(USER.toLowerCase())) {
    r = await owner.post("/api/admin/users", { username: USER, password: "clave-segura-1" });
    ok("rechaza el nombre del dueño", r.status === 409, `status ${r.status}`);
  }

  const name = username("ana").toUpperCase(); // mayúsculas a propósito
  r = await owner.post("/api/admin/users", { username: name, password: "clave-segura-1" });
  const created = await json(r);
  ok("crea usuario (se guarda en minúsculas)", r.status === 200 && created.user.username === name.toLowerCase(), JSON.stringify(created));
  const userId = created?.user?.id;
  let userDeleted = false;
  const ana = client();
  try {
    ok(
      "no se puede repetir",
      (await owner.post("/api/admin/users", { username: name.toLowerCase(), password: "otra-clave-12" })).status === 409
    );
    ok("la respuesta no trae la clave", !JSON.stringify(created).includes("hash") && !JSON.stringify(created).includes("scrypt"));
    const listed = JSON.stringify(await json(await owner.get("/api/admin/users")));
    ok("el listado de usuarios tampoco trae claves", !listed.includes("scrypt") && !/hash/i.test(listed));

    ok("login con clave mala => 401", (await client().login(name.toLowerCase(), "mala-clave-1")) === 401);
    ok("login usuario inexistente => 401", (await client().login(username("nadie"), "clave-segura-1")) === 401);
    ok("login usuario nuevo (mayúsculas da igual)", (await ana.login(name, "clave-segura-1")) === 200);
    ok("el usuario nuevo entra al admin", (await ana.get("/admin")).status === 200);
    ok("el usuario nuevo puede ver powers", (await ana.get("/api/setlists")).status === 200);
    ok("el usuario nuevo NO ve usuarios (403)", (await ana.get("/api/admin/users")).status === 403);
    ok(
      "el usuario nuevo NO crea usuarios (403)",
      (await ana.post("/api/admin/users", { username: username("otro"), password: "clave-segura-1" })).status === 403
    );
    ok("el usuario nuevo NO ve la pantalla de usuarios", (await ana.get("/admin/usuarios")).status === 307);
    ok("sin sesión: /api/admin/users => 403", (await anon.get("/api/admin/users")).status === 403);
    ok("dueño ve la pantalla de usuarios", (await owner.get("/admin/usuarios")).status === 200);

    ok("borrar con id inválido => 404", (await owner.del("/api/admin/users/hola")).status === 404);
    ok("borrar usuario inexistente => 404", (await owner.del(`/api/admin/users/${NIL_UUID}`)).status === 404);
    ok("un usuario común no borra usuarios (403)", (await ana.del(`/api/admin/users/${userId}`)).status === 403);
    ok("dueño borra al usuario", (await owner.del(`/api/admin/users/${userId}`)).status === 200);
    userDeleted = true;
    ok("borrado: su cookie vieja deja de servir (API)", (await ana.get("/api/setlists")).status === 401);
    ok("borrado: ya no puede entrar", (await client().login(name, "clave-segura-1")) === 401);
  } finally {
    if (!userDeleted && userId) await owner.del(`/api/admin/users/${userId}`);
  }

  // ---------- duplicadas ----------
  section("duplicadas");
  const base = await makeSong(owner, "Dup Base");
  r = await owner.post("/api/songs", { title: base.title.toLowerCase(), body: "[C]prueba" });
  const dup = await json(r);
  ok("crear con título repetido (otra grafía) => 409", r.status === 409 && dup.duplicateOf?.id === base.id, JSON.stringify(dup));
  const forced = await makeSong(owner, "Dup Base", { body: "[C]prueba duplicada" }); // force: true
  r = await owner.get("/api/songs/duplicates");
  const groups = (await json(r))?.groups ?? [];
  ok("lista de duplicadas => 200", r.status === 200);
  const g = groups.find((x) => x.songs.some((s) => s.id === forced.id));
  ok("la nueva aparece en un grupo de duplicadas", !!g && g.songs.length >= 2);
  ok(
    "cada copia trae cantidad de acordes y de letras",
    !!g && g.songs.every((s) => typeof s.chordCount === "number" && typeof s.bodyLength === "number")
  );
  ok("duplicadas sin sesión => 401", (await anon.get("/api/songs/duplicates")).status === 401);
  ok("pantalla de duplicadas => 200", (await owner.get("/admin/duplicados")).status === 200);
  ok("borrar la copia de prueba", (await owner.del(`/api/songs/${forced.id}`)).status === 200);
  const groupsAfter = (await json(await owner.get("/api/songs/duplicates")))?.groups ?? [];
  ok("ya no figura el grupo de prueba", !groupsAfter.some((x) => x.songs.some((s) => s.id === forced.id)));

  // ---------- último tono ----------
  section("último tono");
  const a = await makeSong(owner, "tonos A");
  const b = await makeSong(owner, "tonos B");
  const A = await makePower(owner, "tonos A", [a.id, b.id], { transpose: { [a.id]: 3, [b.id]: -2 } });
  r = await owner.get("/api/setlists/last-tones");
  let tones = (await json(r))?.tones ?? {};
  ok("last-tones => 200", r.status === 200);
  ok("trae el tono de la última vez", tones[a.id]?.semitones === 3 && tones[b.id]?.semitones === -2, JSON.stringify(tones[a.id]));
  ok("trae el nombre del power", tones[a.id]?.setlistTitle === title("tonos A"));
  const B = await makePower(owner, "tonos B", [a.id], { transpose: { [a.id]: 5 } });
  tones = (await json(await owner.get("/api/setlists/last-tones")))?.tones ?? {};
  ok("gana el power más reciente", tones[a.id]?.semitones === 5 && tones[b.id]?.semitones === -2);
  tones = (await json(await owner.get(`/api/setlists/last-tones?exclude=${B.id}`)))?.tones ?? {};
  ok("exclude deja afuera el power que se edita", tones[a.id]?.semitones === 3);
  ok("exclude inválido no rompe", (await owner.get("/api/setlists/last-tones?exclude=xx")).status === 200);
  ok("last-tones sin sesión => 401", (await anon.get("/api/setlists/last-tones")).status === 401);

  // ---------- vista previa ----------
  section("vista previa");
  r = await owner.patch(`/api/setlists/${A.id}`, { dividers: [{ name: "ALABANZA", position: 0 }, { name: "FINAL", position: 2 }] });
  ok("armar power con divisores", r.status === 200);
  r = await fetch(`${BASE}/powers/${A.id}/vista-previa`);
  const html = await text(r);
  ok("vista previa => 200", r.status === 200);
  ok("muestra los divisores", html.includes("ALABANZA") && html.includes("FINAL"));
  ok(
    "muestra los títulos de las canciones",
    html.includes(a.title.toUpperCase().replace(/&/g, "&amp;")) || html.includes(a.title.toUpperCase()) || html.includes(a.title)
  );
  ok("muestra el link de descarga", html.includes(`/api/setlists/${A.id}/export-pptx`));
  ok("vista previa de power inexistente => 404", (await fetch(`${BASE}/powers/${NIL_UUID}/vista-previa`)).status === 404);
  ok("vista previa con id inválido => 404", (await fetch(`${BASE}/powers/xx/vista-previa`)).status === 404);
  ok("el export de pptx anda", (await fetch(`${BASE}/api/setlists/${A.id}/export-pptx`)).status === 200);
  const nPreview = (html.match(/(\d+) de (\d+)/g) ?? []).length;
  const total = Number(html.match(/(\d+) diapositivas/)?.[1]);
  ok("la cantidad de diapositivas coincide con la vista previa", nPreview === total, `${nPreview} vs ${total}`);
});
