import type { AnyNode } from "domhandler";
import type { Cheerio, CheerioAPI } from "cheerio";

export type ImportedSong = {
  title: string;
  artist: string;
  originalKey: string;
  body: string;
};

export class ImportError extends Error {}

type ChordMark = { name: string; col: number };
type Line = { text: string; chords: ChordMark[] };

/**
 * Cifra Club y LaCuerda comparten el mismo formato clásico: cada acorde va en
 * su propio elemento inline, en una línea aparte, alineado por espacios justo
 * arriba de la letra. Esta función recorre el contenido de un bloque (un
 * `<pre>` o un `<div>` dentro de él) preservando el orden de texto/etiquetas,
 * separa por saltos de línea y devuelve una lista de líneas con la columna
 * exacta (en caracteres) donde cae cada acorde dentro de esa línea.
 */
export function extractLines(
  $: CheerioAPI,
  container: Cheerio<AnyNode>,
  isChordTag: (tagName: string) => boolean
): Line[] {
  const lines: Line[] = [];
  let curText = "";
  let curChords: ChordMark[] = [];

  const pushLine = () => {
    lines.push({ text: curText, chords: curChords });
    curText = "";
    curChords = [];
  };

  const walk = (node: AnyNode) => {
    if (node.type === "text") {
      let remaining = "data" in node ? (node.data as string) : "";
      while (remaining.includes("\n")) {
        const idx = remaining.indexOf("\n");
        curText += remaining.slice(0, idx);
        pushLine();
        remaining = remaining.slice(idx + 1);
      }
      curText += remaining;
      return;
    }
    if (node.type === "tag") {
      if (isChordTag(node.name)) {
        const chordName = $(node).text().trim();
        if (chordName) {
          curChords.push({ name: chordName, col: curText.length });
          curText += chordName;
        }
        return;
      }
      // Otras etiquetas (spans, negrita decorativa, etc.): entrar igual a sus hijos.
      for (const child of node.children ?? []) walk(child);
    }
  };

  for (const node of container.get()) walk(node as AnyNode);
  pushLine();
  return lines;
}

/**
 * Convierte la lista de líneas (acordes y letra intercalados) al formato
 * propio "[Acorde]letra": si una línea de solo acordes está seguida por una
 * línea de solo letra, las combina insertando cada acorde en la columna que
 * le corresponde. Si una línea de acordes queda sola (instrumental, sin
 * letra debajo), se listan los acordes entre corchetes separados por espacio.
 */
export function linesToBody(lines: Line[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];
    const nextIsPlainLyric =
      next && next.chords.length === 0 && next.text.trim().length > 0;

    if (line.chords.length > 0 && nextIsPlainLyric) {
      out.push(mergeChordsIntoLyric(line.chords, next.text));
      i += 2;
      continue;
    }

    if (line.chords.length > 0) {
      out.push(line.chords.map((c) => `[${c.name}]`).join(" "));
      i += 1;
      continue;
    }

    out.push(line.text);
    i += 1;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function mergeChordsIntoLyric(chords: ChordMark[], lyric: string): string {
  let result = "";
  let last = 0;
  for (const chord of chords) {
    const pos = Math.min(chord.col, lyric.length);
    result += lyric.slice(last, pos) + `[${chord.name}]`;
    last = pos;
  }
  result += lyric.slice(last);
  return result;
}

/** Primer acorde que aparece en el texto ya convertido: heurística de tono original. */
export function guessOriginalKey(body: string): string {
  const match = body.match(/\[([^\]]+)\]/);
  return match ? match[1] : "C";
}

export function slugToTitleCase(slug: string): string {
  return slug
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export async function fetchHtml(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CancioneroImporter/1.0)" },
    });
  } catch {
    throw new ImportError("No pudimos leer esa página.");
  }
  if (!res.ok) throw new ImportError("No pudimos leer esa página.");
  return res.text();
}
