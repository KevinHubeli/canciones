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
