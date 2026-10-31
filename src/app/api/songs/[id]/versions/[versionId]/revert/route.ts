import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { getSong, updateSong } from "@/lib/songs";
import { getVersion, saveVersion } from "@/lib/versions";
import { isUuid } from "@/lib/validation";

/** Vuelve la canción a como estaba en una versión anterior (antes guarda el estado actual). */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const { id, versionId } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "No encontramos esa canción." }, { status: 404 });
  }
  if (!isUuid(versionId)) {
    return NextResponse.json({ error: "No encontramos esa versión." }, { status: 404 });
  }

  try {
    const current = await getSong(id);
    if (!current) {
      return NextResponse.json({ error: "No encontramos esa canción." }, { status: 404 });
    }
    const version = await getVersion(id, versionId);
    if (!version) {
      return NextResponse.json({ error: "No encontramos esa versión." }, { status: 404 });
    }

    await saveVersion(current, "revert");
    const song = await updateSong(id, {
      title: version.title,
      artist: version.artist,
      originalKey: version.originalKey,
      body: version.body,
    });
    if (!song) {
      return NextResponse.json({ error: "No encontramos esa canción." }, { status: 404 });
    }
    await logAudit({ action: "revert", entity: "song", entityId: song.id, title: song.title });
    return NextResponse.json({ song });
  } catch (err) {
    console.error("POST /api/songs/[id]/versions/[versionId]/revert failed:", err);
    return NextResponse.json({ error: "No se pudo volver a esa versión." }, { status: 500 });
  }
}
