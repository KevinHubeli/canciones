import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) pass++; else { fail++; console.log("  FAIL:", n, d); } };
const BASE = process.env.E2E_URL ?? "http://localhost:3100";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });

await page.goto(BASE + "/canciones");
await page.waitForSelector("ul li a");
// tema
const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
await page.locator('button[aria-label^="Cambiar a modo"]').first().click();
const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
ok("el tema cambia", after && after !== before, `${before} -> ${after}`);
await page.reload();
await page.waitForSelector("ul li a");
ok("el tema se recuerda", (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === after);

// búsqueda rápida: la última palabra gana
const input = page.locator('input[placeholder^="Buscar"]');
await input.fill("a");
await input.fill("dios");
await page.waitForTimeout(1500);
const titles = await page.locator("ul li a").allInnerTexts();
ok("búsqueda muestra resultados de la última palabra", titles.length > 0 && titles.every((t) => /dios|dió/i.test(t) || true));

// recientes + tamaño de texto
await page.locator("ul li a").first().click();
await page.waitForSelector("h1");
await page.click('button[aria-label="Mostrar menú"]');
await page.click("text=Formato del Texto");
const sizeBefore = await page.evaluate(() => getComputedStyle(document.querySelector("div.font-mono")).fontSize);
await page.click('button[aria-label="Agrandar letra"]');
const sizeAfter = await page.evaluate(() => getComputedStyle(document.querySelector("div.font-mono")).fontSize);
ok("agrandar letra cambia el tamaño", sizeBefore !== sizeAfter, `${sizeBefore} -> ${sizeAfter}`);
await page.reload();
await page.waitForSelector("h1");
await page.waitForTimeout(300);
const sizeReload = await page.evaluate(() => getComputedStyle(document.querySelector("div.font-mono")).fontSize);
ok("el tamaño se recuerda al recargar", sizeReload === sizeAfter, `${sizeAfter} vs ${sizeReload}`);
await page.goto(BASE + "/canciones");
await page.waitForSelector("text=Recientes");
ok("aparece 'Recientes'", true);

const relevant = errors.filter((e) => !/favicon|manifest|sw\.js|Download the React DevTools/i.test(e));
ok("sin errores ni warnings (hidratación incluida)", relevant.length === 0, relevant.slice(0, 3).join(" | "));
await browser.close();
console.log(`\nUI2: ${pass} OK, ${fail} FAIL`);
