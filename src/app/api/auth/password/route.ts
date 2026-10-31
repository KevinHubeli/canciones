import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import {
  SESSION_COOKIE,
  createSessionToken,
  getAuthenticatedSession,
  sessionCookieOptions,
} from "@/lib/session";
import { checkPassword, getUserById, setUserPassword, validatePassword } from "@/lib/users";
import { getLoginLimiter } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (session.kind === "owner" || !session.uid) {
    return NextResponse.json(
      {
        error:
          "Tu contraseña de dueño no se cambia desde acá: se cambia en Vercel, en la variable ADMIN_PASSWORD (Settings, Environment Variables), y después hay que volver a desplegar. Al cambiarla se cierran todas las sesiones.",
      },
      { status: 400 }
    );
  }

  let body: { current?: unknown; next?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (typeof body.current !== "string" || typeof body.next !== "string") {
    return NextResponse.json({ error: "Faltan la contraseña actual y la nueva." }, { status: 400 });
  }

  // Cada cambio pide la contraseña actual: los intentos fallidos cuentan para el mismo
  // tope por usuario que el login (sin IP), así una sesión robada no sirve para adivinarla.
  const limiter = getLoginLimiter();
  const limit = await limiter.check(null, session.username);
  if (limit.limited) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60);
    return NextResponse.json(
      {
        error: `Demasiados intentos fallidos. Esperá ${minutes === 1 ? "1 minuto" : `${minutes} minutos`} antes de probar de nuevo.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const user = await getUserById(session.uid);
    if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

    if (!(await checkPassword(body.current, user.passwordHash))) {
      await limiter.registerFailure(null, session.username);
      return NextResponse.json({ error: "La contraseña actual no es correcta." }, { status: 400 });
    }

    const problem = validatePassword(body.next, user.username);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    if (body.next === body.current) {
      return NextResponse.json(
        { error: "La contraseña nueva tiene que ser distinta de la actual." },
        { status: 400 }
      );
    }

    const updated = await setUserPassword(user.id, body.next);
    if (!updated) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    await logAudit({
      action: "update",
      entity: "user",
      entityId: updated.id,
      title: `${updated.username} (cambió su contraseña)`,
    });

    // El cambio invalida todas las sesiones anteriores, incluida esta: se emite una nueva
    // para que quien la cambió siga adentro (las demás sesiones abiertas se cierran).
    const token = await createSessionToken({
      kind: "user",
      username: updated.username,
      uid: updated.id,
      passwordHash: updated.passwordHash,
    });
    await limiter.clear(null, session.username).catch(() => undefined);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return response;
  } catch (err) {
    console.error("POST /api/auth/password failed:", err);
    return NextResponse.json({ error: "No se pudo cambiar la contraseña." }, { status: 500 });
  }
}
