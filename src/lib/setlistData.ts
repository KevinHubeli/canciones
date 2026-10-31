import { sanitizeDividers, type SetlistDivider } from "@/lib/dividers";

/** Semitonos por canción de un power, tal como se guardan en la columna jsonb. */
export function readTranspose(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, number>;
}

/**
 * Datos de un power sin ciertas canciones (cuando se borran de verdad): se
 * sacan de la lista y de los tonos, y los divisores se corren para quedar en el
 * mismo lugar relativo a las canciones que quedan.
 */
export function removeSongsFromSetlistData(
  row: { songIds: string[]; transpose: unknown; dividers: unknown },
  removedIds: string[]
): { songIds: string[]; transpose: Record<string, number>; dividers: SetlistDivider[] } {
  const removed = new Set(removedIds);
  const songIds = row.songIds.filter((id) => !removed.has(id));
  const transpose: Record<string, number> = {};
  for (const [id, semitones] of Object.entries(readTranspose(row.transpose))) {
    if (!removed.has(id)) transpose[id] = semitones;
  }
  const dividers = sanitizeDividers(row.dividers, row.songIds.length).map((d) => ({
    ...d,
    position: row.songIds.slice(0, d.position).filter((id) => !removed.has(id)).length,
  }));
  return { songIds, transpose, dividers };
}
