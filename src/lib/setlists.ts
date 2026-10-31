import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { setlists } from "@/db/schema";
import type { SongSummary } from "@/lib/types";
import { sanitizeDividers, type SetlistDivider } from "@/lib/dividers";
import { readTranspose } from "@/lib/setlistData";
import { getSongSummariesByIds } from "@/lib/songs";

export type SetlistSummary = {
  id: string;
  title: string;
  /** Solo cuenta canciones que existen y no están en la papelera. */
  songCount: number;
  /** Fecha del culto ("YYYY-MM-DD"), si se cargó. */
  serviceDate: string | null;
  notes: string | null;
  updatedAt: string;
};

export type SetlistSong = SongSummary & { semitones: number };

export type Setlist = {
  id: string;
  title: string;
  songs: SetlistSong[];
  dividers: SetlistDivider[];
  serviceDate: string | null;
  notes: string | null;
  updatedAt: string;
};

// Cuenta solo las canciones vivas. Va con nombres de tabla escritos a mano (y
// no con las columnas de drizzle) para que sirva igual en select y en returning.
const SONG_COUNT_SQL = sql<number>`(
  SELECT count(*)::int FROM songs
  WHERE songs.id = ANY(setlists.song_ids) AND songs.deleted_at IS NULL
)`;

const summaryColumns = {
  id: setlists.id,
  title: setlists.title,
  serviceDate: setlists.serviceDate,
  notes: setlists.notes,
  updatedAt: setlists.updatedAt,
  songCount: SONG_COUNT_SQL,
};

type SummaryRow = {
  id: string;
  title: string;
  serviceDate: string | null;
  notes: string | null;
  updatedAt: Date;
  songCount: number;
};

function toSummary(row: SummaryRow): SetlistSummary {
  return {
    id: row.id,
    title: row.title,
    songCount: Number(row.songCount),
    serviceDate: row.serviceDate,
    notes: row.notes,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Primero los powers con fecha de culto más reciente (los que no tienen, al final), después los editados hace menos. */
export async function listSetlists(): Promise<SetlistSummary[]> {
  const rows = await getDb()
    .select(summaryColumns)
    .from(setlists)
    .orderBy(sql`${setlists.serviceDate} DESC NULLS LAST`, desc(setlists.updatedAt));
  return rows.map(toSummary);
}

export async function getSetlist(id: string): Promise<Setlist | null> {
  const [row] = await getDb().select().from(setlists).where(eq(setlists.id, id));
  if (!row) return null;

  const base = {
    id: row.id,
    title: row.title,
    serviceDate: row.serviceDate,
    notes: row.notes,
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.songIds.length === 0) {
    return { ...base, songs: [], dividers: sanitizeDividers(row.dividers, 0) };
  }

  const transpose = readTranspose(row.transpose);
  const songRows = await getSongSummariesByIds(row.songIds);
  const byId = new Map(songRows.map((s) => [s.id, s]));
  const ordered = row.songIds
    .map((songId) => byId.get(songId))
    .filter((s): s is SongSummary => Boolean(s))
    .map((s) => ({ ...s, semitones: transpose[s.id] ?? 0 }));

  // Si alguna canción se borró (o está en la papelera), los divisores se corren
  // para seguir en el mismo lugar relativo a las canciones que quedan.
  const dividers = sanitizeDividers(row.dividers, row.songIds.length).map((d) => ({
    ...d,
    position: row.songIds.slice(0, d.position).filter((songId) => byId.has(songId)).length,
  }));

  return { ...base, songs: ordered, dividers };
}

export async function createSetlist(input: {
  title: string;
  songIds: string[];
  transpose?: Record<string, number>;
  dividers?: SetlistDivider[];
  serviceDate?: string | null;
  notes?: string | null;
}): Promise<SetlistSummary> {
  const [row] = await getDb()
    .insert(setlists)
    .values({ ...input, transpose: input.transpose ?? {}, dividers: input.dividers ?? [] })
    .returning(summaryColumns);
  return toSummary(row);
}

export async function updateSetlist(
  id: string,
  input: Partial<{
    title: string;
    songIds: string[];
    transpose: Record<string, number>;
    dividers: SetlistDivider[];
    serviceDate: string | null;
    notes: string | null;
  }>
): Promise<SetlistSummary | null> {
  const [row] = await getDb()
    .update(setlists)
    .set({ ...input, updatedAt: sql`now()` })
    .where(eq(setlists.id, id))
    .returning(summaryColumns);
  return row ? toSummary(row) : null;
}

export async function deleteSetlist(id: string): Promise<boolean> {
  const [row] = await getDb().delete(setlists).where(eq(setlists.id, id)).returning();
  return Boolean(row);
}

export type RecentlyUsedSong = SongSummary & { lastUsedIn: string; lastUsedAt: string };

/** Canciones de los últimos powers armados, para no repetir siempre las mismas. */
export async function getRecentlyUsedSongs(limit = 20): Promise<RecentlyUsedSong[]> {
  const db = getDb();
  const recentSetlists = await db.select().from(setlists).orderBy(desc(setlists.updatedAt)).limit(10);

  const lastUse = new Map<string, { setlistTitle: string; updatedAt: Date }>();
  for (const row of recentSetlists) {
    for (const songId of row.songIds) {
      if (!lastUse.has(songId)) {
        lastUse.set(songId, { setlistTitle: row.title, updatedAt: row.updatedAt });
      }
    }
  }
  if (lastUse.size === 0) return [];

  const songRows = await getSongSummariesByIds([...lastUse.keys()]);

  return songRows
    .map((s) => {
      const meta = lastUse.get(s.id)!;
      return { ...s, lastUsedIn: meta.setlistTitle, lastUsedAt: meta.updatedAt.toISOString() };
    })
    .sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime())
    .slice(0, limit);
}

export type LastTone = { semitones: number; setlistTitle: string };

/**
 * Para cada canción de los últimos powers, cuántos semitonos se la subió o
 * bajó la última vez que se usó (así al armar uno nuevo se arranca con el
 * mismo tono). `excludeId` deja afuera el power que se está editando.
 */
export async function getLastTones(excludeId?: string): Promise<Record<string, LastTone>> {
  const rows = await getDb().select().from(setlists).orderBy(desc(setlists.updatedAt)).limit(30);
  const result: Record<string, LastTone> = {};
  for (const row of rows) {
    if (row.id === excludeId) continue;
    const transpose = readTranspose(row.transpose);
    for (const songId of row.songIds) {
      if (!(songId in result)) {
        result[songId] = { semitones: transpose[songId] ?? 0, setlistTitle: row.title };
      }
    }
  }
  return result;
}
