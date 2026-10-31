import { isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { setlists, songs } from "@/db/schema";
import {
  computeStats,
  toBuenosAiresDay,
  usageDay,
  type StatSetlist,
  type StatSong,
  type Stats,
} from "@/lib/statsCalc";

// Un acorde entre corchetes, como [Am]. Va como parámetro para no pelear con los escapes.
const CHORD_PATTERN = String.raw`\[[^\]]+\]`;

export const DEFAULT_STALE_DAYS = 60;
const MIN_STALE_DAYS = 7;
const MAX_STALE_DAYS = 730;

/** Interpreta el parámetro ?days= : número entero acotado, o el valor por defecto. */
export function parseStaleDays(value: string | null | undefined): number {
  const n = Number(value);
  if (!value || !Number.isFinite(n)) return DEFAULT_STALE_DAYS;
  return Math.min(MAX_STALE_DAYS, Math.max(MIN_STALE_DAYS, Math.round(n)));
}

/** Lee canciones (sin las de la papelera) y powers, y arma las estadísticas. */
export async function getStats(staleDays: number = DEFAULT_STALE_DAYS): Promise<Stats> {
  const db = getDb();

  const [songRows, setlistRows] = await Promise.all([
    db
      .select({
        id: songs.id,
        title: songs.title,
        artist: songs.artist,
        originalKey: songs.originalKey,
        tags: songs.tags,
        hasChords: sql<boolean>`${songs.body} ~ ${CHORD_PATTERN}`,
      })
      .from(songs)
      .where(isNull(songs.deletedAt)),
    db
      .select({
        id: setlists.id,
        songIds: setlists.songIds,
        serviceDate: setlists.serviceDate,
        updatedAt: setlists.updatedAt,
      })
      .from(setlists),
  ]);

  const statSongs: StatSong[] = songRows.map((r) => ({ ...r, hasChords: Boolean(r.hasChords) }));
  const statSetlists: StatSetlist[] = setlistRows.map((r) => ({
    id: r.id,
    songIds: r.songIds,
    usedOn: usageDay(r.serviceDate, r.updatedAt),
  }));

  const now = new Date();
  return computeStats(statSongs, statSetlists, {
    today: toBuenosAiresDay(now),
    staleDays,
    now,
  });
}
