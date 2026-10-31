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

/** Acota una posición a [0, songCount]; un songCount raro (NaN, negativo) se toma como 0. */
function clampPosition(position: number, songCount: number): number {
  const max = Number.isNaN(songCount) ? 0 : Math.max(0, songCount);
  return Math.max(0, Math.min(max, Math.round(position)));
}

/**
 * Limpia lo que llega del cliente: nombres válidos y posiciones dentro de rango.
 * Respeta el orden del array (no reordena) y descarta un divisor idéntico
 * (mismo nombre y misma posición) pegado al anterior, que es un doble toque.
 */
export function sanitizeDividers(input: unknown, songCount: number): SetlistDivider[] {
  if (!Array.isArray(input)) return [];
  const out: SetlistDivider[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const { name, position } = item as { name?: unknown; position?: unknown };
    if (!DIVIDER_NAMES.includes(name as DividerName)) continue;
    if (typeof position !== "number" || !Number.isFinite(position)) continue;
    const clean = { name: name as DividerName, position: clampPosition(position, songCount) };
    const last = out[out.length - 1];
    if (last && last.name === clean.name && last.position === clean.position) continue;
    out.push(clean);
  }
  return out;
}

export type SetlistEntry<S> =
  | { kind: "divider"; name: DividerName }
  | { kind: "song"; song: S };

/**
 * Mezcla canciones y divisores en una sola lista ordenada. Una posición fuera
 * de rango (negativa, mayor que la cantidad de canciones o NaN) se acota en
 * vez de perder el divisor.
 */
export function mergeEntries<S>(songs: S[], dividers: SetlistDivider[]): SetlistEntry<S>[] {
  const entries: SetlistEntry<S>[] = [];
  const positioned = dividers.map((d) => ({
    name: d.name,
    pos: clampPosition(Number.isFinite(d.position) ? d.position : songs.length, songs.length),
  }));
  for (let pos = 0; pos <= songs.length; pos++) {
    for (const d of positioned) {
      if (d.pos === pos) entries.push({ kind: "divider", name: d.name });
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
    const raw = dot < 0 ? "" : part.slice(dot + 1).trim();
    // Number("") es 0: una posición vacía no tiene que convertirse en "al principio".
    return { name: dot < 0 ? "" : part.slice(0, dot), position: raw === "" ? NaN : Number(raw) };
  });
  return sanitizeDividers(items, songCount);
}
