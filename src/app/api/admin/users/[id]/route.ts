import { UUID_RE } from "@/lib/validation";
import { NextRequest, NextResponse } from "next/server";
import { isOwner } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { deleteUser, getUserById, setUserPassword, validatePassword } from "@/lib/users";


// El dueño resetea la contraseña de otro usuario. Las sesiones abiertas de ese
// usuario se cierran solas: el token lleva la huella de la contraseña anterior.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "No encontramos ese usuario." }, { status: 404 });
  }

  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (typeof body.password !== "string") {
    return NextResponse.json({ error: "Falta la contraseña nueva." }, { status: 400 });
  }

  try {
    const user = await getUserById(id);
    if (!user) {
      return NextResponse.json({ error: "No encontramos ese usuario." }, { status: 404 });
    }
    const problem = validatePassword(body.password, user.username);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const updated = await setUserPassword(id, body.password);
    if (!updated) {
      return NextResponse.json({ error: "No encontramos ese usuario." }, { status: 404 });
    }
    await logAudit({
      action: "update",
      entity: "user",
      entityId: id,
      title: `${updated.username} (nueva contraseña)`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PUT /api/admin/users/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo cambiar la contraseña." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "No encontramos ese usuario." }, { status: 404 });
  }
  try {
    const deletedName = await deleteUser(id);
    if (!deletedName) {
      return NextResponse.json({ error: "No encontramos ese usuario." }, { status: 404 });
    }
    await logAudit({ action: "delete", entity: "user", entityId: id, title: deletedName });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/users/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo eliminar el usuario." }, { status: 500 });
  }
}
