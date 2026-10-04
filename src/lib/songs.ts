import { and, arrayOverlaps, asc, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { songs, type SongRow } from "@/db/schema";
import type { Song, SongSummary } from "@/lib/types";
import { NO_CHORDS_FILTER } from "@/lib/tags";
import { normalizeTitle } from "@/lib/text";

function toSummary(row: SongRow): SongSummary {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    originalKey: row.originalKey,
    category: row.category,
    tags: row.tags,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSong(row: SongRow): Song {
  return { ...toSummary(row), body: row.body };
}

const NO_CHORDS_SQL = sql`${songs.body} !~ '\[[^\]]+\]'`;

export async function listSongs(params: {
  q?: string;
  tags?: string[];
  limit: number;
  offset: number;
}): Promise<{ songs: SongSummary[]; hasMore: boolean }> {
  const db = getDb();
  const conditions = [];
  const q = params.q?.trim();
  if (q) {
    const likeQ = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
    // unaccent() para que "cancion" encuentre "canción", y similarity()
    // (pg_trgm) para tolerar errores de tipeo, además del substring de siempre.
    conditions.push(sql`(
      unaccent(${songs.title}) ILIKE unaccent(${likeQ})
      OR unaccent(${songs.artist}) ILIKE unaccent(${likeQ})
      OR similarity(unaccent(${songs.title}), unaccent(${q})) > 0.25
      OR similarity(unaccent(${songs.artist}), unaccent(${q})) > 0.25
    )`);
  }
  if (params.tags && params.tags.length > 0) {
    const realTags = params.tags.filter((t) => t !== NO_CHORDS_FILTER);
    const wantsNoChords = params.tags.includes(NO_CHORDS_FILTER);
    const tagConditions = [];
    if (realTags.length > 0) tagConditions.push(arrayOverlaps(songs.tags, realTags));
    if (wantsNoChords) tagConditions.push(NO_CHORDS_SQL);
    conditions.push(or(...tagConditions));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const orderBy = q
    ? sql`GREATEST(
        similarity(unaccent(${songs.title}), unaccent(${q})),
        similarity(unaccent(${songs.artist}), unaccent(${q}))
      ) DESC, ${songs.title} ASC`
    : asc(songs.title);

  const rows = await db
    .select()
    .from(songs)
    .where(where)
    .orderBy(orderBy)
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

const HAS_CHORDS_RE = /\[[^\]]+\]/;

/** Canciones cuyo body no tiene ningún [Acorde]: candidatas para el auto-emparejado. */
export async function listSongsWithoutChords(): Promise<{ id: string; title: string }[]> {
  const rows = await getDb()
    .select({ id: songs.id, title: songs.title, body: songs.body })
    .from(songs);
  return rows.filter((r) => !HAS_CHORDS_RE.test(r.body)).map((r) => ({ id: r.id, title: r.title }));
}

export async function createSong(input: {
  title: string;
  artist: string;
  originalKey: string;
  category?: string | null;
  tags?: string[];
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
    tags: string[];
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

export type DuplicateSong = SongSummary & { chordCount: number; bodyLength: number };
export type DuplicateGroup = { title: string; songs: DuplicateSong[] };

/** Grupos de canciones con el mismo título (sin importar tildes, mayúsculas ni signos). */
export async function findDuplicateGroups(): Promise<DuplicateGroup[]> {
  const rows = await getDb().select().from(songs);
  const groups = new Map<string, SongRow[]>();
  for (const row of rows) {
    const key = normalizeTitle(row.title);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({
      title: g[0].title,
      songs: g.map((row) => ({
        ...toSummary(row),
        chordCount: (row.body.match(/\[[^\]]+\]/g) ?? []).length,
        bodyLength: row.body.length,
      })),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Una canción ya cargada con el mismo título (normalizado), si existe. */
export async function findSongWithSameTitle(title: string): Promise<{ id: string; title: string } | null> {
  const key = normalizeTitle(title);
  if (!key) return null;
  const rows = await getDb().select({ id: songs.id, title: songs.title }).from(songs);
  return rows.find((r) => normalizeTitle(r.title) === key) ?? null;
}
