// Armado de links y textos de la página pública de un power. Lógica pura (sin
// React ni base de datos) para poder probarla y usarla igual desde el servidor
// (página del power) y desde el cliente (visor, precarga sin conexión).

import { encodeDividers, type SetlistDivider } from "./dividers";

export type SongLinkContext = {
  /** Ids de las canciones del power, en orden. */
  ids: string[];
  /** Semitonos de cada canción (mismo orden que ids). */
  semitones?: number[];
  dividers?: SetlistDivider[];
};

/** Tope de URLs que se mandan al service worker para guardar sin conexión. */
export const MAX_PRECACHE_URLS = 120;

/**
 * Link a una canción dentro de un power: `forward` agrega la marca para que el
 * visor muestre la pantalla de la sección (solo al avanzar, no al volver).
 * Devuelve null si el índice no existe.
 */
export function songHref(ctx: SongLinkContext, index: number, forward = false): string | null {
  if (!Number.isInteger(index) || index < 0 || index >= ctx.ids.length) return null;
  const params = new URLSearchParams({ set: ctx.ids.join(","), i: String(index) });
  if (ctx.semitones) params.set("t", ctx.semitones.join(","));
  if (ctx.dividers && ctx.dividers.length > 0) params.set("d", encodeDividers(ctx.dividers));
  if (forward) params.set("s", "1");
  return `/canciones/${ctx.ids[index]}?${params}`;
}

/**
 * URLs que conviene guardar para usar el power sin conexión, en el orden del
 * power: cada canción tal como se abre desde la lista y avanzando, más su
 * dato en la API.
 */
export function buildPowerPrecacheUrls(ctx: SongLinkContext): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const add = (url: string | null) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  };
  ctx.ids.forEach((id, i) => {
    add(songHref(ctx, i));
    add(songHref(ctx, i, true));
    add(`/api/songs/${id}`);
  });
  return urls.slice(0, MAX_PRECACHE_URLS);
}

/** "2026-11-01" -> "domingo, 1 de noviembre de 2026" (es-AR). null si no es una fecha real. */
export function formatServiceDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  // new Date(Date.UTC(2026, 1, 31)) se corre a marzo: no es una fecha real.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Descripción corta para compartir el link: "5 canciones · domingo, 1 de noviembre de 2026". */
export function powerDescription(songCount: number, serviceDate?: string | null): string {
  const count =
    songCount === 0
      ? "Sin canciones todavía"
      : `${songCount} ${songCount === 1 ? "canción" : "canciones"}`;
  const date = formatServiceDate(serviceDate);
  return date ? `${count} · ${date}` : count;
}
