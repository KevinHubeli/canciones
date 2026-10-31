// UI pública: tema claro/oscuro, búsqueda, tamaño de letra, "Recientes" y hidratación sin errores.
import { BASE, RUN, launchPage, loginOwner, main, makeSong, ok, relevantErrors, section } from "./lib.mjs";

await main("UI2", async () => {
  const owner = await loginOwner();
  const a = await makeSong(owner, "pub A Aleluya");
  const b = await makeSong(owner, "pub B Aleluya");

  const { page, errors } = await launchPage({ collectWarnings: true });

  section("tema");
  await page.goto(BASE + "/canciones");
  await page.waitForSelector("ul li a");
  const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  await page.locator('button[aria-label^="Cambiar a modo"]').first().click();
  const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  ok("el tema cambia", after && after !== before, `${before} -> ${after}`);
  await page.reload();
  await page.waitForSelector("ul li a");
  ok("el tema se recuerda", (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === after);

  section("búsqueda");
  // la última palabra gana: se escribe rápido una cosa y enseguida otra
  const input = page.locator('input[placeholder^="Buscar"]');
  await input.fill("a");
  await input.fill(`${RUN} Aleluya`);
  await page.waitForSelector(`ul li a:has-text("${a.title}")`, { timeout: 15000 });
  const titles = await page.locator("ul li a").allInnerTexts();
  ok("la búsqueda muestra las canciones de la última palabra", titles.some((t) => t.includes(a.title)) && titles.some((t) => t.includes(b.title)), JSON.stringify(titles.slice(0, 4)));
  await input.fill(`${RUN} zzzzzz-no-existe-zzzz`);
  await page.waitForTimeout(1500);
  ok("una búsqueda sin resultados no deja la lista vieja", !(await page.locator("ul li a", { hasText: a.title }).count()));

  section("visor");
  await input.fill(a.title);
  await page.waitForSelector(`ul li a:has-text("${a.title}")`, { timeout: 15000 });
  await page.locator("ul li a", { hasText: a.title }).first().click();
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

  const relevant = relevantErrors(errors, /DevTools/);
  ok("sin errores ni warnings (hidratación incluida)", relevant.length === 0, relevant.slice(0, 3).join(" | "));
});
