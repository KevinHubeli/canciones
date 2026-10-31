import { and, arrayOverlaps, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { setlists, songs, type SongRow } from "@/db/schema";
import type { Song, SongSummary } from "@/lib/types";
import { NO_CHORDS_FILTER } from "@/lib/tags";
import { normalizeTitle } from "@/lib/text";
import { removeSongsFromSetlistData } from "@/lib/setlistData";

// Columnas de un resumen: todo menos la letra, que es lo pesado.
const summaryColumns = {
  id: songs.id,
  title: songs.title,
  artist: songs.artist,
  originalKey: songs.originalKey,
  category: songs.category,
  tags: songs.tags,
  updatedAt: songs.updatedAt,
};

type SummaryRow = Pick<SongRow, keyof typeof summaryColumns>;

function toSummary(row: SummaryRow): SongSummary {
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
  return { ...toSummary(row), body: row.body, bpm: row.bpm, notes: row.notes };
}

/** Las canciones en la papelera no aparecen en ninguna lectura normal. */
const NOT_DELETED = isNull(songs.deletedAt);

/** Un [Acorde] entre corchetes. Como regex de Postgres (ARE) y de JS es el mismo patrón. */
export const CHORD_PATTERN = String.raw`\[[^\]]+\]`;

// El patrón va como parámetro y no escrito dentro del template: el tag `sql` de
// drizzle interpreta las barras invertidas y a Postgres le llegaba '[[^]]+]'.
export const NO_CHORDS_SQL = sql`${songs.body} !~ ${CHORD_PATTERN}`;

export async function listSongs(params: {
  q?: string;
  tags?: string[];
  limit: number;
  offset: number;
}): Promise<{ songs: SongSummary[]; hasMore: boolean }> {
  const db = getDb();
  const conditions = [NOT_DELETED];
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
    conditions.push(or(...tagConditions)!);
  }
  const where = and(...conditions);

  const orderBy = q
    ? sql`GREATEST(
        similarity(unaccent(${songs.title}), unaccent(${q})),
        similarity(unaccent(${songs.artist}), unaccent(${q}))
      ) DESC, ${songs.title} ASC`
    : asc(songs.title);

  const rows = await db
    .select(summaryColumns)
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
  const [row] = await getDb()
    .select()
    .from(songs)
    .where(and(eq(songs.id, id), NOT_DELETED));
  return row ? toSong(row) : null;
}

/** Varias canciones completas con una sola consulta (sin las borradas). El orden no está garantizado. */
export async function getSongsByIds(ids: string[]): Promise<Song[]> {
  if (ids.length === 0) return [];
  const rows = await getDb()
    .select()
    .from(songs)
    .where(and(inArray(songs.id, ids), NOT_DELETED));
  return rows.map(toSong);
}

/** Lo mismo pero sin la letra: para listas que solo muestran título, artista y tono. */
export async function getSongSummariesByIds(ids: string[]): Promise<SongSummary[]> {
  if (ids.length === 0) return [];
  const rows = await getDb()
    .select(summaryColumns)
    .from(songs)
    .where(and(inArray(songs.id, ids), NOT_DELETED));
  return rows.map(toSummary);
}

/** Canciones cuyo body no tiene ningún [Acorde]: candidatas para el auto-emparejado. */
export async function listSongsWithoutChords(): Promise<{ id: string; title: string }[]> {
  return getDb()
    .select({ id: songs.id, title: songs.title })
    .from(songs)
    .where(and(NOT_DELETED, NO_CHORDS_SQL))
    .orderBy(asc(songs.title));
}

export async function createSong(input: {
  title: string;
  artist: string;
  originalKey: string;
  category?: string | null;
  tags?: string[];
  body: string;
  bpm?: number | null;
  notes?: string | null;
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
    bpm: number | null;
    notes: string | null;
  }>
): Promise<Song | null> {
  const [row] = await getDb()
    .update(songs)
    .set({ ...input, updatedAt: sql`now()` })
    .where(and(eq(songs.id, id), NOT_DELETED))
    .returning();
  return row ? toSong(row) : null;
}

/** Manda la canción a la papelera (no la borra de verdad). */
export async function deleteSong(id: string): Promise<boolean> {
  const [row] = await getDb()
    .update(songs)
    .set({ deletedAt: sql`now()` })
    .where(and(eq(songs.id, id), NOT_DELETED))
    .returning({ id: songs.id });
  return Boolean(row);
}

export type TrashedSong = { id: string; title: string; artist: string; deletedAt: string };

/** Lo que hay en la papelera, lo último borrado primero. */
export async function listTrash(): Promise<TrashedSong[]> {
  const rows = await getDb()
    .select({
      id: songs.id,
      title: songs.title,
      artist: songs.artist,
      deletedAt: songs.deletedAt,
    })
    .from(songs)
    .where(isNotNull(songs.deletedAt))
    .orderBy(desc(songs.deletedAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    artist: r.artist,
    deletedAt: r.deletedAt!.toISOString(),
  }));
}

/**
 * Saca la canción de la papelera. Como los powers guardan solo ids, vuelve a
 * aparecer sola en los que la tenían.
 */
export async function restoreSong(id: string): Promise<Song | null> {
  const [row] = await getDb()
    .update(songs)
    .set({ deletedAt: null })
    .where(and(eq(songs.id, id), isNotNull(songs.deletedAt)))
    .returning();
  return row ? toSong(row) : null;
}

/**
 * Borra de verdad las canciones indicadas que estén en la papelera (o todas las
 * de la papelera si `ids` es null) y las quita de los powers que las tenían
 * (ids, tonos y posición de los divisores). Devuelve cuántas se borraron.
 */
async function purgeTrashed(ids: string[] | null): Promise<number> {
  const db = getDb();
  const where = ids
    ? and(inArray(songs.id, ids), isNotNull(songs.deletedAt))
    : isNotNull(songs.deletedAt);
  // Primero se borran las canciones y después se limpian los powers: si algo
  // falla en el medio solo quedan ids huérfanos, que getSetlist ya ignora.
  const deleted = await db.delete(songs).where(where).returning({ id: songs.id });
  if (deleted.length === 0) return 0;
  const purgedIds = deleted.map((d) => d.id);

  const affected = await db
    .select()
    .from(setlists)
    .where(arrayOverlaps(setlists.songIds, purgedIds));
  const updates = affected.map((row) =>
    db.update(setlists).set(removeSongsFromSetlistData(row, purgedIds)).where(eq(setlists.id, row.id))
  );
  if (updates.length > 0) {
    await db.batch(updates as unknown as Parameters<typeof db.batch>[0]);
  }
  return purgedIds.length;
}

/** Borra de verdad una canción que está en la papelera. */
export async function purgeSong(id: string): Promise<boolean> {
  return (await purgeTrashed([id])) > 0;
}

/** Vacía la papelera. Devuelve cuántas canciones se borraron. */
export async function emptyTrash(): Promise<number> {
  return purgeTrashed(null);
}

export type DuplicateSong = SongSummary & { chordCount: number; bodyLength: number };
export type DuplicateGroup = { title: string; songs: DuplicateSong[] };

/** Grupos de canciones con el mismo título (sin importar tildes, mayúsculas ni signos). */
export async function findDuplicateGroups(): Promise<DuplicateGroup[]> {
  // La letra no sale de la base: solo su largo y la cantidad de acordes.
  const rows = await getDb()
    .select({
      ...summaryColumns,
      chordCount: sql<number>`(SELECT count(*)::int FROM regexp_matches(${songs.body}, ${CHORD_PATTERN}, 'g'))`,
      bodyLength: sql<number>`length(${songs.body})`,
    })
    .from(songs)
    .where(NOT_DELETED);
  const groups = new Map<string, typeof rows>();
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
        chordCount: Number(row.chordCount),
        bodyLength: Number(row.bodyLength),
      })),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Otra canción ya cargada con el mismo título (normalizado), si existe. `excludeId` deja afuera a la que se está editando. */
export async function findSongWithSameTitle(
  title: string,
  excludeId?: string
): Promise<{ id: string; title: string } | null> {
  const key = normalizeTitle(title);
  if (!key) return null;
  const conditions = [NOT_DELETED];
  if (excludeId) conditions.push(ne(songs.id, excludeId));
  const rows = await getDb()
    .select({ id: songs.id, title: songs.title })
    .from(songs)
    .where(and(...conditions));
  return rows.find((r) => normalizeTitle(r.title) === key) ?? null;
}
