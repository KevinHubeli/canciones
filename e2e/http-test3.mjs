// HTTP: historial de cambios con dos usuarios, copiar un power y divisores al presentar.
import {
  BASE, NIL_UUID, USER, client, json, loginOwner, main, makePower, makeSong, makeUser, ok, onCleanup, section, text, title,
  visible,
} from "./lib.mjs";

await main("HTTP3", async () => {
  const owner = await loginOwner();
  const anon = client();

  // ---------- historial con dos usuarios ----------
  section("historial");
  const ana = await makeUser(owner, "hist");
  const songTitle = title("Hist cancion");
  let r = await ana.client.post("/api/songs", { title: songTitle, body: "[C]uno", force: true });
  const song = (await json(r))?.song;
  ok("la usuaria crea una canción", r.status === 200 && !!song?.id);
  const songId = song?.id;
  if (songId) onCleanup("canción de la usuaria", () => owner.del(`/api/songs/${songId}`));
  await ana.client.patch(`/api/songs/${songId}`, { body: "[D]dos" });
  const power = await makePower(owner, "Hist power", [songId]);
  await owner.patch(`/api/setlists/${power.id}`, { title: title("Hist power editado") });

  r = await ana.client.get("/admin/historial");
  ok("el historial se abre con cualquier usuario del admin", r.status === 200);
  let t = visible(await r.text());
  ok("anota que la usuaria creó la canción", t.includes(`${ana.username} creó la canción "${songTitle}"`), t.slice(0, 300));
  ok("anota que la usuaria editó la canción", t.includes(`${ana.username} editó la canción "${songTitle}"`));
  ok("anota que el dueño creó el power", t.includes(`${USER} creó el power "${title("Hist power")}"`));
  ok("anota la edición del power (con el título nuevo)", t.includes(`${USER} editó el power "${title("Hist power editado")}"`));
  ok("sin sesión el historial redirige", (await anon.get("/admin/historial")).status === 307);

  // ---------- copiar un power ----------
  section("copiar power");
  const a = await makeSong(owner, "copia A");
  const b = await makeSong(owner, "copia B");
  const orig = await makePower(owner, "Original", [a.id, b.id], {
    transpose: { [a.id]: 3, [b.id]: -1 },
    dividers: [{ name: "ALABANZA", position: 0 }, { name: "OFRENDA", position: 1 }],
  });
  r = await owner.post(`/api/setlists/${orig.id}/duplicate`);
  const copy = (await json(r))?.setlist;
  ok("copiar => 200", r.status === 200 && !!copy?.id && copy.id !== orig.id);
  if (copy?.id) {
    const copyId = copy.id;
    onCleanup("copia de power", () => owner.del(`/api/setlists/${copyId}`));
  }
  ok("la copia se llama '... (copia)'", copy?.title === `${title("Original")} (copia)`, copy?.title);
  const copyFull = (await json(await anon.get(`/api/setlists/${copy.id}`)))?.setlist;
  ok("la copia trae las mismas canciones y orden", copyFull.songs.map((s) => s.id).join() === [a.id, b.id].join());
  ok("la copia trae los tonos", copyFull.songs[0].semitones === 3 && copyFull.songs[1].semitones === -1);
  ok(
    "la copia trae los divisores",
    JSON.stringify(copyFull.dividers) === JSON.stringify([{ name: "ALABANZA", position: 0 }, { name: "OFRENDA", position: 1 }]),
    JSON.stringify(copyFull.dividers)
  );
  await owner.patch(`/api/setlists/${copy.id}`, { title: title("Copia editada"), songIds: [a.id], transpose: { [a.id]: 0 }, dividers: [] });
  const origAfter = (await json(await anon.get(`/api/setlists/${orig.id}`)))?.setlist;
  ok(
    "editar la copia no toca el original",
    origAfter.songs.length === 2 && origAfter.dividers.length === 2 && origAfter.songs[0].semitones === 3
  );
  ok("copiar sin sesión => 401", (await anon.post(`/api/setlists/${orig.id}/duplicate`)).status === 401);
  ok("copiar id inválido => 404", (await owner.post("/api/setlists/xx/duplicate")).status === 404);
  ok("copiar power inexistente => 404", (await owner.post(`/api/setlists/${NIL_UUID}/duplicate`)).status === 404);
  t = visible(await (await owner.get("/admin/historial")).text());
  ok("la copia queda en el historial", t.includes(`${USER} copió el power "${title("Original")}"`));

  // ---------- divisores al presentar ----------
  section("divisores al presentar");
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
  ok(
    "la página del power manda los divisores al visor",
    p.includes("d=ALABANZA.0%2COFRENDA.1") || p.includes("d=ALABANZA.0,OFRENDA.1") || p.includes("ALABANZA.0")
  );
  ok("'Presentar desde el principio' pide la pantalla (s=1)", /Presentar desde el principio/.test(p) && p.includes("s=1"));

  // ---------- borrados que quedan anotados ----------
  section("borrados en el historial");
  ok("la usuaria borra su canción", (await ana.client.del(`/api/songs/${songId}`)).status === 200);
  t = visible(await (await owner.get("/admin/historial")).text());
  ok("el borrado queda anotado con el título", t.includes(`${ana.username} eliminó la canción "${songTitle}"`));
  ok("el dueño borra a la usuaria", (await owner.del(`/api/admin/users/${ana.id}`)).status === 200);
  t = visible(await (await owner.get("/admin/historial")).text());
  ok("el borrado de usuario queda anotado", t.includes(`${USER} eliminó el usuario "${ana.username}"`));
});
