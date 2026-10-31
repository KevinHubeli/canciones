// UI: la "Intro:" en texto plano cambia de tono junto con el resto de la canción.
// Crea su propia canción (antes dependía de "Libre Soy"), así que anda con la base vacía.
import { BASE, launchPage, loginOwner, main, makeSong, ok, shot } from "./lib.mjs";

await main("INTRO", async () => {
  const owner = await loginOwner();
  const song = await makeSong(owner, "intro", {
    originalKey: "Am",
    // Intro en texto plano ("Intro: Am - F - C - G"): el servidor la pasa a corchetes. Debajo, un verso normal.
    body: "Intro: Am - F - C - G\n[Am]Primera línea de prueba\n[G]Segunda línea",
  });

  const { page } = await launchPage();
  await page.goto(`${BASE}/canciones/${song.id}`);
  await page.waitForSelector("h1");

  // texto del bloque donde está el renglón "Intro:" (con los acordes que lleva arriba)
  const introChords = () =>
    page.evaluate(() => {
      const rows = [...document.querySelectorAll("div.font-mono, div.font-mono *")];
      const lyric = rows.find((el) => el.children.length === 0 && /^Intro:/.test(el.textContent ?? ""));
      const container = lyric?.closest("[class*='break-inside']")?.parentElement ?? lyric?.parentElement?.parentElement;
      return (container?.textContent ?? "").replace(/\s+/g, " ").trim();
    });
  const before = await introChords();
  ok("la intro muestra sus acordes", /Am/.test(before) && /G/.test(before), before);
  await page.click('button[aria-label="Mostrar menú"]');
  await page.click("text=Cambio de Tono");
  await page.click('button[aria-label="Subir semitono"]');
  await page.click('button[aria-label="Subir semitono"]');
  const after = await introChords();
  ok("la intro cambia de tono (Am F C G +2 => Bm G D A)", /Bm/.test(after) && /D/.test(after) && !/Am/.test(after), `${before} -> ${after}`);
  await shot(page, "intro");
});
