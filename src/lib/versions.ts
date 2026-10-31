import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { songVersions, type SongVersionRow } from "@/db/schema";
import { getSessionUsername } from "@/lib/session";

export type VersionReason = "update" | "delete" | "chords" | "restore" | "revert";

export type SongVersion = {
  id: string;
  savedAt: string;
  savedBy: string;
  reason: string;
  title: string;
  artist: string;
  originalKey: string;
  body: string;
};

/** Cuántas versiones se conservan por canción; las más viejas se descartan. */
export const MAX_VERSIONS_PER_SONG = 30;

function toVersion(row: SongVersionRow): SongVersion {
  return {
    id: row.id,
    savedAt: row.savedAt.toISOString(),
    savedBy: row.savedBy,
    reason: row.reason,
    title: row.title,
    artist: row.artist,
    originalKey: row.originalKey,
    body: row.body,
  };
}

/**
 * Guarda el estado que tenía la canción ANTES de un cambio. Nunca rompe el
 * pedido: si no se puede guardar, se avisa en el log del servidor.
 */
export async function saveVersion(
  song: { id: string; title: string; artist: string; originalKey: string; body: string },
  reason: VersionReason
): Promise<void> {
  try {
    const savedBy = (await getSessionUsername()) ?? "desconocido";
    const db = getDb();
    await db.batch([
      db.insert(songVersions).values({
        songId: song.id,
        title: song.title,
        artist: song.artist,
        originalKey: song.originalKey,
        body: song.body,
        savedBy,
        reason,
      }),
      // Deja solo las últimas MAX_VERSIONS_PER_SONG de esta canción.
      db.delete(songVersions).where(
        and(
          eq(songVersions.songId, song.id),
          sql`${songVersions.id} NOT IN (
            SELECT id FROM song_versions
            WHERE song_id = ${song.id}
            ORDER BY saved_at DESC, id DESC
            LIMIT ${MAX_VERSIONS_PER_SONG}
          )`
        )
      ),
    ]);
  } catch (err) {
    console.error("No se pudo guardar la versión de la canción:", err);
  }
}

/** Versiones de una canción, la más nueva primero. */
export async function listVersions(songId: string): Promise<SongVersion[]> {
  const rows = await getDb()
    .select()
    .from(songVersions)
    .where(eq(songVersions.songId, songId))
    .orderBy(desc(songVersions.savedAt), desc(songVersions.id))
    .limit(MAX_VERSIONS_PER_SONG);
  return rows.map(toVersion);
}

export async function getVersion(songId: string, versionId: string): Promise<SongVersion | null> {
  const [row] = await getDb()
    .select()
    .from(songVersions)
    .where(and(eq(songVersions.songId, songId), eq(songVersions.id, versionId)));
  return row ? toVersion(row) : null;
}
