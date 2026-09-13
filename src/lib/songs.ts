import { asc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { songs, type SongRow } from "@/db/schema";
import type { Song, SongSummary } from "@/lib/types";

function toSummary(row: SongRow): SongSummary {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    originalKey: row.originalKey,
    category: row.category,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSong(row: SongRow): Song {
  return { ...toSummary(row), body: row.body };
}

export async function listSongs(params: {
  q?: string;
  limit: number;
  offset: number;
}): Promise<{ songs: SongSummary[]; hasMore: boolean }> {
  const db = getDb();
  const where = params.q
    ? or(ilike(songs.title, `%${params.q}%`), ilike(songs.artist, `%${params.q}%`))
    : undefined;

  const rows = await db
    .select()
    .from(songs)
    .where(where)
    .orderBy(asc(songs.title))
    .limit(params.limit + 1)
    .offset(params.offset);

  return {
    songs: rows.slice(0, params.limit).map(toSummary),
    hasMore: rows.length > params.limit,
  };
}

export async function getSong(id: string): Promise<Song | null> {
  const [row] = await getDb().select().from(songs).where(eq(songs.id, id));
  return row ? toSong(row) : null;
}

export async function createSong(input: {
  title: string;
  artist: string;
  originalKey: string;
  category?: string | null;
  body: string;
}): Promise<Song> {
  const [row] = await getDb().insert(songs).values(input).returning();
  return toSong(row);
}

export async function createSongsBulk(
  inputs: { title: string; artist: string; originalKey: string; body: string }[]
): Promise<number> {
  if (inputs.length === 0) return 0;
  const db = getDb();
  const BATCH_SIZE = 100;
  let inserted = 0;
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);
    const rows = await db.insert(songs).values(batch).returning({ id: songs.id });
    inserted += rows.length;
  }
  return inserted;
}

export async function updateSong(
  id: string,
  input: Partial<{
    title: string;
    artist: string;
    originalKey: string;
    category: string | null;
    body: string;
  }>
): Promise<Song | null> {
  const [row] = await getDb()
    .update(songs)
    .set({ ...input, updatedAt: sql`now()` })
    .where(eq(songs.id, id))
    .returning();
  return row ? toSong(row) : null;
}

export async function deleteSong(id: string): Promise<boolean> {
  const [row] = await getDb().delete(songs).where(eq(songs.id, id)).returning();
  return Boolean(row);
}
