import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  type SessionSubject,
} from "@/lib/session";
import { normalizeUsername, verifyUser } from "@/lib/users";
import { clientIp, getLoginLimiter } from "@/lib/rateLimit";

// Comparación en tiempo constante (se comparan los hashes, que tienen siempre el mismo largo).
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * El dueño (variables de entorno) o un usuario de la base. Siempre se evalúan
 * los dos caminos, para que el tiempo de respuesta no delate cuál existe.
 */
async function authenticate(
  username: string,
  password: string,
  adminUser: string,
  adminPassword: string
): Promise<SessionSubject | null> {
  const ownerOk = safeEqual(username, adminUser) && safeEqual(password, adminPassword);
  // Si la base no responde, el dueño igual tiene que poder entrar (y los demás no).
  const user = await verifyUser(username, password).catch((err) => {
    console.error("No se pudo verificar al usuario en la base:", err);
    return null;
  });
  if (ownerOk) return { kind: "owner", username: adminUser, password: adminPassword };
  if (user) {
    return { kind: "user", username: user.username, uid: user.id, passwordHash: user.passwordHash };
  }
  return null;
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);

  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const adminUser = process.env.ADMIN_USER;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminUser || !adminPassword) {
    console.error("Faltan ADMIN_USER o ADMIN_PASSWORD en las variables de entorno.");
    return NextResponse.json(
      { error: "El acceso de admin no está configurado." },
      { status: 500 }
    );
  }

  const { username, password } = body;
  const typedUser = typeof username === "string" ? username.trim() : "";
  // El tope por usuario cuenta lo que se tipeó, exista o no ese usuario: no revela cuáles hay.
  const limitUser = typedUser ? normalizeUsername(typedUser) : null;

  const limiter = getLoginLimiter();
  const limit = await limiter.check(ip, limitUser);
  if (limit.limited) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60);
    return NextResponse.json(
      {
        error: `Demasiados intentos fallidos. Esperá ${minutes === 1 ? "1 minuto" : `${minutes} minutos`} antes de probar de nuevo.`,
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const subject =
    typeof username === "string" && typeof password === "string"
      ? await authenticate(typedUser, password, adminUser, adminPassword)
      : null;

  if (!subject) {
    await limiter.registerFailure(ip, limitUser);
    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos." },
      { status: 401 }
    );
  }

  await limiter.clear(ip, limitUser).catch((err) => {
    console.error("No se pudieron limpiar los intentos de login:", err);
  });
  const token = await createSessionToken(subject);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}
