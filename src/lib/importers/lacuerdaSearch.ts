import { normalizeTitle as normalize } from "@/lib/text";
import { fetchHtml, NetworkImportError, type FetchOptions } from "@/lib/importers/shared";

/** Debajo de este parecido entre la letra actual y la de LaCuerda se asume que es otra canción. */
export const MIN_LYRICS_SIMILARITY = 0.45;

export type LaCuerdaCandidate = { artistSlug: string; songSlug: string; url: string };

/** Extrae los candidatos del HTML de la página de resultados (separado para poder testearlo). */
export function parseSearchResults(html: string): LaCuerdaCandidate[] {
  const hdsMatch = html.match(/var hds\s*=\s*\[(.*?)\];/);
  const fnsMatch = html.match(/var fns\s*=\s*\[(.*?)\];/);
  if (!hdsMatch || !fnsMatch) return [];

  const parseArray = (raw: string): string[] =>
    Array.from(raw.matchAll(/'([^']*)'/g)).map((m) => m[1]);

  const artists = parseArray(hdsMatch[1]);
  const songSlugs = parseArray(fnsMatch[1]);

  const seen = new Set<string>();
  const candidates: LaCuerdaCandidate[] = [];
  const len = Math.min(artists.length, songSlugs.length);
  for (let i = 0; i < len; i++) {
    const artistSlug = artists[i];
    const songSlug = songSlugs[i];
    // Los slugs van a parar a una URL: solo caracteres de slug.
    if (!artistSlug || !songSlug) continue;
    if (!/^[\w.-]+$/.test(artistSlug) || !/^[\w.-]+$/.test(songSlug)) continue;
    const key = `${artistSlug}/${songSlug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      artistSlug,
      songSlug,
      url: `https://acordes.lacuerda.net/${artistSlug}/${songSlug}`,
    });
  }
  return candidates;
}

/**
 * Busca en el buscador real de LaCuerda (acordes.lacuerda.net/busca.php?exp=).
 * La página de resultados no lista los links directo: arma la lista con dos
 * arrays JS paralelos (`hds` = artistas, `fns` = canciones) que un script del
 * lado del cliente combina. Acá se leen esos mismos arrays del HTML.
 *
 * Devuelve [] si la búsqueda anduvo pero no hay resultados; si LaCuerda no
 * respondió después de los reintentos lanza NetworkImportError (no es lo mismo
 * "no hay" que "no pudimos preguntar").
 */
export async function searchLaCuerda(
  query: string,
  opts: FetchOptions & { retryDelayMs?: number } = {}
): Promise<LaCuerdaCandidate[]> {
  const url = `https://acordes.lacuerda.net/busca.php?canc=0&exp=${encodeURIComponent(query)}`;

  // LaCuerda a veces tarda o corta la conexión sin motivo aparente; un solo
  // intento fallido no debería dejar una canción sin acordes para siempre.
  let html: string | null = null;
  for (let attempt = 0; attempt < 3 && html === null; attempt++) {
    try {
      html = await fetchHtml(url, opts);
    } catch {
      // reintenta
    }
    if (html === null && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, opts.retryDelayMs ?? 600));
    }
  }
  if (html === null) throw new NetworkImportError("LaCuerda no respondió.");

  return parseSearchResults(html);
}

// Artículos que se ignoran al comparar nombres de artista ("Los Hijos de...").
const ARTIST_ARTICLES = new Set(["el", "la", "los", "las", "the"]);

function artistKey(name: string): string {
  return normalize(name)
    .split(" ")
    .filter((w) => w && !ARTIST_ARTICLES.has(w))
    .join("");
}

/**
 * ¿El artista de la canción es el del slug de LaCuerda ("marcos_witt")?
 * Tolera tildes, guiones/guiones bajos, mayúsculas y artículos iniciales. Si
 * el artista trae varios ("Hillsong, Brooke Fraser" o "A & B"), alcanza con
 * que coincida uno.
 */
export function artistMatchesSlug(artist: string, artistSlug: string): boolean {
  const slugKey = artistKey(artistSlug.replace(/[_-]+/g, " "));
  if (!slugKey) return false;
  const parts = [artist, ...artist.split(/\s*(?:,|\/|&|\sy\s|\sfeat\.?\s|\sft\.?\s|\scon\s)\s*/i)];
  return parts.some((p) => artistKey(p) === slugKey);
}

export type MatchReason = "ok" | "no-candidates" | "no-exact-title" | "artist-mismatch" | "ambiguous";

export type MatchResult =
  | { candidate: LaCuerdaCandidate; reason: "ok" }
  | { candidate: null; reason: Exclude<MatchReason, "ok"> };

/**
 * Elige el resultado de LaCuerda que corresponde a la canción, o explica por
 * qué no hay ninguno. Preferimos no encontrar nada a traer los acordes de otra
 * canción con el mismo nombre ("Santo", "Aleluya", "Digno"...):
 *  - el título normalizado tiene que ser exactamente igual;
 *  - si la canción tiene artista, el slug del artista tiene que coincidir;
 *  - si no tiene artista, solo se acepta cuando hay un único candidato con ese título.
 */
export function pickMatch(
  song: { title: string; artist?: string | null },
  candidates: LaCuerdaCandidate[]
): MatchResult {
  if (candidates.length === 0) return { candidate: null, reason: "no-candidates" };
  const target = normalize(song.title);
  if (!target) return { candidate: null, reason: "no-exact-title" };

  const sameTitle = candidates.filter(
    (c) => normalize(c.songSlug.replace(/_/g, " ")) === target
  );
  if (sameTitle.length === 0) return { candidate: null, reason: "no-exact-title" };

  const artist = song.artist?.trim();
  if (artist) {
    const byArtist = sameTitle.find((c) => artistMatchesSlug(artist, c.artistSlug));
    return byArtist
      ? { candidate: byArtist, reason: "ok" }
      : { candidate: null, reason: "artist-mismatch" };
  }

  if (sameTitle.length === 1) return { candidate: sameTitle[0], reason: "ok" };
  return { candidate: null, reason: "ambiguous" };
}
