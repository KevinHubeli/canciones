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

export async function importFromLaCuerda(url: string): Promise<ImportedSong> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  // LaCuerda puede tener varias versiones (distintos capos/afinaciones) en la
  // misma página, cada una en su propio <pre>: se toma la primera.
  const pre = $("pre").first();
  if (pre.length === 0) {
    throw new ImportError("No pudimos leer esa página.");
  }

  const lines = extractLines($, pre, (tag) => tag === "a");
  const body = linesToBody(lines);
  if (!body.trim()) throw new ImportError("No pudimos leer esa página.");

  const { title, artist } = extractTitleArtist($, url);

  return { title, artist, originalKey: guessOriginalKey(body), body };
}

function extractTitleArtist(
  $: cheerio.CheerioAPI,
  url: string
): { title: string; artist: string } {
  // LaCuerda no expone JSON-LD; el título limpio sale del og:title
  // ("CANCIÓN: Acordes y letra..."), el artista del slug de la URL.
  const ogTitle = $('meta[property="og:title"]').attr("content") ?? "";
  const title = ogTitle.split(":")[0]?.trim();

  const segments = new URL(url).pathname.split("/").filter(Boolean);
  const artist = slugToTitleCase(segments[0] ?? "Desconocido");

  return {
    title: title ? slugToTitleCase(title.toLowerCase()) : slugToTitleCase(segments[1] ?? "Sin título"),
    artist,
  };
}
