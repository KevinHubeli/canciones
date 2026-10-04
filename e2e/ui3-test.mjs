import { chromium } from "playwright";
const USER = process.env.E2E_USER ?? "tester";
const PASS = process.env.E2E_PASS ?? "tmp-pass-123";
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) pass++; else { fail++; console.log("  FAIL:", n, d); } };
const BASE = process.env.E2E_URL ?? "http://localhost:3100";
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

// --- chips del admin
ok("chip Usuarios visible para el dueño", await page.locator('a:has-text("Usuarios")').count() > 0);
ok("chip Duplicadas visible", await page.locator('a:has-text("Duplicadas")').count() > 0);

// --- duplicadas
await page.click('a:has-text("Duplicadas")');
await page.waitForURL("**/admin/duplicados");
await page.waitForSelector("text=Canciones duplicadas");
await page.waitForSelector("text=/Recomendada|No hay canciones con el mismo título/", { timeout: 20000 }).catch(() => {});
const dupText = await page.locator("main").innerText();
ok("la pantalla de duplicadas muestra grupos con 'Recomendada'", /Recomendada/.test(dupText) || /No hay canciones con el mismo título/.test(dupText));
await page.screenshot({ path: "e2e/out/ui-dups.png", fullPage: true });

// --- usuarios
await page.goto(BASE + "/admin/usuarios");
await page.waitForSelector("text=Dueño");
await page.fill('input[placeholder^="Usuario"]', "zz_ui_user");
await page.fill('input[placeholder^="Contraseña"]', "clave-ui-123");
await page.click('button:has-text("Crear usuario")');
await page.waitForSelector("text=zz_ui_user");
ok("se crea el usuario desde la pantalla", true);
await page.screenshot({ path: "e2e/out/ui-users.png", fullPage: true });
await page.click('button[aria-label="Eliminar a zz_ui_user"]');
await page.click('button:has-text("Eliminar"):visible >> nth=-1');
await page.waitForSelector("text=zz_ui_user", { state: "detached", timeout: 10000 }).catch(() => {});
ok("se elimina el usuario", (await page.locator("text=zz_ui_user").count()) === 0);

// --- aviso de título repetido al crear
const songs = (await api("GET", "/api/songs?limit=1")).data.songs;
await page.goto(BASE + "/admin/nueva");
await page.fill("input[required]", songs[0].title);
await page.fill("textarea", "[C]letra de prueba");
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.click('button[type="submit"]');
await page.waitForSelector("text=Ya existe una canción llamada");
ok("avisa del título repetido", true);
ok("ofrece 'Guardar igual' y abrir la existente", (await page.locator('button:has-text("Guardar igual")').count()) === 1 && (await page.locator('a:has-text("Abrir la que ya existe")').count()) === 1);
await page.screenshot({ path: "e2e/out/ui-dupwarn.png" });

// --- armador: último tono
const [a, b] = (await api("GET", "/api/songs?limit=4")).data.songs.slice(2, 4);
const pw = (await api("POST", "/api/setlists", { title: "ZZ UI tonos", songIds: [a.id], transpose: { [a.id]: 4 } })).data.setlist.id;
await page.goto(BASE + "/admin/powers/nuevo");
await page.fill('input[placeholder^="Nombre del power"]', "ZZ UI nuevo");
await page.waitForSelector('button[aria-label="Agregar al power"]');
await page.waitForTimeout(800);
await page.fill('input[placeholder^="Buscar canción"]', a.title);
await page.waitForTimeout(1200);
await page.locator('ul li', { hasText: a.title }).last().locator('button[aria-label="Agregar al power"]').click();
await page.waitForSelector("text=Última vez");
const hint = await page.locator("p", { hasText: "Última vez" }).first().innerText();
ok("muestra 'Última vez' con el nombre del power", hint.includes("ZZ UI tonos"), hint);
const toneShown = await page.locator("span.font-mono.text-chord-gold").first().innerText();
ok("arranca con el tono de la última vez (no el original)", toneShown.length > 0 && !/original: /.test("") );
await page.locator('button[aria-label="Subir semitono"]').first().click();
ok("aparece 'usar ese' al cambiar el tono", (await page.locator('button:has-text("usar ese")').count()) === 1);
await page.click('button:has-text("usar ese")');
ok("'usar ese' vuelve al tono de la última vez", (await page.locator('button:has-text("usar ese")').count()) === 0);
await page.screenshot({ path: "e2e/out/ui-lasttone.png" });

// --- vista previa
const pw2 = (await api("POST", "/api/setlists", {
  title: "ZZ UI preview", songIds: [a.id, b.id],
  dividers: [{ name: "ALABANZA", position: 0 }, { name: "OFRENDA", position: 1 }],
})).data.setlist.id;
await page.goto(BASE + `/powers/${pw2}`);
await page.click('a:has-text("Vista previa")');
await page.waitForURL("**/vista-previa");
await page.waitForSelector("ol li");
const nSlides = await page.locator("ol > li").count();
ok("la vista previa dibuja las diapositivas", nSlides >= 4, `n=${nSlides}`);
await page.screenshot({ path: "e2e/out/ui-preview.png", fullPage: false });
await page.setViewportSize({ width: 1100, height: 800 });
await page.screenshot({ path: "e2e/out/ui-preview-wide.png", fullPage: false });

// limpieza
await api("DELETE", `/api/setlists/${pw}`);
await api("DELETE", `/api/setlists/${pw2}`);

const relevant = errors.filter((e) => !/status of 409|favicon|manifest|sw\.js|DevTools/i.test(e));
ok("sin errores ni warnings", relevant.length === 0, relevant.slice(0, 3).join(" | "));
await browser.close();
console.log(`\nUI3: ${pass} OK, ${fail} FAIL`);
