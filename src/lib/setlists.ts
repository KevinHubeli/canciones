import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { setlists, songs, type SetlistRow } from "@/db/schema";
import type { SongSummary } from "@/lib/types";

export type SetlistSummary = {
  id: string;
  title: string;
  songCount: number;
  updatedAt: string;
};

export type SetlistSong = SongSummary & { semitones: number };

export type Setlist = {
  id: string;
  title: string;
  songs: SetlistSong[];
  updatedAt: string;
};

function toSummary(row: SetlistRow): SetlistSummary {
  return {
    id: row.id,
    title: row.title,
    songCount: row.songIds.length,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function transposeMap(row: SetlistRow): Record<string, number> {
  const raw = row.transpose;
  if (!raw || typeof raw !== "object") return {};
  return raw as Record<string, number>;
}

export async function listSetlists(): Promise<SetlistSummary[]> {
  const rows = await getDb().select().from(setlists).orderBy(desc(setlists.updatedAt));
  return rows.map(toSummary);
}

export async function getSetlist(id: string): Promise<Setlist | null> {
  const db = getDb();
  const [row] = await db.select().from(setlists).where(eq(setlists.id, id));
  if (!row) return null;

  if (row.songIds.length === 0) {
    return { id: row.id, title: row.title, songs: [], updatedAt: row.updatedAt.toISOString() };
  }

  const transpose = transposeMap(row);
  const songRows = await db.select().from(songs).where(inArray(songs.id, row.songIds));
  const byId = new Map(songRows.map((s) => [s.id, s]));
  const ordered = row.songIds
    .map((id) => byId.get(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      originalKey: s.originalKey,
      category: s.category,
      tags: s.tags,
      updatedAt: s.updatedAt.toISOString(),
      semitones: transpose[s.id] ?? 0,
    }));

  return { id: row.id, title: row.title, songs: ordered, updatedAt: row.updatedAt.toISOString() };
}

export async function createSetlist(input: {
  title: string;
  songIds: string[];
  transpose?: Record<string, number>;
}): Promise<SetlistSummary> {
  const [row] = await getDb()
    .insert(setlists)
    .values({ ...input, transpose: input.transpose ?? {} })
    .returning();
  return toSummary(row);
}

export async function updateSetlist(
  id: string,
  input: Partial<{ title: string; songIds: string[]; transpose: Record<string, number> }>
): Promise<SetlistSummary | null> {
  const [row] = await getDb()
    .update(setlists)
    .set({ ...input, updatedAt: sql`now()` })
    .where(eq(setlists.id, id))
    .returning();
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

  const ids = [...lastUse.keys()];
  const songRows = await db.select().from(songs).where(inArray(songs.id, ids));

  return songRows
    .map((s) => {
      const meta = lastUse.get(s.id)!;
      return {
        id: s.id,
        title: s.title,
        artist: s.artist,
        originalKey: s.originalKey,
        category: s.category,
        tags: s.tags,
        updatedAt: s.updatedAt.toISOString(),
        lastUsedIn: meta.setlistTitle,
        lastUsedAt: meta.updatedAt.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime())
    .slice(0, limit);
}
