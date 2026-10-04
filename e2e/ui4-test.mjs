import { chromium } from "playwright";
const BASE = process.env.E2E_URL ?? "http://localhost:3100";
const USER = process.env.E2E_USER ?? "tester";
const PASS = process.env.E2E_PASS ?? "tmp-pass-123";
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) pass++; else { fail++; console.log("  FAIL:", n, d); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
const api = (method, path, body) =>
  page.evaluate(async ([m, p, b]) => {
    const r = await fetch(p, { method: m, headers: { "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  }, [method, path, body]);

await page.goto(BASE + "/admin/login");
await page.fill('input[placeholder="Usuario"]', USER);
await page.fill('input[placeholder="Contraseña"]', PASS);
await page.click('button[type="submit"]');
await page.waitForURL("**/admin");
await page.waitForSelector("ul li");

// ---------- basura en el formulario ----------
await page.goto(BASE + "/admin/nueva");
await page.fill("input[required]", "ZZ basura " + Date.now());
const dirty = [" Diagramas de Acordes ", "Mostrar / Ocultar ", "Guitarra ", "Piano ", "", "   D", "///QUIERO LLENAR", "G", "TU TRONO DE ALABANZA"].join("\n");
await page.fill("textarea", dirty);
await page.waitForSelector("text=líneas que parecen de la página web");
ok("avisa de la basura (4 líneas)", (await page.locator("text=Hay 4 líneas").count()) === 1);
ok("lista las líneas encontradas", (await page.locator("li", { hasText: "Diagramas de Acordes" }).count()) >= 1);
await page.screenshot({ path: "e2e/out/junk.png", fullPage: true });
await page.click('button:has-text("Dejar así")');
ok("'Dejar así' oculta el aviso y no toca el texto", (await page.locator("text=líneas que parecen").count()) === 0 && (await page.inputValue("textarea")) === dirty);
await page.fill("textarea", dirty + "\nGuitarra");
await page.fill("textarea", dirty);
await page.reload();
await page.fill("input[required]", "ZZ basura 2");
await page.fill("textarea", dirty);
await page.waitForSelector("text=Hay 4 líneas");
await page.click('button:has-text("Quitar esas líneas")');
const cleaned = await page.inputValue("textarea");
ok("'Quitar' saca las líneas de menú", !/Guitarra|Piano|Diagramas|Mostrar/.test(cleaned), JSON.stringify(cleaned));
ok("'Quitar' deja la canción", cleaned.startsWith("   D\n///QUIERO LLENAR\nG"), JSON.stringify(cleaned));
ok("el aviso desaparece al limpiar", (await page.locator("text=líneas que parecen").count()) === 0);
ok("una canción limpia no muestra aviso", (await page.locator("text=parece de la página").count()) === 0);

// ---------- copiar power desde la lista ----------
const songs = (await api("GET", "/api/songs?limit=3")).data.songs;
const pw = (await api("POST", "/api/setlists", {
  title: "ZZ UI copiar", songIds: [songs[0].id, songs[1].id], transpose: { [songs[0].id]: 2 },
  dividers: [{ name: "ADORACIÓN", position: 0 }],
})).data.setlist.id;
await page.goto(BASE + "/admin/powers");
await page.waitForSelector("text=ZZ UI copiar");
await page.locator("li", { hasText: "ZZ UI copiar" }).locator('button[aria-label^="Copiar este power"]').click();
await page.waitForURL("**/editar", { timeout: 15000 });
await page.waitForSelector("text=ADORACIÓN");
const titleVal = await page.inputValue('input[placeholder^="Nombre del power"]');
ok("al copiar se abre la copia para editarla", titleVal === "ZZ UI copiar (copia)", titleVal);
ok("la copia trae el divisor y las canciones", (await page.locator("ul").first().locator("li").count()) === 3);
const copyId = page.url().match(/powers\/([0-9a-f-]{36})/)[1];

// ---------- presentar con divisores ----------
await page.goto(BASE + `/powers/${pw}`);
await page.click('a:has-text("Presentar desde el principio")');
await page.waitForSelector('button[aria-label="Empezar"]');
ok("al presentar aparece la pantalla de la sección", (await page.locator('button[aria-label="Empezar"]').innerText()).includes("ADORACIÓN"));
await page.screenshot({ path: "e2e/out/section-intro.png" });
await page.click('button[aria-label="Empezar"]');
ok("un toque la cierra", (await page.locator('button[aria-label="Empezar"]').count()) === 0);
ok("el visor dice en qué sección está", (await page.locator("text=ADORACIÓN ·").count()) >= 1);
await page.click('button[aria-label="Canción siguiente del power"]');
await page.waitForURL(/i=1/);
ok("al pasar a la siguiente (sin divisor ahí) no hay pantalla", (await page.locator('button[aria-label="Empezar"]').count()) === 0);

await api("DELETE", `/api/setlists/${pw}`);
await api("DELETE", `/api/setlists/${copyId}`);

// ---------- historial (pantalla) ----------
await page.goto(BASE + "/admin/historial");
await page.waitForSelector("text=Historial");
ok("la pantalla del historial lista cambios", (await page.locator("main ul li").count()) > 0);
await page.screenshot({ path: "e2e/out/history.png" });
ok("el admin tiene el chip Historial", (await (async () => { await page.goto(BASE + "/admin"); await page.waitForSelector("ul li"); return page.locator('a:has-text("Historial")').count(); })()) > 0);

const relevant = errors.filter((e) => !/favicon|manifest|sw\.js|DevTools|status of 409/i.test(e));
ok("sin errores ni warnings", relevant.length === 0, relevant.slice(0, 3).join(" | "));
await browser.close();
console.log(`\nUI4: ${pass} OK, ${fail} FAIL`);
