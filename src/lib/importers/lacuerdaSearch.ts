export type LaCuerdaCandidate = { artistSlug: string; songSlug: string; url: string };

// Rango Unicode de los diacríticos combinables (0x0300-0x036f), construido con
// fromCharCode para no depender de pegar el caracter literal en el código fuente.
const DIACRITICS_RE = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  "g"
);

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Busca en el buscador real de LaCuerda (acordes.lacuerda.net/busca.php?exp=).
 * La página de resultados no lista los links directo: arma la lista con dos
 * arrays JS paralelos (`hds` = artistas, `fns` = canciones) que un script del
 * lado del cliente combina. Acá se leen esos mismos arrays del HTML.
 */
export async function searchLaCuerda(query: string): Promise<LaCuerdaCandidate[]> {
  const url = `https://acordes.lacuerda.net/busca.php?canc=0&exp=${encodeURIComponent(query)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CancioneroImporter/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const html = await res.text();

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
    if (!artistSlug || !songSlug) continue;
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
 * Solo acepta una coincidencia si el título normalizado es exactamente igual
 * al de la canción candidata: preferimos no encontrar nada a traer los
 * acordes de una canción distinta con nombre parecido.
 */
export function pickExactMatch(
  title: string,
  candidates: LaCuerdaCandidate[]
): LaCuerdaCandidate | null {
  const target = normalize(title);
  if (!target) return null;
  for (const candidate of candidates) {
    if (normalize(candidate.songSlug.replace(/_/g, " ")) === target) return candidate;
  }
  return null;
}
