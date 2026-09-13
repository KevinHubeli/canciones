// Tags reales que se guardan en la canción. "Sin acordes" es un filtro
// aparte: se calcula a partir del contenido, no se guarda como tag.
export const SONG_TAGS = ["Alabanza", "Adoración", "Ministración", "Ofrenda"] as const;

export type SongTag = (typeof SONG_TAGS)[number];

export const NO_CHORDS_FILTER = "Sin acordes";

const HAS_CHORDS_RE = /\[[^\]]+\]/;

export function hasChords(body: string): boolean {
  return HAS_CHORDS_RE.test(body);
}
