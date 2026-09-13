export type HolyricsSong = {
  title: string;
  artist: string;
  originalKey: string;
  body: string;
};

type HolyricsEntry = {
  title?: unknown;
  artist?: unknown;
  key?: unknown;
  lyrics?: { full_text?: unknown };
};

export class HolyricsParseError extends Error {}

/**
 * Convierte el JSON que exporta Holyrics (un array de canciones con
 * lyrics.full_text) a nuestro formato. Holyrics no guarda acordes: el body
 * resultante es solo letra, sin ningún [Acorde]. Se ignoran las entradas sin
 * título o con la letra vacía (Holyrics deja algunas canciones "placeholder"
 * con un espacio en blanco como letra).
 */
export function parseHolyricsExport(jsonText: string): {
  songs: HolyricsSong[];
  skipped: number;
} {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new HolyricsParseError("Ese archivo no es un JSON válido.");
  }
  if (!Array.isArray(data)) {
    throw new HolyricsParseError(
      "Se esperaba una lista de canciones (el export de Holyrics es un array JSON)."
    );
  }

  const songs: HolyricsSong[] = [];
  let skipped = 0;

  for (const raw of data as HolyricsEntry[]) {
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    const body = typeof raw.lyrics?.full_text === "string" ? raw.lyrics.full_text.trim() : "";
    if (!title || !body) {
      skipped++;
      continue;
    }
    const artist = typeof raw.artist === "string" ? raw.artist.trim() : "";
    const key = typeof raw.key === "string" ? raw.key.trim() : "";
    songs.push({ title, artist, originalKey: key || "C", body });
  }

  return { songs, skipped };
}
