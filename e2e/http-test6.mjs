// HTTP: límite de intentos de login (5 fallos seguidos => 429).
//
// OJO: este test tiene que correr ÚLTIMO. Los fallos se mandan con un X-Forwarded-For inventado, así
// que solo se bloquea esa IP falsa. Pero si el servidor ignorara ese encabezado (por ejemplo, detrás de
// un proxy que lo pisa), se bloquearía tu IP real por unos 10 minutos y los demás tests no podrían entrar.
import { client, json, loginOwner, main, makeUser, ok, section, username } from "./lib.mjs";

await main("HTTP6", async () => {
  const owner = await loginOwner();
  const u1 = await makeUser(owner, "limite1", "clave-limite-123", { login: false });
  const u = await makeUser(owner, "limite2", "clave-limite-123", { login: false });

  section("límite de intentos");
  // 1) (usuario 1) Un login correcto reinicia la cuenta de fallos.
  const a = client();
  for (let i = 0; i < 3; i++) await a.login(u1.username, `mala-${i}-xxxx`);
  ok("después de 3 fallos todavía deja entrar", (await a.login(u1.username, u1.password)) === 200);
  for (let i = 0; i < 3; i++) {
    const s = await a.login(u1.username, `mala-${i}-yyyy`);
    ok(`tras entrar, el fallo ${i + 1} vuelve a ser 401 (se reinició la cuenta)`, s === 401, `status ${s}`);
  }

  // 2) (usuario 2) Cinco fallos seguidos desde la misma IP => 429, incluso con la clave correcta.
  const b = client();
  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push(await b.login(u.username, `incorrecta-${i}`));
  ok("los primeros fallos dan 401", statuses.slice(0, 4).every((s) => s === 401), statuses.join(","));
  const sixth = await b.call("POST", "/api/auth/login", { username: u.username, password: u.password });
  const sixthStatus = sixth.status;
  ok("el 5º fallo da 401 o ya 429", statuses[4] === 401 || statuses[4] === 429, String(statuses[4]));
  ok("el intento siguiente (aunque sea con la clave correcta) da 429", sixthStatus === 429, `status ${sixthStatus}`);
  const body = await json(sixth);
  ok("el 429 trae un mensaje en español", typeof body?.error === "string" && body.error.length > 5, JSON.stringify(body));
  ok("el 429 no entrega cookie de sesión", !sixth.headers.get("set-cookie"));
  ok("sigue bloqueado en el intento siguiente", (await b.login(u.username, u.password)) === 429);

  // 3) El bloqueo no es global: otra IP con un usuario cualquiera sigue recibiendo 401 normal.
  const c = client();
  const other = await c.login(username("nadie"), "clave-cualquiera");
  ok("otra IP no queda bloqueada", other === 401, `status ${other}`);

  // 4) Tope por usuario: 8 fallos desde IPs distintas bloquean al usuario aunque la IP sea nueva.
  const u3 = await makeUser(owner, "limite3", "clave-limite-123", { login: false });
  const seen = [];
  for (let i = 0; i < 8; i++) seen.push(await client().login(u3.username, `incorrecta-${i}`));
  ok("8 fallos desde IPs distintas dan 401 cada uno", seen.every((s) => s === 401), seen.join(","));
  const locked = await client().login(u3.username, u3.password);
  ok("el usuario queda bloqueado aunque venga de una IP nueva (429)", locked === 429, `status ${locked}`);
});
