import {
  normalizePlainChordLines,
  parseSongLine,
  toEnglishNotation,
  transposeChord,
  type ParsedChord,
} from "@/lib/chords";

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
export const CHAR_WIDTH_FACTOR = 0.6; // Courier New: cada carácter ocupa exactamente 0,6 del tamaño de letra

// Un cuadro de texto de PowerPoint deja 0,1" a cada lado y 0,05" arriba y abajo
// antes de empezar a escribir: ese espacio no se puede usar.
export const TEXT_INSET_X_IN = 0.1;
export const TEXT_INSET_Y_IN = 0.05;
export const COL_WIDTH_PT = (COL_WIDTH_IN - TEXT_INSET_X_IN * 2) * 72;
export const COL_HEIGHT_PT = (COL_HEIGHT_IN - TEXT_INSET_Y_IN * 2) * 72;

// Fuente grande por defecto para canciones normales; para las muy largas se
// va bajando (hasta el piso) con tal de que entren en MAX_PAGES_PER_SONG
// hojas y, de ser posible, sin que ninguna línea se envuelva (si una línea
// se envuelve, el acorde de arriba y la letra de abajo dejan de alinear,
// porque cada uno es un párrafo que envuelve por su cuenta).
export const MAX_FONT_SIZE = 28;
export const MIN_FONT_SIZE = 12;
// Lo normal es que una canción entre en 2 hojas. Si para eso la letra tendría
// que quedar más chica que COMFORTABLE_FONT_SIZE, se permite una tercera hoja
// (hasta MAX_PAGES_PER_SONG) antes que achicar la letra.
export const PREFERRED_PAGES_PER_SONG = 2;
export const MAX_PAGES_PER_SONG = 3;
export const COMFORTABLE_FONT_SIZE = 16;

// Compatibilidad: tamaño "de referencia" para vistas previas simples.
export const FONT_SIZE = MAX_FONT_SIZE;
export const LINE_HEIGHT_PT = FONT_SIZE * LINE_HEIGHT_FACTOR;
export const CHAR_WIDTH_PT = FONT_SIZE * CHAR_WIDTH_FACTOR;
export const LINES_PER_COLUMN = linesPerColumnAt(FONT_SIZE);

// Las líneas de letra más largas que esto se cortan al medio (en el espacio
// más cercano a la mitad, para no partir una palabra) antes de armar el par
// acorde/letra. Sin este corte, una línea muy larga termina envolviéndose
// sola dentro de la columna y el acorde de arriba (que es un párrafo aparte)
// se desalinea de la palabra que le corresponde.
const MAX_LINE_CHARS = 48;

/** Inversa de parseSongLine: vuelve a poner los "[Acorde]" en su lugar. */
function reconstructRawLine(lyrics: string, chords: ParsedChord[]): string {
  let raw = "";
  let cursor = 0;
  for (const c of [...chords].sort((a, b) => a.index - b.index)) {
    raw += lyrics.slice(cursor, c.index) + `[${c.chord}]`;
    cursor = c.index;
  }
  raw += lyrics.slice(cursor);
  return raw;
}

/**
 * Si la letra de una línea supera MAX_LINE_CHARS, la corta en dos en el
 * espacio más cercano a la mitad (sin partir palabras), repartiendo los
 * acordes según a qué mitad les toca y reindexándolos. Se aplica de forma
 * recursiva por si alguna mitad sigue siendo demasiado larga.
 */
function splitLongRawLine(raw: string, maxChars = MAX_LINE_CHARS): string[] {
  const { lyrics, chords } = parseSongLine(raw);
  if (lyrics.length <= maxChars) return [raw];

  const mid = Math.floor(lyrics.length / 2);
  let splitAt = -1;
  for (let offset = 0; offset < lyrics.length; offset++) {
    const left = mid - offset;
    const right = mid + offset;
    if (left > 0 && lyrics[left] === " ") {
      splitAt = left;
      break;
    }
    if (right < lyrics.length && lyrics[right] === " ") {
      splitAt = right;
      break;
    }
  }
  if (splitAt === -1) splitAt = mid; // no hay ningún espacio: corte a la fuerza (caso raro)

  const firstLyricsRaw = lyrics.slice(0, splitAt);
  const secondLyricsRaw = lyrics.slice(splitAt);
  const firstLyrics = firstLyricsRaw.trimEnd();
  const secondLyrics = secondLyricsRaw.trimStart();
  const trimmedLeadingSpaces = secondLyricsRaw.length - secondLyrics.length;

  const firstChords = chords.filter((c) => c.index <= splitAt);
  const secondChords = chords
    .filter((c) => c.index > splitAt)
    .map((c) => ({ ...c, index: Math.max(0, c.index - splitAt - trimmedLeadingSpaces) }));

  const firstRaw = reconstructRawLine(firstLyrics, firstChords);
  const secondRaw = reconstructRawLine(secondLyrics, secondChords);

  return [...splitLongRawLine(firstRaw, maxChars), ...splitLongRawLine(secondRaw, maxChars)];
}

/**
 * Convierte el texto de una canción ("[Am]Cantaré") en bloques: cada bloque
 * es un par acorde/letra (el acorde va en su propia línea, ubicado con
 * espacios sobre la palabra de abajo) o una línea suelta. Las líneas en
 * blanco del original quedan como bloques vacíos (separador entre estrofas).
 * Las líneas de letra muy largas se cortan al medio (ver splitLongRawLine).
 * Un bloque nunca se parte al paginar: el acorde siempre queda con su letra.
 */
export function buildBlocks(body: string, semitones: number, maxChars = MAX_LINE_CHARS): Run[][] {
  const blocks: Run[][] = [];
  for (const originalRaw of normalizePlainChordLines(body)) {
    for (const raw of splitLongRawLine(originalRaw, maxChars)) {
      const { lyrics, chords } = parseSongLine(raw);
      const block: Run[] = [];
      if (chords.length > 0) {
        const named = chords.map((c) => ({ ...c, chord: transposeChord(toEnglishNotation(c.chord), semitones) }));
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
        block.push({ text: chordLine, options: { color: CHORD_COLOR, breakLine: true, bold: true } });
      }
      if (lyrics.trim() || chords.length === 0) {
        block.push({ text: lyrics || " ", options: { color: LYRIC_COLOR, breakLine: true } });
      }
      blocks.push(block);
    }
  }
  return blocks;
}

export function buildRuns(body: string, semitones: number, maxChars = MAX_LINE_CHARS): Run[] {
  return buildBlocks(body, semitones, maxChars).flat();
}

function isBlankBlock(block: Run[]): boolean {
  return block.length === 1 && !block[0].text.trim();
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

function blockLinesAt(block: Run[], fontSize: number): number {
  return block.reduce((sum, r) => sum + wrappedLineCountAt(r.text, fontSize), 0);
}

/**
 * Reparte los bloques de una canción en columnas de a lo sumo
 * linesPerColumn líneas (contando el wrap de las más largas), para un tamaño
 * de fuente dado. El contenido fluye de forma continua (como un diario a dos
 * columnas), pero un bloque (acorde + su letra) nunca se parte entre
 * columnas. Las líneas en blanco no se dejan ni al principio ni al final de
 * una columna.
 */
export function paginateBlocksAt(blocks: Run[][], fontSize: number): Run[][] {
  const linesPerColumn = linesPerColumnAt(fontSize);
  const columns: Run[][][] = [];
  let current: Run[][] = [];
  let currentLines = 0;

  const closeColumn = () => {
    while (current.length > 0 && isBlankBlock(current[current.length - 1])) current.pop();
    if (current.length > 0) columns.push(current);
    current = [];
    currentLines = 0;
  };

  for (const block of blocks) {
    const blank = isBlankBlock(block);
    if (blank && current.length === 0) continue;
    const lines = blockLinesAt(block, fontSize);
    if (current.length > 0 && currentLines + lines > linesPerColumn) {
      closeColumn();
      if (blank) continue;
    }
    current.push(block);
    currentLines += lines;
  }
  closeColumn();
  return columns.length > 0 ? columns.map((c) => c.flat()) : [[]];
}

export function chunkPairs<T>(items: T[]): T[][] {
  const pairs: T[][] = [];
  for (let i = 0; i < items.length; i += 2) pairs.push(items.slice(i, i + 2));
  return pairs;
}

export type SongPage = { columns: Run[][]; index: number; count: number };
export type SongLayout = {
  fontSize: number;
  /** Largo máximo (en caracteres) con el que se cortaron las líneas de letra. */
  maxChars: number;
  pages: SongPage[];
};

/** Cuántos caracteres de Courier New entran en el ancho de una columna a ese tamaño. */
export function charsPerLineAt(fontSize: number): number {
  return Math.max(8, Math.floor(COL_WIDTH_PT / (fontSize * CHAR_WIDTH_FACTOR)));
}

type Candidate = { fontSize: number; maxChars: number; blocks: Run[][]; columns: Run[][]; pages: number };

function candidateAt(body: string, semitones: number, fontSize: number, maxChars: number): Candidate {
  const blocks = buildBlocks(body, semitones, maxChars);
  const columns = paginateBlocksAt(blocks, fontSize);
  return { fontSize, maxChars, blocks, columns, pages: Math.ceil(columns.length / 2) };
}

const noWrapAt = (c: Candidate) =>
  c.blocks.every((block) => block.every((r) => wrappedLineCountAt(r.text, c.fontSize) === 1));

/**
 * Elige el tamaño de letra más grande que se pueda leer cómodo, en este orden:
 *  1. Con las líneas como vienen (solo se cortan las de más de 48 caracteres),
 *     sin que ninguna se envuelva, en 2 hojas y sin bajar de COMFORTABLE_FONT_SIZE.
 *  2. Si no, cortando las líneas largas según el tamaño de letra (así una
 *     línea de 45 caracteres no obliga a usar letra chica). Se prefiere el
 *     tamaño más grande que no pase del doble de renglones que el original
 *     (primero en 2 hojas y recién después en 3); si ni así entra, sin ese límite.
 *  3. Como último recurso, letra más chica (hasta MIN_FONT_SIZE), en 3 hojas.
 * Cortar una línea la parte en dos renglones; el acorde queda con su pedazo de letra.
 */
const SPLIT_GROWTH_STEPS = [2, Infinity];

function chooseLayout(body: string, semitones: number): Candidate {
  const fontSizes = (from: number, to: number) =>
    Array.from({ length: Math.max(0, from - to + 1) }, (_, i) => from - i);

  // 1) líneas intactas
  for (const fontSize of fontSizes(MAX_FONT_SIZE, COMFORTABLE_FONT_SIZE)) {
    const c = candidateAt(body, semitones, fontSize, MAX_LINE_CHARS);
    if (c.pages <= PREFERRED_PAGES_PER_SONG && noWrapAt(c)) return c;
  }

  // 2) cortando según el tamaño de letra
  const originalLines = Math.max(1, buildBlocks(body, semitones, Infinity).length);
  const comfortable = fontSizes(MAX_FONT_SIZE, COMFORTABLE_FONT_SIZE).map((fontSize) =>
    candidateAt(body, semitones, fontSize, charsPerLineAt(fontSize))
  );
  for (const growth of SPLIT_GROWTH_STEPS) {
    for (const maxPages of [PREFERRED_PAGES_PER_SONG, MAX_PAGES_PER_SONG]) {
      const found = comfortable.find(
        (c) => c.pages <= maxPages && c.blocks.length / originalLines <= growth
      );
      if (found) return found;
    }
  }

  // 3) letra más chica
  let last = comfortable[comfortable.length - 1];
  for (const fontSize of fontSizes(COMFORTABLE_FONT_SIZE - 1, MIN_FONT_SIZE)) {
    const c = candidateAt(body, semitones, fontSize, charsPerLineAt(fontSize));
    if (c.pages <= MAX_PAGES_PER_SONG) return c;
    last = c;
  }
  return last;
}

/** Arma las páginas (de a 2 columnas) para una canción completa, con el
 * tamaño de letra más grande que respeta el máximo de hojas por canción. */
export function paginateSong(body: string, semitones: number): SongLayout {
  const { fontSize, maxChars, columns } = chooseLayout(body, semitones);
  const pages = chunkPairs(columns);
  return {
    fontSize,
    maxChars,
    pages: pages.map((cols, idx) => ({ columns: cols, index: idx, count: pages.length })),
  };
}
