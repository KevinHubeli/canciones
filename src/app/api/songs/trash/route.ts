import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { emptyTrash, listTrash } from "@/lib/songs";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    return NextResponse.json({ songs: await listTrash() });
  } catch (err) {
    console.error("GET /api/songs/trash failed:", err);
    return NextResponse.json({ error: "No pudimos cargar la papelera." }, { status: 500 });
  }
}

/** Vacía la papelera: borra de verdad todas las canciones que hay en ella. */
export async function DELETE() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const purged = await emptyTrash();
    if (purged > 0) {
      await logAudit({
        action: "purge",
        entity: "song",
        title: purged === 1 ? "1 canción de la papelera" : `${purged} canciones de la papelera`,
      });
    }
    return NextResponse.json({ purged });
  } catch (err) {
    console.error("DELETE /api/songs/trash failed:", err);
    return NextResponse.json({ error: "No se pudo vaciar la papelera." }, { status: 500 });
  }
}
