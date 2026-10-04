export const DIVIDER_NAMES = [
  "ALABANZA",
  "ADORACIÓN",
  "OFRENDA",
  "MINISTRACIÓN",
  "FINAL",
] as const;

export type DividerName = (typeof DIVIDER_NAMES)[number];

/**
 * Un divisor de sección dentro de un power. `position` es la cantidad de
 * canciones que van antes: 0 = al principio, N = después de la canción N.
 * Si hay varios con la misma posición, se respeta el orden del array.
 */
export type SetlistDivider = { name: DividerName; position: number };

/** Limpia lo que llega del cliente: nombres válidos y posiciones dentro de rango. */
export function sanitizeDividers(input: unknown, songCount: number): SetlistDivider[] {
  if (!Array.isArray(input)) return [];
  const out: SetlistDivider[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const { name, position } = item as { name?: unknown; position?: unknown };
    if (!DIVIDER_NAMES.includes(name as DividerName)) continue;
    if (typeof position !== "number" || !Number.isFinite(position)) continue;
    out.push({
      name: name as DividerName,
      position: Math.max(0, Math.min(songCount, Math.round(position))),
    });
  }
  return out;
}

export type SetlistEntry<S> =
  | { kind: "divider"; name: DividerName }
  | { kind: "song"; song: S };

/** Mezcla canciones y divisores en una sola lista ordenada. */
export function mergeEntries<S>(songs: S[], dividers: SetlistDivider[]): SetlistEntry<S>[] {
  const entries: SetlistEntry<S>[] = [];
  for (let pos = 0; pos <= songs.length; pos++) {
    for (const d of dividers) {
      if (d.position === pos) entries.push({ kind: "divider", name: d.name });
    }
    if (pos < songs.length) entries.push({ kind: "song", song: songs[pos] });
  }
  return entries;
}

/** Inversa de mergeEntries: separa la lista ordenada en canciones y divisores. */
export function splitEntries<S>(entries: SetlistEntry<S>[]): {
  songs: S[];
  dividers: SetlistDivider[];
} {
  const songs: S[] = [];
  const dividers: SetlistDivider[] = [];
  for (const e of entries) {
    if (e.kind === "song") songs.push(e.song);
    else dividers.push({ name: e.name, position: songs.length });
  }
  return { songs, dividers };
}

/** Para la URL del visor: "ALABANZA.0,OFRENDA.2" (nombre.posición). */
export function encodeDividers(dividers: SetlistDivider[]): string {
  return dividers.map((d) => `${d.name}.${d.position}`).join(",");
}

export function decodeDividers(param: string | undefined, songCount: number): SetlistDivider[] {
  if (!param) return [];
  const items = param.split(",").map((part) => {
    const dot = part.lastIndexOf(".");
    return { name: part.slice(0, dot), position: Number(part.slice(dot + 1)) };
  });
  return sanitizeDividers(items, songCount);
}
