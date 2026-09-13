import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getSong, updateSong } from "@/lib/songs";
import { importFromLaCuerda } from "@/lib/importers/lacuerda";
import { pickExactMatch, searchLaCuerda } from "@/lib/importers/lacuerdaSearch";
import { ImportError } from "@/lib/importers/shared";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Busca la canción por título en LaCuerda y, si encuentra una coincidencia
 * exacta de título, reemplaza el body (solo letra) por la versión con
 * acordes. No inventa nada: si no hay coincidencia exacta, no toca la canción.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "No encontramos esa canción." }, { status: 404 });
  }

  const song = await getSong(id);
  if (!song) {
    return NextResponse.json({ error: "No encontramos esa canción." }, { status: 404 });
  }

  try {
    const candidates = await searchLaCuerda(song.title);
    const match = pickExactMatch(song.title, candidates);
    if (!match) {
      return NextResponse.json({ matched: false });
    }

    const imported = await importFromLaCuerda(match.url);
    const updated = await updateSong(id, {
      body: imported.body,
      originalKey: imported.originalKey,
      artist: song.artist || imported.artist,
    });

    return NextResponse.json({ matched: true, url: match.url, song: updated });
  } catch (err) {
    if (err instanceof ImportError) {
      return NextResponse.json({ matched: false });
    }
    console.error("POST /api/songs/[id]/match-lacuerda failed:", err);
    return NextResponse.json({ error: "Falló la búsqueda." }, { status: 500 });
  }
}
