// UI: aviso de basura al pegar letras, copiar un power desde la lista, presentar con divisores e historial.
import {
  BASE, PASS, USER, json, launchPage, loginInPage, loginOwner, main, makePower, makeSong, ok, onCleanup, relevantErrors,
  section, shot, title,
} from "./lib.mjs";

await main("UI4", async () => {
  const owner = await loginOwner();
  const a = await makeSong(owner, "ui4 A");
  const b = await makeSong(owner, "ui4 B");
  const junkTitle = (n) => title(`ui4 basura ${n}`);
  // Por si algún guardado de prueba quedó hecho: se borra por nombre.
  onCleanup("restos de la UI", async () => {
    const songs = (await json(await owner.get(`/api/songs?q=${encodeURIComponent(title("ui4"))}&limit=50`)))?.songs ?? [];
    for (const s of songs.filter((x) => x.title.startsWith(title("ui4 basura")))) await owner.del(`/api/songs/${s.id}`);
    const powers = (await json(await owner.get("/api/setlists")))?.setlists ?? [];
    for (const p of powers.filter((x) => x.title.startsWith(title("ui4")))) await owner.del(`/api/setlists/${p.id}`);
  });

  const { page, errors } = await launchPage({ collectWarnings: true });
  await loginInPage(page, USER, PASS);
  await page.waitForSelector("ul li");

  // ---------- basura en el formulario (no guarda nada) ----------
  section("aviso de basura");
  await page.goto(BASE + "/admin/nueva");
  await page.fill("input[required]", junkTitle(1));
  const dirty = [" Diagramas de Acordes ", "Mostrar / Ocultar ", "Guitarra ", "Piano ", "", "   D", "///QUIERO LLENAR", "G", "TU TRONO DE ALABANZA"].join("\n");
  await page.fill("textarea", dirty);
  await page.waitForSelector("text=líneas que parecen de la página web");
  ok("avisa de la basura (4 líneas)", (await page.locator("text=Hay 4 líneas").count()) === 1);
  ok("lista las líneas encontradas", (await page.locator("li", { hasText: "Diagramas de Acordes" }).count()) >= 1);
  await shot(page, "junk", { fullPage: true });
  await page.click('button:has-text("Dejar así")');
  ok(
    "'Dejar así' oculta el aviso y no toca el texto",
    (await page.locator("text=líneas que parecen").count()) === 0 && (await page.inputValue("textarea")) === dirty
  );
  await page.reload();
  await page.fill("input[required]", junkTitle(2));
  await page.fill("textarea", dirty);
  await page.waitForSelector("text=Hay 4 líneas");
  await page.click('button:has-text("Quitar esas líneas")');
  const cleaned = await page.inputValue("textarea");
  ok("'Quitar' saca las líneas de menú", !/Guitarra|Piano|Diagramas|Mostrar/.test(cleaned), JSON.stringify(cleaned));
  ok("'Quitar' deja la canción", cleaned.startsWith("   D\n///QUIERO LLENAR\nG"), JSON.stringify(cleaned));
  ok("el aviso desaparece al limpiar", (await page.locator("text=líneas que parecen").count()) === 0);
  ok("una canción limpia no muestra aviso", (await page.locator("text=parece de la página").count()) === 0);

  // ---------- copiar power desde la lista ----------
  section("copiar power");
  const orig = await makePower(owner, "ui4 copiar", [a.id, b.id], {
    transpose: { [a.id]: 2 },
    dividers: [{ name: "ADORACIÓN", position: 0 }],
  });
  await page.goto(BASE + "/admin/powers");
  await page.waitForSelector(`text=${orig.title}`);
  await page.locator("li", { hasText: orig.title }).first().locator('button[aria-label^="Copiar este power"]').click();
  await page.waitForURL("**/editar", { timeout: 15000 });
  await page.waitForSelector("text=ADORACIÓN");
  const titleVal = await page.inputValue('input[placeholder^="Nombre del power"]');
  ok("al copiar se abre la copia para editarla", titleVal === `${orig.title} (copia)`, titleVal);
  ok("la copia trae el divisor y las canciones", (await page.locator("ul").first().locator("li").count()) === 3);

  // ---------- presentar con divisores ----------
  section("presentar con divisores");
  await page.goto(BASE + `/powers/${orig.id}`);
  await page.click('a:has-text("Presentar desde el principio")');
  await page.waitForSelector('button[aria-label="Empezar"]');
  ok("al presentar aparece la pantalla de la sección", (await page.locator('button[aria-label="Empezar"]').innerText()).includes("ADORACIÓN"));
  await shot(page, "section-intro");
  await page.click('button[aria-label="Empezar"]');
  ok("un toque la cierra", (await page.locator('button[aria-label="Empezar"]').count()) === 0);
  ok("el visor dice en qué sección está", (await page.locator("text=ADORACIÓN ·").count()) >= 1);
  await page.click('button[aria-label="Canción siguiente del power"]');
  await page.waitForURL(/i=1/);
  ok("al pasar a la siguiente (sin divisor ahí) no hay pantalla", (await page.locator('button[aria-label="Empezar"]').count()) === 0);

  // ---------- historial (pantalla) ----------
  section("historial");
  await page.goto(BASE + "/admin/historial");
  await page.waitForSelector("text=Historial");
  ok("la pantalla del historial lista cambios", (await page.locator("main ul li").count()) > 0);
  await shot(page, "history");
  await page.goto(BASE + "/admin");
  await page.waitForSelector("ul li");
  ok("el admin tiene el chip Historial", (await page.locator('a:has-text("Historial")').count()) > 0);

  const relevant = relevantErrors(errors, /DevTools/);
  ok("sin errores ni warnings", relevant.length === 0, relevant.slice(0, 3).join(" | "));
});
