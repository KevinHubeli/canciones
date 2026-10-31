import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { restoreSong } from "@/lib/songs";
import { isUuid } from "@/lib/validation";

/** Saca una canción de la papelera; vuelve a aparecer en los powers que la tenían. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "No encontramos esa canción." }, { status: 404 });
  }
  try {
    const song = await restoreSong(id);
    if (!song) {
      return NextResponse.json({ error: "Esa canción no está en la papelera." }, { status: 404 });
    }
    await logAudit({ action: "restore", entity: "song", entityId: song.id, title: song.title });
    return NextResponse.json({ song });
  } catch (err) {
    console.error("POST /api/songs/[id]/restore failed:", err);
    return NextResponse.json({ error: "No se pudo restaurar la canción." }, { status: 500 });
  }
}
