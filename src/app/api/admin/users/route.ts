import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { isOwner } from "@/lib/session";
import { createUser, listUsers, normalizeUsername, validateNewUser } from "@/lib/users";

// Solo el dueño (el usuario de las variables de entorno) administra a los demás.
export async function GET() {
  if (!(await isOwner())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    return NextResponse.json({ users: await listUsers() });
  } catch (err) {
    console.error("GET /api/admin/users failed:", err);
    return NextResponse.json({ error: "No pudimos cargar los usuarios." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (typeof body.username !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "Faltan el usuario y la contraseña." }, { status: 400 });
  }

  const username = normalizeUsername(body.username);
  const problem = validateNewUser(username, body.password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (username === process.env.ADMIN_USER?.toLowerCase()) {
    return NextResponse.json({ error: "Ese nombre ya lo usa el dueño." }, { status: 409 });
  }

  try {
    const user = await createUser(username, body.password);
    if (!user) {
      return NextResponse.json({ error: "Ya existe un usuario con ese nombre." }, { status: 409 });
    }
    await logAudit({ action: "create", entity: "user", entityId: user.id, title: user.username });
    return NextResponse.json({ user });
  } catch (err) {
    console.error("POST /api/admin/users failed:", err);
    return NextResponse.json({ error: "No se pudo crear el usuario." }, { status: 500 });
  }
}
