import { readStored, writeStored } from "@/lib/useStoredString";

export const RECENT_KEY = "cancionero:recientes";
const MAX = 8;

export type RecentSong = { id: string; title: string; artist: string };

export function parseRecentSongs(raw: string | null): RecentSong[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentSong(song: RecentSong) {
  if (typeof window === "undefined") return;
  const prev = parseRecentSongs(readStored(RECENT_KEY)).filter((s) => s.id !== song.id);
  writeStored(RECENT_KEY, JSON.stringify([song, ...prev].slice(0, MAX)));
}
