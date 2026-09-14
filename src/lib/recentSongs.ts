const KEY = "cancionero:recientes";
const MAX = 8;

export type RecentSong = { id: string; title: string; artist: string };

export function getRecentSongs(): RecentSong[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRecentSong(song: RecentSong) {
  if (typeof window === "undefined") return;
  try {
    const prev = getRecentSongs().filter((s) => s.id !== song.id);
    const next = [song, ...prev].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // no pasa nada si no se puede guardar la preferencia
  }
}
