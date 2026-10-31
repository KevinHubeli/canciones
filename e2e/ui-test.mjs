// UI (navegador): login, lista del admin, armador de powers con divisores, vista pública y visor.
import {
  BASE, PASS, USER, RUN, launchPage, loginInPage, loginOwner, main, makeSong, ok, onCleanup, pageApi, relevantErrors,
  section, shot, title, json,
} from "./lib.mjs";

await main("UI", async () => {
  const owner = await loginOwner();
  const songs = [await makeSong(owner, "ui A"), await makeSong(owner, "ui B"), await makeSong(owner, "ui C")];
  const powerTitle = title("UI TEST");
  // Por si el test se corta antes de saber el id: se busca el power por nombre al limpiar.
  onCleanup("power de la UI", async () => {
    const list = (await json(await owner.get("/api/setlists")))?.setlists ?? [];
    for (const p of list.filter((x) => x.title === powerTitle)) await owner.del(`/api/setlists/${p.id}`);
  });

  const { page, errors } = await launchPage();

  section("login y lista");
  await loginInPage(page, USER, PASS);
  ok("login por UI", true);
  await page.waitForSelector("ul li", { timeout: 15000 });
  await page.fill('input[placeholder^="Buscar"]', RUN);
  await page.waitForSelector(`li:has-text("${songs[0].title}")`, { timeout: 15000 });
  const adminCount = await page.locator("ul li", { hasText: RUN }).count();
  ok("el admin lista las canciones creadas", adminCount >= 3, `count=${adminCount}`);

  section("armador");
  await page.goto(BASE + "/admin/powers/nuevo");
  await page.fill('input[placeholder^="Nombre del power"]', powerTitle);
  await page.waitForSelector('button[aria-label="Agregar al power"]', { timeout: 15000 });
  const addSong = async (song) => {
    await page.fill('input[placeholder^="Buscar canción"]', song.title);
    await page.waitForSelector(`li:has-text("${song.title}") button[aria-label="Agregar al power"]`, { timeout: 15000 });
    await page.locator("li", { hasText: song.title }).last().locator('button[aria-label="Agregar al power"]').click();
  };
  await addSong(songs[0]);
  await addSong(songs[1]);
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
  await shot(page, "ui-builder");
  await page.click('button:has-text("Guardar power")');
  await page.waitForURL("**/admin/powers", { timeout: 15000 });
  ok("guardó y volvió a la lista", true);
  await page.waitForSelector(`text=${powerTitle}`);

  section("editar y ver");
  await page.locator("li", { hasText: powerTitle }).locator('a[aria-label="Editar"]').click();
  await page.waitForURL("**/editar");
  await page.waitForSelector("text=ALABANZA");
  items = await page.locator("ul").first().locator("li").allInnerTexts();
  ok(
    "al editar vuelven los divisores en su lugar",
    items.length === 4 && items[0].includes("ALABANZA") && items[3].includes("OFRENDA"),
    JSON.stringify(items.map((t) => t.slice(0, 15)))
  );
  const powerId = page.url().match(/powers\/([0-9a-f-]{36})/)[1];

  // vista pública del power
  await page.goto(BASE + `/powers/${powerId}`);
  const body = await page.locator("main").innerText();
  ok("vista pública muestra divisores", body.includes("ALABANZA") && body.includes("OFRENDA"));
  await shot(page, "ui-power", { fullPage: true });

  // visor: abrir canción desde el power y subir de tono
  await page.locator("main ul li a").first().click();
  await page.waitForSelector("h1");
  await page.waitForTimeout(500);
  const keyBefore = await page.locator("p.mt-1").first().innerText();
  await page.click('button[aria-label="Mostrar menú"]');
  await page.click("text=Cambio de Tono");
  await page.click('button[aria-label="Subir semitono"]');
  await page.click('button[aria-label="Subir semitono"]');
  const keyAfter = await page.locator("p.mt-1").first().innerText();
  ok("el visor cambia el tono", keyBefore !== keyAfter, `${keyBefore} -> ${keyAfter}`);
  await shot(page, "ui-viewer");

  const del = await pageApi(page, "DELETE", `/api/setlists/${powerId}`);
  ok("borrar el power desde la sesión del navegador", del.status === 200);

  const relevant = relevantErrors(errors);
  ok("sin errores de consola/JS", relevant.length === 0, relevant.slice(0, 3).join(" | "));
});
