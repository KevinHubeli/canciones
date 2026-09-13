import * as cheerio from "cheerio";
import {
  extractLines,
  fetchHtml,
  guessOriginalKey,
  linesToBody,
  slugToTitleCase,
  ImportError,
  type ImportedSong,
} from "@/lib/importers/shared";

export async function importFromCifraClub(url: string): Promise<ImportedSong> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const pre = $('pre[data-chord-content="true"]').first();
  if (pre.length === 0) {
    throw new ImportError("No pudimos leer esa página.");
  }

  const lines = extractLines($, pre, (tag) => tag === "b");
  const body = linesToBody(lines);
  if (!body.trim()) throw new ImportError("No pudimos leer esa página.");

  const { title, artist } = extractTitleArtist($, url);

  return { title, artist, originalKey: guessOriginalKey(body), body };
}

function extractTitleArtist(
  $: cheerio.CheerioAPI,
  url: string
): { title: string; artist: string } {
  // Cifra Club expone datos limpios en JSON-LD (schema.org), más confiable
  // que las clases CSS ofuscadas que usa el resto de la página.
  const scripts = $('script[type="application/ld+json"]')
    .map((_, el) => $(el).text())
    .get();

  let title = "";
  let artist = "";
  for (const raw of scripts) {
    try {
      const data = JSON.parse(raw);
      if (data["@type"] === "MusicComposition" && typeof data.name === "string") {
        title = data.name;
      }
      const types = Array.isArray(data["@type"]) ? data["@type"] : [data["@type"]];
      if (types.includes("MusicRecording") && data.byArtist?.name) {
        artist = data.byArtist.name;
      }
    } catch {
      // JSON-LD mal formado: se ignora, hay fallback abajo.
    }
  }

  if (title && artist) return { title, artist };

  // Fallback: <title>Título - Artista - Cifra Club</title>
  const pageTitle = $("title").first().text();
  const parts = pageTitle.split(" - ");
  if (parts.length >= 2) {
    return { title: title || parts[0].trim(), artist: artist || parts[1].trim() };
  }

  // Último fallback: derivar del slug de la URL (/artista/cancion/).
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  return {
    title: title || slugToTitleCase(segments[1] ?? "Sin título"),
    artist: artist || slugToTitleCase(segments[0] ?? "Desconocido"),
  };
}
