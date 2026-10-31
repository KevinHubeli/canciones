// HTTP: papelera, historial de versiones, filtro "Sin acordes" y límites de paginación.
//
// Contratos que asume (ver e2e/README.md):
//   DELETE /api/songs/:id                         -> manda a la papelera (200); GET /api/songs/:id pasa a 404
//   GET    /api/songs/trash                       -> { songs: [{ id, title, ... }] } (requiere sesión)
//   POST   /api/songs/:id/restore                 -> 200 y la canción vuelve
//   DELETE /api/songs/trash                       -> 200 { purged: n } y vacía la papelera
//   GET    /api/songs/:id/versions                -> { versions: [{ id, ... }] } (requiere sesión)
//   POST   /api/songs/:id/versions/:vid/revert    -> 200 y la canción vuelve a esa versión
//   GET    /api/songs?tag=Sin%20acordes           -> solo canciones sin [acordes]
import { NIL_UUID, client, json, loginOwner, main, makeSong, ok, section, skip, songsOf, title } from "./lib.mjs";

/** Saca la lista de canciones de la respuesta de la papelera, sea cual sea el nombre de la clave. */
const listOf = (data, ...keys) => {
  if (Array.isArray(data)) return data;
  for (const k of keys) if (Array.isArray(data?.[k])) return data[k];
  return [];
};

await main("HTTP4", async () => {
  const owner = await loginOwner();
  const anon = client();
  const trashSongs = async () => listOf(await json(await owner.get("/api/songs/trash")), "songs", "trash", "items");

  // ---------- papelera ----------
  section("papelera");
  const t1 = await makeSong(owner, "papelera 1");
  const t2 = await makeSong(owner, "papelera 2");
  ok("borrar manda a la papelera (200)", (await owner.del(`/api/songs/${t1.id}`)).status === 200);
  ok("la canción borrada ya no se lee (404)", (await anon.get(`/api/songs/${t1.id}`)).status === 404);
  const listed = songsOf(await json(await anon.get(`/api/songs?q=${encodeURIComponent(t1.title)}&limit=50`)));
  ok("la canción borrada no sale en el listado público", !listed.some((s) => s.id === t1.id));
  ok("GET /api/songs/trash sin sesión => 401", (await anon.get("/api/songs/trash")).status === 401);
  let r = await owner.get("/api/songs/trash");
  ok("GET /api/songs/trash => 200", r.status === 200);
  let inTrash = listOf(await json(r), "songs", "trash", "items");
  ok("la papelera lista la canción borrada", inTrash.some((s) => s.id === t1.id), `ids: ${inTrash.map((s) => s.id).join(",")}`);
  ok("la papelera NO lista las canciones vivas", !inTrash.some((s) => s.id === t2.id));

  ok("restaurar sin sesión => 401", (await anon.post(`/api/songs/${t1.id}/restore`)).status === 401);
  ok("restaurar id inválido => 404", (await owner.post("/api/songs/xx/restore")).status === 404);
  ok("restaurar una que no existe => 404", (await owner.post(`/api/songs/${NIL_UUID}/restore`)).status === 404);
  ok("restaurar una viva (no está en la papelera) no rompe", [200, 404, 409].includes((await owner.post(`/api/songs/${t2.id}/restore`)).status));
  r = await owner.post(`/api/songs/${t1.id}/restore`);
  ok("restaurar => 200", r.status === 200, `status ${r.status}`);
  ok("la canción restaurada se vuelve a leer", (await anon.get(`/api/songs/${t1.id}`)).status === 200);
  inTrash = await trashSongs();
  ok("ya no está en la papelera", !inTrash.some((s) => s.id === t1.id));

  // Vaciar la papelera borra TODO lo que haya en ella: solo se prueba si adentro hay
  // únicamente canciones de prueba (si no, se respetaría una papelera con datos reales).
  ok("vaciar sin sesión => 401", (await anon.del("/api/songs/trash")).status === 401);
  await owner.del(`/api/songs/${t1.id}`);
  inTrash = await trashSongs();
  const foreign = inTrash.filter((s) => !String(s.title ?? "").startsWith("ZZ_e2e_"));
  if (foreign.length) {
    skip("vaciar la papelera", `hay ${foreign.length} canciones que no son de prueba en la papelera; no se toca`);
  } else {
    r = await owner.del("/api/songs/trash");
    const purgedBody = await json(r);
    ok("vaciar la papelera => 200", r.status === 200, `status ${r.status}`);
    ok("dice cuántas borró (purged >= 1)", typeof purgedBody?.purged === "number" && purgedBody.purged >= 1, JSON.stringify(purgedBody));
    ok("la papelera queda vacía", (await trashSongs()).length === 0);
    ok("una canción vaciada no se puede restaurar (404)", (await owner.post(`/api/songs/${t1.id}/restore`)).status === 404);
  }

  // ---------- historial de versiones ----------
  section("historial de versiones");
  const original = "[C]Letra original uno\n[G]Letra original dos";
  const v = await makeSong(owner, "versiones", { body: original });
  const other = await makeSong(owner, "versiones otra");
  const edited = "[D]Letra cambiada uno\n[A]Letra cambiada dos";
  r = await owner.patch(`/api/songs/${v.id}`, { body: edited });
  ok("PATCH cambia el cuerpo", r.status === 200 && (await json(r))?.song?.body === edited);
  ok("versiones sin sesión => 401/403", [401, 403].includes((await anon.get(`/api/songs/${v.id}/versions`)).status));
  ok("versiones con id inválido => 404", (await owner.get("/api/songs/xx/versions")).status === 404);
  r = await owner.get(`/api/songs/${v.id}/versions`);
  ok("GET versions => 200", r.status === 200);
  const versions = listOf(await json(r), "versions", "items");
  ok("lista la versión previa", versions.length >= 1, `versions=${versions.length}`);
  // La versión guarda el contenido de ANTES del cambio. Si la lista trae el cuerpo, se busca por él.
  const prev = versions.find((x) => typeof x.body === "string" && x.body.includes("Letra original")) ?? versions[versions.length - 1] ?? versions[0];
  if (versions.some((x) => typeof x.body === "string")) {
    ok("la versión previa trae el texto original", !!prev && prev.body.includes("Letra original"), JSON.stringify(prev)?.slice(0, 200));
  }
  ok("cada versión tiene id", versions.every((x) => typeof x.id === "string"));

  ok("revertir sin sesión => 401", (await anon.post(`/api/songs/${v.id}/versions/${prev?.id}/revert`)).status === 401);
  ok("revertir con versión inexistente => 404", (await owner.post(`/api/songs/${v.id}/versions/${NIL_UUID}/revert`)).status === 404);
  ok("revertir con versión inválida => 404", (await owner.post(`/api/songs/${v.id}/versions/xx/revert`)).status === 404);
  ok(
    "una versión de OTRA canción no se puede aplicar (404)",
    (await owner.post(`/api/songs/${other.id}/versions/${prev?.id}/revert`)).status === 404
  );
  ok("…y la otra canción quedó intacta", (await json(await anon.get(`/api/songs/${other.id}`)))?.song?.body === other.body);
  r = await owner.post(`/api/songs/${v.id}/versions/${prev?.id}/revert`);
  ok("revertir => 200", r.status === 200, `status ${r.status}`);
  const back = (await json(await anon.get(`/api/songs/${v.id}`)))?.song;
  ok("la canción vuelve al texto original", back?.body === original, back?.body);
  const after = listOf(await json(await owner.get(`/api/songs/${v.id}/versions`)), "versions", "items");
  ok("revertir también queda en el historial (no se pierde lo editado)", after.length > versions.length, `${versions.length} -> ${after.length}`);

  // ---------- filtro "Sin acordes" ----------
  section("filtro Sin acordes");
  const withChords = await makeSong(owner, "con acordes", { body: "[C]Esta tiene acordes\n[G]y otra línea" });
  const noChords = await makeSong(owner, "sin acordes", { body: "Esta es pura letra de prueba\nsin ningún acorde adentro" });
  const sin = songsOf(await json(await anon.get("/api/songs?tag=Sin%20acordes&limit=500")));
  ok("'Sin acordes' trae la que no tiene corchetes", sin.some((s) => s.id === noChords.id));
  ok("'Sin acordes' NO trae la que sí tiene acordes", !sin.some((s) => s.id === withChords.id));
  ok("todas las que trae están sin [acordes]", sin.every((s) => !/\[[^\]]+\]/.test(s.body ?? "")));
  r = await anon.get("/api/songs?tag=Sin%20acordes&tag=Alabanza&limit=10");
  ok("combinar 'Sin acordes' con otro tag no rompe", r.status === 200);
  r = await anon.get(`/api/songs?tag=Sin%20acordes&q=${encodeURIComponent(title("sin acordes"))}`);
  ok("'Sin acordes' + búsqueda => la encuentra", songsOf(await json(r)).some((s) => s.id === noChords.id));

  // ---------- limit / offset raros ----------
  section("limit y offset");
  for (const qs of [
    "limit=2.5&offset=1.5", "limit=0.4", "limit=1e3", "limit=-3&offset=-0.5", "limit=NaN&offset=Infinity",
    "limit=%20&offset=%20", "limit=2&offset=99999999999999999999", "limit=3.999&offset=0.001",
  ]) {
    r = await anon.get(`/api/songs?${qs}`);
    ok(`?${qs} no da 500`, r.status === 200, `status ${r.status}`);
  }
  const lim = songsOf(await json(await anon.get("/api/songs?limit=2.5")));
  ok("limit decimal respeta un tope razonable", lim.length <= 3, `len=${lim.length}`);
});
