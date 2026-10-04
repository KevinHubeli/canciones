import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { createSetlist, getSetlist } from "@/lib/setlists";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Crea una copia del power (mismas canciones, tonos y divisores) para armar uno nuevo a partir de él. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "No encontramos ese power." }, { status: 404 });
  }

  try {
    const original = await getSetlist(id);
    if (!original) {
      return NextResponse.json({ error: "No encontramos ese power." }, { status: 404 });
    }
    const transpose: Record<string, number> = {};
    for (const song of original.songs) transpose[song.id] = song.semitones;

    const copy = await createSetlist({
      title: `${original.title} (copia)`,
      songIds: original.songs.map((s) => s.id),
      transpose,
      dividers: original.dividers,
    });
    await logAudit({ action: "duplicate", entity: "setlist", entityId: copy.id, title: original.title });
    return NextResponse.json({ setlist: copy });
  } catch (err) {
    console.error("POST /api/setlists/[id]/duplicate failed:", err);
    return NextResponse.json({ error: "No se pudo copiar el power." }, { status: 500 });
  }
}
