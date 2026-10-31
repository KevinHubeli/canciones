// Barrido: borra lo que hayan dejado tests que se cortaron a la mitad (canciones, powers y
// usuarios con prefijo ZZ_e2e_ / zz_e2e_). Nunca toca nada que no lleve ese prefijo.
// La papelera solo se vacía si TODO lo que hay adentro es de prueba.
import { PREFIX, json, loginOwner, main, ok, purgeTestTrash, section, songsOf } from "./lib.mjs";

await main("SWEEP", async () => {
  const owner = await loginOwner();
  section("barrido de datos de prueba");

  const songs = songsOf(await json(await owner.get(`/api/songs?q=${encodeURIComponent(PREFIX)}&limit=500`))).filter((s) =>
    s.title?.startsWith(PREFIX)
  );
  for (const s of songs) await owner.del(`/api/songs/${s.id}`);

  const powers = ((await json(await owner.get("/api/setlists")))?.setlists ?? []).filter((p) => p.title?.startsWith(PREFIX));
  for (const p of powers) await owner.del(`/api/setlists/${p.id}`);

  const users = ((await json(await owner.get("/api/admin/users")))?.users ?? []).filter((u) => u.username?.startsWith(PREFIX.toLowerCase()));
  for (const u of users) await owner.del(`/api/admin/users/${u.id}`);

  const foreignInTrash = await purgeTestTrash(owner);
  console.log(`  borradas: ${songs.length} canciones, ${powers.length} powers, ${users.length} usuarios`);
  if (foreignInTrash) console.log(`  la papelera tiene ${foreignInTrash} canciones que no son de prueba: no se vació.`);

  // Comprobación: no queda nada visible con el prefijo.
  const left = songsOf(await json(await owner.get(`/api/songs?q=${encodeURIComponent(PREFIX)}&limit=500`))).filter((s) =>
    s.title?.startsWith(PREFIX)
  );
  ok("no quedan canciones de prueba", left.length === 0, `quedan ${left.length}`);
});
