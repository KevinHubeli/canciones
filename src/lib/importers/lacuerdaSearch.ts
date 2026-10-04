import { normalizeTitle as normalize } from "@/lib/text";
export type LaCuerdaCandidate = { artistSlug: string; songSlug: string; url: string };

/**
 * Busca en el buscador real de LaCuerda (acordes.lacuerda.net/busca.php?exp=).
 * La página de resultados no lista los links directo: arma la lista con dos
 * arrays JS paralelos (`hds` = artistas, `fns` = canciones) que un script del
 * lado del cliente combina. Acá se leen esos mismos arrays del HTML.
 */
export async function searchLaCuerda(query: string): Promise<LaCuerdaCandidate[]> {
  const url = `https://acordes.lacuerda.net/busca.php?canc=0&exp=${encodeURIComponent(query)}`;

  // LaCuerda a veces tarda o corta la conexión sin motivo aparente; un solo
  // intento fallido no debería dejar una canción sin acordes para siempre.
  let html: string | null = null;
  for (let attempt = 0; attempt < 3 && html === null; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; CancioneroImporter/1.0)" },
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) html = await res.text();
    } catch {
      // reintenta
    }
    if (html === null && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }
  if (html === null) return [];

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
