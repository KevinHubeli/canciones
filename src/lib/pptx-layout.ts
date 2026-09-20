import { parseSongLine, transposeChord } from "@/lib/chords";

export type Run = { text: string; options: { color: string; breakLine: boolean; bold?: boolean } };

export const CHORD_COLOR = "E4002B";
export const LYRIC_COLOR = "111111";

export const SLIDE_WIDTH_IN = 13.333;
export const SLIDE_HEIGHT_IN = 7.5;
export const MARGIN_X_IN = 0.5;
export const COL_GAP_IN = 0.5;
export const COL_TOP_IN = 0.95;
export const COL_HEIGHT_IN = 6.3;
export const COL_WIDTH_IN = (SLIDE_WIDTH_IN - MARGIN_X_IN * 2 - COL_GAP_IN) / 2;

export const LINE_HEIGHT_FACTOR = 1.25;
export const CHAR_WIDTH_FACTOR = 0.58; // ancho aproximado de un carácter en Courier New

export const COL_WIDTH_PT = COL_WIDTH_IN * 72;
export const COL_HEIGHT_PT = COL_HEIGHT_IN * 72;

// Fuente grande por defecto para canciones normales; para las muy largas se
// va bajando (hasta el piso) con tal de que entren en MAX_PAGES_PER_SONG
// hojas y, de ser posible, sin que ninguna línea se envuelva (si una línea
// se envuelve, el acorde de arriba y la letra de abajo dejan de alinear,
// porque cada uno es un párrafo que envuelve por su cuenta).
export const MAX_FONT_SIZE = 28;
export const MIN_FONT_SIZE = 12;
export const MAX_PAGES_PER_SONG = 2;

// Compatibilidad: tamaño "de referencia" para vistas previas simples.
export const FONT_SIZE = MAX_FONT_SIZE;
export const LINE_HEIGHT_PT = FONT_SIZE * LINE_HEIGHT_FACTOR;
export const CHAR_WIDTH_PT = FONT_SIZE * CHAR_WIDTH_FACTOR;
export const LINES_PER_COLUMN = linesPerColumnAt(FONT_SIZE);

/**
 * Convierte el texto de una canción ("[Am]Cantaré") en pares de líneas
 * chord/letra: el acorde va en su propia línea, ubicado (con espacios) en
 * la columna donde se toca sobre la palabra de abajo. Las líneas en blanco
 * del original se conservan como separador visual entre estrofas.
 */
export function buildRuns(body: string, semitones: number): Run[] {
  const runs: Run[] = [];
  for (const raw of body.split("\n")) {
    const { lyrics, chords } = parseSongLine(raw);
    if (chords.length > 0) {
      const named = chords.map((c) => ({ ...c, chord: transposeChord(c.chord, semitones) }));
      let chordLine: string;
      if (!lyrics.trim()) {
        // Línea solo de acordes (ej. intro): sin letra abajo para alinear,
        // así que no hace falta conservar los espacios anchos del original.
        chordLine = named.map((c) => c.chord).join(" ");
      } else {
        chordLine = "";
        for (const c of [...named].sort((a, b) => a.index - b.index)) {
          const target = Math.max(c.index, chordLine.length + (chordLine.length > 0 ? 1 : 0));
          chordLine += " ".repeat(target - chordLine.length) + c.chord;
        }
      }
      runs.push({ text: chordLine, options: { color: CHORD_COLOR, breakLine: true, bold: true } });
    }
    runs.push({ text: lyrics || " ", options: { color: LYRIC_COLOR, breakLine: true } });
  }
  return runs;
}

export function linesPerColumnAt(fontSize: number): number {
  const lineHeightPt = fontSize * LINE_HEIGHT_FACTOR;
  return Math.max(1, Math.floor(COL_HEIGHT_PT / lineHeightPt));
}

export function wrappedLineCountAt(text: string, fontSize: number): number {
  const charWidthPt = fontSize * CHAR_WIDTH_FACTOR;
  return Math.max(1, Math.ceil((text.length * charWidthPt) / COL_WIDTH_PT));
}

export function wrappedLineCount(text: string): number {
  return wrappedLineCountAt(text, FONT_SIZE);
}

/**
 * Reparte los runs de una canción en columnas de a lo sumo linesPerColumn
 * líneas (contando el wrap de las más largas), para un tamaño de fuente
 * dado. El contenido fluye de forma continua (como un diario a dos
 * columnas), sin recortar el tamaño de letra dentro de una misma canción.
 */
export function paginateColumnsAt(runs: Run[], fontSize: number): Run[][] {
  const linesPerColumn = linesPerColumnAt(fontSize);
  const columns: Run[][] = [];
  let current: Run[] = [];
  let currentLines = 0;

  for (const run of runs) {
    const lines = wrappedLineCountAt(run.text, fontSize);
    if (current.length > 0 && currentLines + lines > linesPerColumn) {
      columns.push(current);
      current = [];
      currentLines = 0;
    }
    current.push(run);
    currentLines += lines;
  }
  if (current.length > 0) columns.push(current);
  return columns.length > 0 ? columns : [[]];
}

export function paginateColumns(runs: Run[]): Run[][] {
  return paginateColumnsAt(runs, FONT_SIZE);
}

export function chunkPairs<T>(items: T[]): T[][] {
  const pairs: T[][] = [];
  for (let i = 0; i < items.length; i += 2) pairs.push(items.slice(i, i + 2));
  return pairs;
}

export type SongPage = { columns: Run[][]; index: number; count: number };
export type SongLayout = { fontSize: number; pages: SongPage[] };

/**
 * Elige el tamaño de letra más grande posible para una canción, respetando
 * dos reglas: (1) entra en como máximo MAX_PAGES_PER_SONG hojas, y (2), si
 * se puede, ninguna línea se envuelve (para no romper la alineación acorde↔
 * letra). Si ninguna combinación logra ambas cosas, se prioriza el límite
 * de hojas por sobre evitar el envolvido.
 */
export function pickFontSizeForSong(runs: Run[]): number {
  let bestWithinPages = MIN_FONT_SIZE;
  let foundWithinPages = false;

  for (let fontSize = MAX_FONT_SIZE; fontSize >= MIN_FONT_SIZE; fontSize--) {
    const columns = paginateColumnsAt(runs, fontSize);
    const pages = Math.ceil(columns.length / 2);
    if (pages > MAX_PAGES_PER_SONG) continue;

    if (!foundWithinPages) {
      foundWithinPages = true;
      bestWithinPages = fontSize;
    }

    const noWrap = runs.every((r) => wrappedLineCountAt(r.text, fontSize) === 1);
    if (noWrap) return fontSize;
  }

  return bestWithinPages;
}

/** Arma las páginas (de a 2 columnas) para una canción completa, con el
 * tamaño de letra más grande que respeta el máximo de hojas por canción. */
export function paginateSong(body: string, semitones: number): SongLayout {
  const runs = buildRuns(body, semitones);
  const fontSize = pickFontSizeForSong(runs);
  const columns = paginateColumnsAt(runs, fontSize);
  const pages = chunkPairs(columns);
  return {
    fontSize,
    pages: pages.map((cols, idx) => ({ columns: cols, index: idx, count: pages.length })),
  };
}
