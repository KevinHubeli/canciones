import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getSong, updateSong } from "@/lib/songs";
import { importFromLaCuerda } from "@/lib/importers/lacuerda";
import { MIN_LYRICS_SIMILARITY, pickMatch, searchLaCuerda } from "@/lib/importers/lacuerdaSearch";
import { ImportError } from "@/lib/importers/shared";
import { logAudit } from "@/lib/audit";
import { saveVersion } from "@/lib/versions";
import { hasChords, lyricsSimilarity } from "@/lib/text";
import { isUuid } from "@/lib/validation";

// Buscar (hasta 3 intentos) + descargar la canción puede tardar bastante.
export const maxDuration = 60;

/**
 * Busca la canción en LaCuerda y, si encuentra la misma (título exacto, mismo
 * artista si lo tiene y una letra parecida a la actual), reemplaza el body por
 * la versión con acordes. No inventa nada: ante la duda no toca la canción.
 *
 * Pedido opcional: { force?: boolean, dryRun?: boolean }.
 *  - force: permite reemplazar aunque la canción ya tenga acordes.
 *  - dryRun: hace toda la verificación pero no escribe nada.
 *
 * Siempre responde un `reason`: "ok" | "no-candidates" | "no-exact-title" |
 * "artist-mismatch" | "ambiguous" | "lyrics-differ" | "already-has-chords" |
 * "error". Los errores de red/LaCuerda son 502 y los internos 500; "sin
 * coincidencia" es 200 con matched: false.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "No encontramos esa canción." }, { status: 404 });
  }

  // El cuerpo es opcional (el cliente viejo no manda nada).
  let force = false;
  let dryRun = false;
  try {
    const raw = await request.text();
    if (raw.trim()) {
      const parsed = JSON.parse(raw) as { force?: unknown; dryRun?: unknown };
      force = parsed.force === true;
      dryRun = parsed.dryRun === true;
    }
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  try {
    const song = await getSong(id);
    if (!song) {
      return NextResponse.json({ error: "No encontramos esa canción." }, { status: 404 });
    }

    // Se verifica en el servidor: no pisar una canción que ya tiene acordes.
    if (hasChords(song.body) && !force) {
      return NextResponse.json({ matched: false, reason: "already-has-chords" });
    }

    let match;
    let imported;
    try {
      const candidates = await searchLaCuerda(song.title);
      match = pickMatch(song, candidates);
      if (!match.candidate) {
        return NextResponse.json({ matched: false, reason: match.reason });
      }
      imported = await importFromLaCuerda(match.candidate.url);
    } catch (err) {
      if (err instanceof ImportError) {
        return NextResponse.json(
          { matched: false, reason: "error", error: err.message },
          { status: 502 }
        );
      }
      throw err;
    }

    const url = match.candidate.url;
    const similarity = Math.round(lyricsSimilarity(song.body, imported.body) * 100) / 100;
    if (similarity < MIN_LYRICS_SIMILARITY) {
      return NextResponse.json({ matched: false, reason: "lyrics-differ", url, similarity });
    }

    if (dryRun) {
      return NextResponse.json({ matched: true, dryRun: true, reason: "ok", url, similarity });
    }

    await saveVersion(song, "chords");
    const updated = await updateSong(id, {
      body: imported.body,
      originalKey: imported.originalKey,
      artist: song.artist || imported.artist,
    });

    await logAudit({ action: "chords", entity: "song", entityId: id, title: song.title });
    return NextResponse.json({ matched: true, reason: "ok", url, similarity, song: updated });
  } catch (err) {
    console.error("POST /api/songs/[id]/match-lacuerda failed:", err);
    return NextResponse.json(
      { matched: false, reason: "error", error: "Falló la búsqueda." },
      { status: 500 }
    );
  }
}
