import { readStored, writeStored } from "@/lib/useStoredString";

export const RECENT_KEY = "cancionero:recientes";
const MAX = 8;

export type RecentSong = { id: string; title: string; artist: string };

export function parseRecentSongs(raw: string | null): RecentSong[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Lo guardado puede venir roto o de una versión vieja: se descarta lo que no sirve
    // para que un dato raro no tire abajo la lista de recientes.
    const seen = new Set<string>();
    const out: RecentSong[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const { id, title, artist } = item as Record<string, unknown>;
      if (typeof id !== "string" || id === "" || typeof title !== "string" || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, title, artist: typeof artist === "string" ? artist : "" });
    }
    return out.slice(0, MAX);
  } catch {
    return [];
  }
}

export function addRecentSong(song: RecentSong) {
  if (typeof window === "undefined") return;
  const prev = parseRecentSongs(readStored(RECENT_KEY)).filter((s) => s.id !== song.id);
  writeStored(RECENT_KEY, JSON.stringify([song, ...prev].slice(0, MAX)));
}

/** Se queda solo con los recientes que siguen existiendo (los demás se borraron o fueron a la papelera). */
export function keepExistingRecents(recents: RecentSong[], existingIds: ReadonlySet<string>): RecentSong[] {
  return recents.filter((s) => existingIds.has(s.id));
}

/** Saca de lo guardado en el navegador las canciones que ya no existen en el servidor. */
export function pruneRecentSongs(existingIds: ReadonlySet<string>) {
  if (typeof window === "undefined") return;
  const prev = parseRecentSongs(readStored(RECENT_KEY));
  const next = keepExistingRecents(prev, existingIds);
  if (next.length !== prev.length) writeStored(RECENT_KEY, JSON.stringify(next));
}
