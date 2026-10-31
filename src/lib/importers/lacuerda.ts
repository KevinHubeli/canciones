import * as cheerio from "cheerio";
import {
  extractLines,
  fetchHtml,
  guessOriginalKey,
  linesToBody,
  slugToTitleCase,
  fixCase,
  titleCase,
  ImportError,
  type ImportedSong,
} from "@/lib/importers/shared";

/** Parsea el HTML de una página de LaCuerda (separado de la descarga para poder testearlo). */
export function parseLaCuerdaHtml(html: string, url: string): ImportedSong {
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

  // LaCuerda no informa el tono en la página: se estima con los acordes.
  return { title, artist, originalKey: guessOriginalKey(body), body };
}

export async function importFromLaCuerda(url: string): Promise<ImportedSong> {
  const html = await fetchHtml(url);
  return parseLaCuerdaHtml(html, url);
}

function extractTitleArtist(
  $: cheerio.CheerioAPI,
  url: string
): { title: string; artist: string } {
  const segments = new URL(url).pathname.split("/").filter(Boolean);

  // El encabezado de la canción es el dato más limpio y conserva las tildes:
  // <h1>Renuévame <br><a>Marcos Witt</a></h1>.
  const h1 = $("#r_head h1, h1").first();
  const h1Artist = h1.find("a").first().text().trim();
  const h1Clone = h1.clone();
  h1Clone.find("a").remove();
  const h1Title = h1Clone.text().replace(/\s+/g, " ").trim();

  // Fallback: og:title ("CANCIÓN: Acordes y letra...", a veces en mayúsculas).
  const ogTitle = $('meta[property="og:title"]').attr("content") ?? "";
  const ogName = ogTitle.split(":")[0]?.trim();

  const title = h1Title
    ? fixCase(h1Title)
    : ogName
      ? fixCase(ogName)
      : titleCase((segments[1] ?? "Sin título").replace(/[_-]+/g, " "));
  const artist = h1Artist ? fixCase(h1Artist, { smallWords: false }) : slugToTitleCase(segments[0] ?? "Desconocido");

  return { title, artist };
}
