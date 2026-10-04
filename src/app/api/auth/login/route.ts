import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/session";
import { clearAttempts, clientIp, isRateLimited, registerFailedAttempt } from "@/lib/rateLimit";

// Comparación en tiempo constante (se comparan los hashes, que tienen siempre el mismo largo).
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Probá de nuevo en unos minutos." },
      { status: 429 }
    );
  }

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
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    // Se evalúan las dos para no revelar cuál estaba mal por el tiempo de respuesta.
    !(safeEqual(username.trim(), adminUser) && safeEqual(password, adminPassword))
  ) {
    registerFailedAttempt(ip);
    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos." },
      { status: 401 }
    );
  }

  clearAttempts(ip);
  const token = await createSessionToken(adminUser);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}
