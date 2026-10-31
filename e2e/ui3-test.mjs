// UI: duplicadas, pantalla de usuarios, aviso de título repetido, último tono en el armador y vista previa.
import {
  BASE, PASS, USER, json, launchPage, loginInPage, loginOwner, main, makePower, makeSong, ok, onCleanup,
  relevantErrors, section, shot, title, username,
} from "./lib.mjs";

await main("UI3", async () => {
  const owner = await loginOwner();
  const a = await makeSong(owner, "ui3 A");
  const b = await makeSong(owner, "ui3 B");
  await makeSong(owner, "ui3 A"); // mismo título que A (force) => grupo de duplicadas

  const uiUser = username("uiuser");
  onCleanup("usuario creado desde la UI", async () => {
    const users = (await json(await owner.get("/api/admin/users")))?.users ?? [];
    for (const u of users.filter((x) => x.username === uiUser)) await owner.del(`/api/admin/users/${u.id}`);
  });

  const { page, errors } = await launchPage();
  await loginInPage(page, USER, PASS);
  await page.waitForSelector("ul li");

  section("chips del admin");
  ok("chip Usuarios visible para el dueño", (await page.locator('a:has-text("Usuarios")').count()) > 0);
  ok("chip Duplicadas visible", (await page.locator('a:has-text("Duplicadas")').count()) > 0);

  section("duplicadas");
  await page.click('a:has-text("Duplicadas")');
  await page.waitForURL("**/admin/duplicados");
  await page.waitForSelector("text=Canciones duplicadas");
  await page.waitForSelector("text=/Recomendada/", { timeout: 20000 }).catch(() => {});
  const dupText = await page.locator("main").innerText();
  ok("la pantalla muestra nuestro grupo con 'Recomendada'", /Recomendada/.test(dupText) && dupText.includes(a.title), dupText.slice(0, 200));
  await shot(page, "ui-dups", { fullPage: true });

  section("usuarios");
  await page.goto(BASE + "/admin/usuarios");
  await page.waitForSelector("text=Dueño");
  await page.fill('input[placeholder^="Usuario"]', uiUser);
  await page.fill('input[placeholder^="Contraseña"]', "clave-ui-123");
  await page.click('button:has-text("Crear usuario")');
  await page.waitForSelector(`text=${uiUser}`);
  ok("se crea el usuario desde la pantalla", true);
  await shot(page, "ui-users", { fullPage: true });
  await page.click(`button[aria-label="Eliminar a ${uiUser}"]`);
  await page.click('button:has-text("Eliminar"):visible >> nth=-1');
  await page.waitForSelector(`text=${uiUser}`, { state: "detached", timeout: 10000 }).catch(() => {});
  ok("se elimina el usuario", (await page.locator(`text=${uiUser}`).count()) === 0);

  section("aviso de título repetido");
  await page.goto(BASE + "/admin/nueva");
  await page.fill("input[required]", b.title);
  await page.fill("textarea", "[C]letra de prueba");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=Ya existe una canción llamada");
  ok("avisa del título repetido", true);
  ok(
    "ofrece 'Guardar igual' y abrir la existente",
    (await page.locator('button:has-text("Guardar igual")').count()) === 1 &&
      (await page.locator('a:has-text("Abrir la que ya existe")').count()) === 1
  );
  await shot(page, "ui-dupwarn");

  section("armador: último tono");
  const past = await makePower(owner, "ui3 tonos", [a.id], { transpose: { [a.id]: 4 } });
  await page.goto(BASE + "/admin/powers/nuevo");
  await page.fill('input[placeholder^="Nombre del power"]', title("ui3 nuevo"));
  await page.waitForSelector('button[aria-label="Agregar al power"]');
  await page.waitForTimeout(800);
  await page.fill('input[placeholder^="Buscar canción"]', a.title);
  await page.waitForSelector(`li:has-text("${a.title}") button[aria-label="Agregar al power"]`, { timeout: 15000 });
  await page.locator("li", { hasText: a.title }).last().locator('button[aria-label="Agregar al power"]').click();
  await page.waitForSelector("text=Última vez");
  const hint = await page.locator("p", { hasText: "Última vez" }).first().innerText();
  ok("muestra 'Última vez' con el nombre del power", hint.includes(past.title), hint);
  await page.locator('button[aria-label="Subir semitono"]').first().click();
  ok("aparece 'usar ese' al cambiar el tono", (await page.locator('button:has-text("usar ese")').count()) === 1);
  await page.click('button:has-text("usar ese")');
  ok("'usar ese' vuelve al tono de la última vez", (await page.locator('button:has-text("usar ese")').count()) === 0);
  await shot(page, "ui-lasttone");

  section("vista previa");
  const preview = await makePower(owner, "ui3 preview", [a.id, b.id], {
    dividers: [{ name: "ALABANZA", position: 0 }, { name: "OFRENDA", position: 1 }],
  });
  await page.goto(BASE + `/powers/${preview.id}`);
  await page.click('a:has-text("Vista previa")');
  await page.waitForURL("**/vista-previa");
  await page.waitForSelector("ol li");
  const nSlides = await page.locator("ol > li").count();
  ok("la vista previa dibuja las diapositivas", nSlides >= 4, `n=${nSlides}`);
  await shot(page, "ui-preview");
  await page.setViewportSize({ width: 1100, height: 800 });
  await shot(page, "ui-preview-wide");

  const relevant = relevantErrors(errors);
  ok("sin errores ni warnings", relevant.length === 0, relevant.slice(0, 3).join(" | "));
});
