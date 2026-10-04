import { NextResponse } from "next/server";
import { isOwner } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { deleteUser } from "@/lib/users";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
