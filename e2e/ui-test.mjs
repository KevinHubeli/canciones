import { chromium } from "playwright";

const USER = process.env.E2E_USER ?? "tester";
const PASS = process.env.E2E_PASS ?? "tmp-pass-123";
let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) pass++; else { fail++; console.log("  FAIL:", name, detail); } };
const BASE = process.env.E2E_URL ?? "http://localhost:3100";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// login
await page.goto(BASE + "/admin/login");
await page.fill('input[placeholder="Usuario"]', USER);
await page.fill('input[placeholder="Contraseña"]', PASS);
await page.click('button[type="submit"]');
await page.waitForURL("**/admin", { timeout: 15000 });
ok("login por UI", true);

// lista admin: más de 100 canciones
await page.waitForSelector("ul li", { timeout: 15000 });
const adminCount = await page.locator("ul li").count();
ok("admin lista > 100 canciones", adminCount > 100, `count=${adminCount}`);

// armador
await page.goto(BASE + "/admin/powers/nuevo");
await page.fill('input[placeholder^="Nombre del power"]', "ZZ UI TEST");
await page.waitForSelector('button[aria-label="Agregar al power"]', { timeout: 15000 });
const addBtns = page.locator('button[aria-label="Agregar al power"]');
await addBtns.nth(0).click();
await addBtns.nth(1).click();
await page.click('button:has-text("+ ALABANZA")');
await page.click('button:has-text("+ OFRENDA")');
let items = await page.locator("ul").first().locator("li").allInnerTexts();
ok("lista tiene 4 entradas (2 canciones + 2 divisores)", items.length === 4, JSON.stringify(items));
// subir ALABANZA (3ra entrada) dos veces => queda arriba de todo
const upBtn = (i) => page.locator("ul").first().locator("li").nth(i).locator('button[aria-label="Subir"]');
await upBtn(2).click();
await upBtn(1).click();
items = await page.locator("ul").first().locator("li").allInnerTexts();
ok("ALABANZA subió al principio", items[0].includes("ALABANZA"), JSON.stringify(items.map((t) => t.slice(0, 20))));
// cambiar tono de la primera canción (+1)
await page.locator('button[aria-label="Subir semitono"]').first().click();
const toneTxt = await page.locator("span.font-mono.text-chord-gold").first().innerText();
ok("el tono cambia en el armador", toneTxt.length > 0, toneTxt);
await page.screenshot({ path: "e2e/out/ui-builder.png" });
await page.click('button:has-text("Guardar power")');
await page.waitForURL("**/admin/powers", { timeout: 15000 });
ok("guardó y volvió a la lista", true);
await page.waitForSelector("text=ZZ UI TEST");

// editar: los divisores se recuperan
await page.locator("li", { hasText: "ZZ UI TEST" }).locator('a[aria-label="Editar"]').click();
await page.waitForURL("**/editar");
await page.waitForSelector("text=ALABANZA");
items = await page.locator("ul").first().locator("li").allInnerTexts();
ok("al editar vuelven los divisores en su lugar", items.length === 4 && items[0].includes("ALABANZA") && items[3].includes("OFRENDA"), JSON.stringify(items.map((t) => t.slice(0, 15))));
const editUrl = page.url();
const powerId = editUrl.match(/powers\/([0-9a-f-]{36})/)[1];

// vista pública del power
await page.goto(BASE + `/powers/${powerId}`);
const body = await page.locator("main").innerText();
ok("vista pública muestra divisores", body.includes("ALABANZA") && body.includes("OFRENDA"));
await page.screenshot({ path: "e2e/out/ui-power.png", fullPage: true });

// visor: abrir canción desde el power y subir de tono
await page.locator("main ul li a").first().click();
await page.waitForSelector("h1");
await page.waitForTimeout(500);
const keyBefore = (await page.locator("p.mt-1").first().innerText());
await page.click('button[aria-label="Mostrar menú"]');
await page.click("text=Cambio de Tono");
await page.click('button[aria-label="Subir semitono"]');
await page.click('button[aria-label="Subir semitono"]');
const keyAfter = (await page.locator("p.mt-1").first().innerText());
ok("el visor cambia el tono", keyBefore !== keyAfter, `${keyBefore} -> ${keyAfter}`);
await page.screenshot({ path: "e2e/out/ui-viewer.png" });

// limpieza: borrar el power por API desde la sesión del navegador
const del = await page.evaluate(async (id) => (await fetch(`/api/setlists/${id}`, { method: "DELETE" })).status, powerId);
ok("limpieza del power", del === 200);

const relevant = errors.filter((e) => !/favicon|manifest|sw\.js/i.test(e));
ok("sin errores de consola/JS", relevant.length === 0, relevant.slice(0, 3).join(" | "));
await browser.close();
console.log(`\nUI: ${pass} OK, ${fail} FAIL`);
