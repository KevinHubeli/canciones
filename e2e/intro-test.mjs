import { chromium } from "playwright";
const BASE = process.env.E2E_URL ?? "http://localhost:3100";
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) pass++; else { fail++; console.log("  FAIL:", n, d); } };

const found = await (await fetch(`${BASE}/api/songs?q=Libre%20Soy&limit=5`)).json();
const song = found.songs.find((s) => s.title === "Libre Soy");
ok("existe la canción de prueba", !!song);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(`${BASE}/canciones/${song.id}`);
await page.waitForSelector("h1");
// fila de acordes que está justo arriba del renglón "Intro:"
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
await page.screenshot({ path: "e2e/out/intro.png" });
await browser.close();
console.log(`\nINTRO: ${pass} OK, ${fail} FAIL`);
