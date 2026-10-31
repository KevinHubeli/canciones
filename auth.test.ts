import { createHmac } from "node:crypto";
import {
  constantTimeEqual,
  createSessionToken,
  credentialFingerprint,
  readSessionToken,
  resolveOwnerSession,
  resolveSecret,
  verifySessionToken,
} from "./src/lib/session";
import { validatePassword, validateNewUser, weakPasswordReason } from "./src/lib/users";
import {
  createLoginLimiter,
  createMemoryStore,
  ipFromHeaders,
  withFallback,
  type AttemptStore,
} from "./src/lib/rateLimit";

let failures = 0;
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failures++;
    console.log(`  FAIL: ${name}${detail ? " — " + detail : ""}`);
  }
}

const SECRET = "un-secreto-de-prueba-bastante-largo-1234567890";
process.env.SESSION_SECRET = SECRET;

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decodePayload = (token: string) =>
  Buffer.from(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();

async function main() {
  // ---- SESSION_SECRET ----
  {
    let msg = "";
    try {
      resolveSecret({ NODE_ENV: "production", SESSION_SECRET: "corto" });
    } catch (e) {
      msg = (e as Error).message;
    }
    check("secreto corto en producción falla con mensaje claro", msg.includes("32"), msg);
    check("secreto largo en producción ok", resolveSecret({ NODE_ENV: "production", SESSION_SECRET: SECRET }) === SECRET);
    check("secreto corto en desarrollo ok", resolveSecret({ NODE_ENV: "development", SESSION_SECRET: "corto" }) === "corto");
    let missing = false;
    try {
      resolveSecret({ NODE_ENV: "development" });
    } catch {
      missing = true;
    }
    check("sin secreto falla", missing);
  }

  // ---- constantTimeEqual ----
  check("constantTimeEqual iguales", constantTimeEqual("abc", "abc"));
  check("constantTimeEqual distintos", !constantTimeEqual("abc", "abd"));
  check("constantTimeEqual largos distintos", !constantTimeEqual("abc", "abcd"));

  // ---- tokens: usuario de la base ----
  const user = { kind: "user" as const, username: "ana", uid: "11111111-1111-1111-1111-111111111111", passwordHash: "scrypt:aa:bb" };
  const now = 1_700_000_000_000;
  const DAY30 = 30 * 24 * 3600 * 1000;
  const token = await createSessionToken(user, { now });
  {
    const p = await readSessionToken(token, { now });
    check("token nuevo se lee", p !== null && p.k === "user" && p.u === "ana" && p.uid === user.uid);
    check("token nuevo no contiene el hash", !decodePayload(token).includes("scrypt"));
    check("verifySessionToken ok", await verifySessionToken(token, { now }));
    check("vigente justo antes de vencer", await verifySessionToken(token, { now: now + DAY30 }));
    check("vencido", !(await verifySessionToken(token, { now: now + DAY30 + 1 })));
    check("null/undefined/vacío", !(await verifySessionToken(null)) && !(await verifySessionToken(undefined)) && !(await verifySessionToken("")));
    check("basura", !(await verifySessionToken("xxx")) && !(await verifySessionToken("a.b.c")) && !(await verifySessionToken("!!.@@")));
  }
  {
    // adulterado: cambia el usuario conservando la firma
    const [payloadB64, sig] = token.split(".");
    const payload = JSON.parse(decodePayload(token));
    payload.u = "admin";
    const forged = `${b64url(JSON.stringify(payload))}.${sig}`;
    check("payload adulterado se rechaza", !(await verifySessionToken(forged, { now })));
    check("firma adulterada se rechaza", !(await verifySessionToken(`${payloadB64}.${sig.slice(0, -2)}AA`, { now })));
    const other = createHmac("sha256", "otro-secreto").update(payloadB64).digest();
    check("firma de otro secreto se rechaza", !(await verifySessionToken(`${payloadB64}.${b64url(other)}`, { now })));
  }

  // ---- formato viejo ----
  {
    const old = b64url(JSON.stringify({ u: "ana", exp: now + 1000 }));
    const sig = b64url(createHmac("sha256", SECRET).update(old).digest());
    const oldToken = `${old}.${sig}`;
    check("token viejo (solo nombre) con firma válida se rechaza", !(await verifySessionToken(oldToken, { now })));
    check("token viejo no tira error", (await readSessionToken(oldToken, { now })) === null);
    const noUid = b64url(JSON.stringify({ v: 2, k: "user", u: "ana", fp: "x", exp: now + 1000 }));
    const sig2 = b64url(createHmac("sha256", SECRET).update(noUid).digest());
    check("token de usuario sin uid se rechaza", !(await verifySessionToken(`${noUid}.${sig2}`, { now })));
  }

  // ---- huellas ----
  {
    const fp1 = await credentialFingerprint("user", "scrypt:aa:bb");
    const fp2 = await credentialFingerprint("user", "scrypt:aa:cc");
    const fpOwner = await credentialFingerprint("owner", "scrypt:aa:bb");
    check("huella estable", fp1 === (await credentialFingerprint("user", "scrypt:aa:bb")));
    check("huella cambia con la contraseña", fp1 !== fp2);
    check("huella distinta para dueño y usuario", fp1 !== fpOwner);
    check("huella corta", fp1.length === 16);
    const p = await readSessionToken(token, { now });
    check("el token lleva la huella del hash", p?.fp === fp1);
    const tokenNewPw = await createSessionToken({ ...user, passwordHash: "scrypt:aa:cc" }, { now });
    check("cambiar la contraseña cambia la huella del token", (await readSessionToken(tokenNewPw, { now }))?.fp === fp2);
  }

  // ---- sesión del dueño ----
  {
    const env = { ADMIN_USER: "Kevin", ADMIN_PASSWORD: "secreta-del-dueno" };
    const t = await createSessionToken({ kind: "owner", username: "Kevin", password: env.ADMIN_PASSWORD }, { now });
    const p = (await readSessionToken(t, { now }))!;
    check("token de dueño sin uid", p.k === "owner" && p.uid === undefined);
    check("token de dueño no tiene la contraseña en claro", !decodePayload(t).includes("secreta"));
    const s = await resolveOwnerSession(p, env);
    check("dueño con env correcto", s?.kind === "owner" && s.username === "Kevin");
    check("dueño: cambió ADMIN_PASSWORD => rechazado", (await resolveOwnerSession(p, { ...env, ADMIN_PASSWORD: "nueva" })) === null);
    check("dueño: cambió ADMIN_USER => rechazado", (await resolveOwnerSession(p, { ...env, ADMIN_USER: "otro" })) === null);
    check("dueño: sin env => rechazado", (await resolveOwnerSession(p, {})) === null);
    const userPayload = (await readSessionToken(token, { now }))!;
    check("un token de usuario no sirve como dueño", (await resolveOwnerSession(userPayload, { ADMIN_USER: "ana", ADMIN_PASSWORD: "scrypt:aa:bb" })) === null);
  }

  // ---- reglas de contraseña ----
  {
    check("corta", validatePassword("abc123") !== null);
    check("123456 prohibida", validatePassword("123456") !== null);
    check("12345678 prohibida", validatePassword("12345678") !== null);
    check("password prohibida", validatePassword("password") !== null);
    check("Password (mayúscula) prohibida", validatePassword("Password") !== null);
    check("qwerty123 prohibida", validatePassword("qwerty123") !== null);
    check("secuencia 23456789 prohibida", validatePassword("23456789") !== null);
    check("secuencia abcdefgh prohibida", validatePassword("abcdefgh") !== null);
    check("repetida aaaaaaaa prohibida", validatePassword("aaaaaaaa") !== null);
    check("igual al usuario prohibida", validatePassword("maria2024", "maria2024") !== null);
    check("usuario + número prohibida", validatePassword("maria123", "maria") !== null);
    check("muy larga prohibida", validatePassword("a1".repeat(100)) !== null);
    check("frase razonable ok", validatePassword("Cantamos al Señor 2026") === null);
    check("ocho caracteres no obvios ok", validatePassword("t7!kPq2z") === null);
    check("weakPasswordReason ok devuelve null", weakPasswordReason("t7!kPq2z", "ana") === null);
    check("validateNewUser usa la regla nueva", validateNewUser("ana", "123456") !== null && validateNewUser("ana", "t7!kPq2z") === null);
    check("validateNewUser valida el usuario", validateNewUser("a", "t7!kPq2z") !== null);
  }

  // ---- IP del cliente ----
  {
    const h = (o: Record<string, string>) => (n: string) => o[n] ?? null;
    check("Vercel: x-vercel-forwarded-for", ipFromHeaders(h({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "9.9.9.9", "x-real-ip": "8.8.8.8" }), true) === "1.1.1.1");
    check("Vercel: x-real-ip", ipFromHeaders(h({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "9.9.9.9" }), true) === "2.2.2.2");
    check("fuera de Vercel: último hop de x-forwarded-for", ipFromHeaders(h({ "x-forwarded-for": "6.6.6.6, 3.3.3.3, 4.4.4.4", "x-real-ip": "8.8.8.8" }), false) === "4.4.4.4");
    check("fuera de Vercel: no confía en x-vercel-forwarded-for", ipFromHeaders(h({ "x-vercel-forwarded-for": "1.1.1.1", "x-real-ip": "8.8.8.8" }), false) === "8.8.8.8");
    check("sin headers => unknown", ipFromHeaders(h({}), true) === "unknown" && ipFromHeaders(h({}), false) === "unknown");
    check("header gigante se ignora", ipFromHeaders(h({ "x-forwarded-for": "x".repeat(200) }), false) === "unknown");
  }

  // ---- rate limit con almacén falso ----
  {
    const t0 = 1_000_000;
    let t = t0;
    const store = createMemoryStore();
    const limiter = createLoginLimiter(store, { now: () => t, random: () => 1 });

    for (let i = 0; i < 4; i++) {
      await limiter.registerFailure("1.1.1.1", "ana");
      t += 1000;
    }
    check("4 fallos de IP: no bloquea", !(await limiter.check("1.1.1.1", "ana")).limited);
    await limiter.registerFailure("1.1.1.1", "ana"); // quinto fallo en t0 + 4000
    const c = await limiter.check("1.1.1.1", "otro");
    check("5 fallos de IP: bloquea", c.limited);
    check("otra IP no está bloqueada", !(await limiter.check("2.2.2.2", "otro")).limited);
    check("retry-after positivo y dentro de la ventana", c.retryAfterSeconds > 0 && c.retryAfterSeconds <= 600, String(c.retryAfterSeconds));

    // El primer fallo (t0) vence en t0 + 10 min.
    t = t0 + 10 * 60 * 1000 - 1;
    check("antes de vencer el primero sigue bloqueado", (await limiter.check("1.1.1.1", null)).limited);
    t += 1;
    check("vencido el primero, se levanta", !(await limiter.check("1.1.1.1", null)).limited);

    // login bien limpia
    await limiter.clear("1.1.1.1", "ana");
    check("clear deja la IP libre", (await store.recent("ip:1.1.1.1", 0)).length === 0);
    check("clear deja el usuario libre", (await store.recent("user:ana", 0)).length === 0);
  }
  {
    // tope por usuario (8), desde IPs distintas; las mayúsculas no cambian la clave
    let t = 5_000_000;
    const limiter = createLoginLimiter(createMemoryStore(), { now: () => t, random: () => 1 });
    for (let i = 0; i < 8; i++) {
      await limiter.registerFailure(`10.0.0.${i}`, i % 2 ? "ANA" : "ana");
      t += 10;
    }
    check("8 fallos del usuario desde IPs distintas: bloquea", (await limiter.check("10.9.9.9", "Ana")).limited);
    check("otro usuario no", !(await limiter.check("10.9.9.9", "beto")).limited);
    check("sin usuario y con IP limpia no limita", !(await limiter.check("10.9.9.9", null)).limited);
    check("solo por usuario (ip null) funciona", (await limiter.check(null, "ana")).limited);
  }
  {
    // limpieza oportunista
    let t = 9_000_000;
    const store = createMemoryStore();
    const limiter = createLoginLimiter(store, { now: () => t, random: () => 0 });
    await limiter.registerFailure("3.3.3.3", "x");
    t += 11 * 60 * 1000;
    await limiter.registerFailure("4.4.4.4", "y"); // random = 0 => limpia
    check("prune borra lo viejo", (await store.recent("ip:3.3.3.3", 0)).length === 0);
    check("prune conserva lo nuevo", (await store.recent("ip:4.4.4.4", 0)).length === 1);
  }
  {
    // si la base falla, cae a memoria y no deja pasar
    const boom = async (): Promise<never> => {
      throw new Error("db caída");
    };
    const broken: AttemptStore = { recent: boom, add: boom, clear: boom, prune: boom };
    const origError = console.error;
    let logged = 0;
    console.error = () => {
      logged++;
    };
    try {
      let t = 1;
      const limiter = createLoginLimiter(withFallback(broken, createMemoryStore()), { now: () => t, random: () => 1 });
      check("base caída: al principio no limita", !(await limiter.check("5.5.5.5", "z")).limited);
      for (let i = 0; i < 5; i++) {
        await limiter.registerFailure("5.5.5.5", "z");
        t += 1;
      }
      check("base caída: igual frena con la memoria", (await limiter.check("5.5.5.5", "z")).limited);
      await limiter.clear("5.5.5.5", "z");
      check("base caída: clear limpia la memoria", !(await limiter.check("5.5.5.5", "z")).limited);
      check("base caída: se loguea", logged > 0);
    } finally {
      console.error = origError;
    }
  }

  console.log(`RESULTADO: ${passed} OK, ${failures} FAIL`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
