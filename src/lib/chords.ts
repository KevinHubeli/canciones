export type ParsedChord = { index: number; chord: string };
export type ParsedLine = { lyrics: string; chords: ParsedChord[] };

const CHORD_TAG_RE = /\[([^\]]+)\]/g;
const ROOT_RE = /^([A-G])(#|b)?(.*)$/;

/**
 * Separa una línea con acordes entre corchetes ("[Dm]Cantare a [Gm]Jehová")
 * en la letra sin corchetes y la posición (en esa letra) de cada acorde.
 * `index` queda ligado a la letra, no al string original: por eso transponer
 * o cambiar de notación nunca desalinea nada, solo cambia el texto del acorde.
 */
export function parseSongLine(raw: string): ParsedLine {
  const chords: ParsedChord[] = [];
  let lyrics = "";
  let lastIndex = 0;
  CHORD_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CHORD_TAG_RE.exec(raw))) {
    lyrics += raw.slice(lastIndex, match.index);
    chords.push({ index: lyrics.length, chord: match[1] });
    lastIndex = CHORD_TAG_RE.lastIndex;
  }
  lyrics += raw.slice(lastIndex);
  return { lyrics, chords };
}

const CHROMATIC = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

const CHROMATIC_FLATS = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

const FLAT_TO_SHARP: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
  Cb: "B",
  Fb: "E",
  "E#": "F",
  "B#": "C",
};

/**
 * Transpone un acorde N semitonos. Soporta acordes con bajo alterado tipo
 * "D/F#" (transpone las dos partes). Por defecto el resultado se escribe con
 * sostenidos; con `flats: true` se escribe con bemoles (Eb, Ab, Bb...), que es
 * como lo lee quien toca en un tono bemol (ver prefersFlats).
 * Si el string no matchea el patrón de un acorde, se devuelve tal cual.
 */
export function transposeChord(chord: string, semitones: number, flats?: boolean): string {
  if (semitones === 0) return chord;

  const slashIndex = chord.indexOf("/");
  if (slashIndex !== -1) {
    const top = chord.slice(0, slashIndex);
    const bass = chord.slice(slashIndex + 1);
    return `${transposeChord(top, semitones, flats)}/${transposeChord(bass, semitones, flats)}`;
  }

  const match = chord.match(ROOT_RE);
  if (!match) return chord;
  const [, letter, accidental, suffix] = match;
  const rootName = letter + (accidental ?? "");
  const normalized = FLAT_TO_SHARP[rootName] ?? rootName;
  const idx = CHROMATIC.indexOf(normalized as (typeof CHROMATIC)[number]);
  if (idx === -1) return chord;

  const newIdx = ((idx + semitones) % 12 + 12) % 12;
  return (flats ? CHROMATIC_FLATS : CHROMATIC)[newIdx] + suffix;
}

// Tonos que se escriben con bemoles. Mayores: F, Bb, Eb, Ab, Db (y Gb/F# según
// cómo venga escrito). Menores (relativos): Dm, Gm, Cm, Fm, Bbm, Ebm.
const FLAT_MAJOR_KEYS = new Set([5, 10, 3, 8, 1]);
const FLAT_MINOR_KEYS = new Set([2, 7, 0, 5, 10, 3]);
const NATURAL_PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * ¿El tono resultante (el tono original transpuesto `semitones`) se escribe
 * con bemoles? Sirve para mostrar Ab/Bb/Eb en vez de G#/A#/D# a quien toca en
 * esos tonos. `originalKey` acepta notación inglesa o latina ("Bb", "Sib",
 * "Dm", "Solm"). Si no se reconoce el tono, devuelve false (sostenidos).
 * Sin transponer se respeta cómo está escrito el tono original (Gb vs F#);
 * transpuesto, el tono de 6 alteraciones se escribe con sostenidos.
 */
export function prefersFlats(originalKey: string, semitones: number): boolean {
  const match = toEnglishNotation((originalKey ?? "").trim()).match(ROOT_RE);
  if (!match) return false;
  const [, letter, accidental, rest] = match;
  const pitch = NATURAL_PITCH[letter] + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);
  const minor = /^(?:min|m(?!aj))/.test(rest);
  if (semitones % 12 === 0 && accidental) return accidental === "b";
  const target = (((pitch + semitones) % 12) + 12) % 12;
  return (minor ? FLAT_MINOR_KEYS : FLAT_MAJOR_KEYS).has(target);
}

/**
 * Columnas de los acordes de una línea, de modo que dos acordes cercanos no se
 * pisen: cada uno arranca como mínimo `gap` caracteres después del final del
 * anterior. Si no hay choque, la columna es el `index` original (queda
 * alineado con la letra). Es la misma regla que usa el PPTX.
 */
export function layoutChordColumns<T extends { index: number; label: string }>(
  chords: T[],
  gap = 1
): (T & { col: number })[] {
  const sorted = [...chords].sort((a, b) => a.index - b.index);
  const out: (T & { col: number })[] = [];
  let nextFree = 0;
  for (const c of sorted) {
    const col = Math.max(c.index, nextFree);
    out.push({ ...c, col });
    nextFree = col + c.label.length + gap;
  }
  return out;
}

/**
 * Acorde que hay que tocar con la cejilla en el traste `capo` para que suene el
 * original. Acepta notación inglesa o latina y devuelve inglesa.
 */
export function capoChord(chord: string, capo: number, flats?: boolean): string {
  return transposeChord(toEnglishNotation(chord), -capo, flats);
}

// Acordes "fáciles" en guitarra: los abiertos de siempre.
const OPEN_CHORD_NAMES = new Set(["A", "Am", "C", "D", "Dm", "E", "Em", "G"]);

/** ¿Se toca con una forma abierta? (A, Am, C, D, Dm, E, Em, G; con 7, sus, add... también cuenta; dim/aug no.) */
function isOpenShapeChord(chord: string): boolean {
  const top = toEnglishNotation(chord.split("/")[0].trim());
  const m = top.match(ROOT_RE);
  if (!m || m[2]) return false;
  const rest = m[3];
  if (/dim|aug|b5|#5|°|ø|\+/.test(rest)) return false;
  const minor = /^(?:min|m(?!aj))/.test(rest);
  return OPEN_CHORD_NAMES.has(m[1] + (minor ? "m" : ""));
}

/**
 * Sugiere en qué traste poner la cejilla (0 a 7) para que los acordes queden
 * lo más fáciles posible: elige el capo que maximiza la cantidad de acordes
 * abiertos (A, Am, C, D, Dm, E, Em, G). Cada elemento de `chords` cuenta una
 * vez, así que si pasás la lista completa (con repeticiones) pesa más lo que
 * más se toca. Ante un empate gana el capo más bajo (0 = sin cejilla).
 */
export function suggestCapo(chords: string[]): number {
  let best = 0;
  let bestScore = -1;
  for (let capo = 0; capo <= 7; capo++) {
    const score = chords.reduce((n, c) => n + (isOpenShapeChord(capoChord(c, capo)) ? 1 : 0), 0);
    if (score > bestScore) {
      best = capo;
      bestScore = score;
    }
  }
  return best;
}

const EN_TO_LATIN: Record<string, string> = {
  C: "Do",
  D: "Re",
  E: "Mi",
  F: "Fa",
  G: "Sol",
  A: "La",
  B: "Si",
};

const LATIN_ENTRIES = Object.entries(EN_TO_LATIN)
  .map(([en, latin]) => [latin, en] as const)
  .sort((a, b) => b[0].length - a[0].length); // "Sol" (3) antes que "Do"/"Re"/... (2)

/** Cambia solo la raíz del acorde a notación latina (Do, Re, Mi...); el sufijo queda igual. */
export function toLatinNotation(chord: string): string {
  const slashIndex = chord.indexOf("/");
  if (slashIndex !== -1) {
    return `${toLatinNotation(chord.slice(0, slashIndex))}/${toLatinNotation(
      chord.slice(slashIndex + 1)
    )}`;
  }
  const match = chord.match(ROOT_RE);
  if (!match) return chord;
  const [, letter, accidental, suffix] = match;
  return EN_TO_LATIN[letter] + (accidental ?? "") + suffix;
}

// Lo que puede seguir a una raíz latina en un acorde real: nada, alteración,
// número, paréntesis, o una calidad (m, maj, dim, aug, sus, add...). Sirve para
// no confundir "Fadd9" (inglés: F + add9) con "Fa" + "dd9".
const LATIN_SUFFIX_RE = /^(?:$|[#b0-9(+°ø-]|m|maj|min|dim|aug|sus|add)/i;

/**
 * Inverso de toLatinNotation: acepta un acorde en notación latina o inglesa y devuelve inglesa.
 * Una raíz latina (Do, Re, Mi, Fa, Sol, La, Si, también en mayúsculas) solo se
 * toma como tal si lo que sigue tiene forma de acorde: "Fa", "Fa#", "Fam",
 * "Fa7", "Lasus4" son latinos; "Fadd9", "Faug" son inglés (F + add9 / aug).
 */
export function toEnglishNotation(chord: string): string {
  const slashIndex = chord.indexOf("/");
  if (slashIndex !== -1) {
    return `${toEnglishNotation(chord.slice(0, slashIndex))}/${toEnglishNotation(
      chord.slice(slashIndex + 1)
    )}`;
  }
  for (const [latin, en] of LATIN_ENTRIES) {
    // También en mayúsculas ("SOL#", "DOm", "LA"), como vienen en algunas intros.
    if (chord.startsWith(latin) || chord.startsWith(latin.toUpperCase())) {
      const rest = chord.slice(latin.length);
      if (LATIN_SUFFIX_RE.test(rest)) return en + rest;
    }
  }
  return chord; // ya está en inglés o no se reconoce
}

export type ChordNotation = "en" | "latin";

/**
 * Acorde listo para mostrar: transpuesto y en la notación elegida. Con
 * `originalKey` (el tono original de la canción) los tonos con bemoles se
 * escriben con bemoles (Bb, Eb, Ab); sin él se usan sostenidos como siempre.
 */
export function displayChord(
  chord: string,
  semitones: number,
  notation: ChordNotation,
  originalKey?: string
): string {
  const flats = originalKey ? prefersFlats(originalKey, semitones) : undefined;
  const transposed = transposeChord(toEnglishNotation(chord), semitones, flats);
  return notation === "latin" ? toLatinNotation(transposed) : transposed;
}

export type WrappedRow<T extends { index: number; label: string }> = {
  lyrics: string;
  chords: T[];
};

/**
 * Corta una línea (letra + acordes ya resueltos con su texto a mostrar) en
 * varias filas para que ninguna supere `maxChars`, en vez de desbordar el
 * ancho de pantalla. Corta por palabra cuando puede; los acordes viajan con
 * la fila que les corresponde y su `index` se reajusta al nuevo inicio.
 */
export function wrapLine<T extends { index: number; label: string }>(
  lyrics: string,
  chords: T[],
  maxChars: number
): WrappedRow<T>[] {
  // Ancho real de la fila de acordes: si dos están pegados, el segundo se corre.
  const neededWidth = layoutChordColumns(chords).reduce(
    (max, c) => Math.max(max, c.col + c.label.length),
    lyrics.length
  );
  if (maxChars <= 0 || neededWidth <= maxChars) {
    return [{ lyrics, chords }];
  }

  const rows: WrappedRow<T>[] = [];
  const len = lyrics.length;
  let start = 0;
  for (;;) {
    let end = Math.min(start + maxChars, len);
    const isLast = end >= len;
    if (!isLast) {
      const lastSpace = lyrics.lastIndexOf(" ", end - 1);
      if (lastSpace > start) end = lastSpace + 1;
    }
    if (end <= start) end = Math.min(start + maxChars, len);

    rows.push({
      lyrics: lyrics.slice(start, end),
      // La última fila se queda con cualquier acorde que sobre (ej. uno
      // colgado justo después del último carácter de la letra).
      chords: chords
        .filter((c) => c.index >= start && (isLast || c.index < end))
        .map((c) => ({ ...c, index: c.index - start })),
    });

    if (isLast) break;
    start = end;
  }
  return rows;
}

// Un token de acorde en texto plano: raíz, calidad (m, maj7, sus4, dim...),
// extensiones y bajo opcional ("D/F#").
const PLAIN_CHORD_RE =
  /^(?:[A-G]|Do|Re|Mi|Fa|Sol|La|Si)(#|b)?(maj|min|m|M|dim|aug|sus|add)?\d{0,2}((sus|add|maj)?\d{1,2}|[#b]\d{1,2}|\([^)]*\))*(\/(?:[A-G]|Do|Re|Mi|Fa|Sol|La|Si)(#|b)?)?$/;

// Marcas de repetición que suelen acompañar a los acordes: "///Am ///", "|Am|", "(x4)".
const REPEAT_MARK_RE = /^(?:[\/|:\-–—]+|\(?x\d+\)?)$/i;

/** Separa las barras/pipes pegados al acorde: "///Am" => { pre: "///", core: "Am", post: "" }. */
function splitDecoration(token: string): { pre: string; core: string; post: string } {
  const m = token.match(/^([\/|:\-–—]*)(.*?)([\/|:\-–—]*)$/);
  return { pre: m?.[1] ?? "", core: m?.[2] ?? token, post: m?.[3] ?? "" };
}

function isPlainChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] === "") return false;
  let chords = 0;
  for (const t of tokens) {
    if (PLAIN_CHORD_RE.test(t)) {
      chords++;
      continue;
    }
    if (REPEAT_MARK_RE.test(t)) continue;
    const { core } = splitDecoration(t);
    if (core && PLAIN_CHORD_RE.test(core)) {
      chords++;
      continue;
    }
    return false;
  }
  return chords > 0;
}

/** ¿La línea de acordes trae marcas de repetición pegadas? (ej. "///Am ///") */
function hasDecoration(line: string): boolean {
  return line
    .trim()
    .split(/\s+/)
    // Un guion suelto entre acordes ("Am - F") no cuenta: se trata como una línea común.
    .some((t) => !PLAIN_CHORD_RE.test(t) && !/^[-–—]+$/.test(t));
}

// Líneas tipo "Intro: Am - F - C - G" o "INTRO(4x): Bm - A6 - F#m7 - G": una
// etiqueta de sección y, a continuación, solo acordes separados por espacios,
// guiones o barras. Acá también valen las notas en latino en mayúsculas
// (SOL#, DOm, LA, Rem), que en una línea suelta se podrían confundir con letra.
const SECTION_LABEL_RE =
  /^(\s*)((?:intro(?:ducci[oó]n)?|interludio|puente|instrumental|final|solo|pre-?coro|outro|coro|estrofa|verso|refr[aá]n)\b(?:\s*\([^)]*\))?)\s*(?:[:：]|\/\/)?\s*/i;
const SCAN_ROOT = "(?:DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si|[A-G])";
const SCAN_CHORD_RE = new RegExp(
  `^${SCAN_ROOT}(?:#|b)?(?:maj|min|m|M|dim|aug|sus|add)?\\d{0,2}(?:(?:sus|add|maj)?\\d{1,2}|[#b]\\d{1,2})*(?:\\/${SCAN_ROOT}(?:#|b)?)?(?![A-Za-z0-9#])`
);
const SCAN_MARKER_RE = /^\(\s*(?:x\s*\d+|\d+\s*(?:x|veces|vez))\s*\)/i;
const SCAN_SEPARATOR_RE = /^[-–—/|,;:()]+/;

/**
 * Pasa una línea de sección con acordes en texto plano ("Intro: Am F C G") al
 * formato con corchetes ("Intro: [Am] [F] [C] [G]"), para que se pinte en rojo
 * y cambie de tono como el resto. Devuelve null si la línea no es de ese tipo
 * (por ejemplo "Solo Dios es digno", donde después de la etiqueta hay letra).
 */
function convertSectionChordLine(line: string): string | null {
  const label = line.match(SECTION_LABEL_RE);
  if (!label) return null;

  const items: { text: string; isChord: boolean }[] = [];
  let rest = line.slice(label[0].length);
  while (rest.length > 0) {
    const space = rest.match(/^\s+/);
    if (space) {
      rest = rest.slice(space[0].length);
      continue;
    }
    const marker = rest.match(SCAN_MARKER_RE);
    if (marker) {
      items.push({ text: marker[0], isChord: false });
      rest = rest.slice(marker[0].length);
      continue;
    }
    const separator = rest.match(SCAN_SEPARATOR_RE);
    if (separator) {
      rest = rest.slice(separator[0].length);
      continue;
    }
    const chord = rest.match(SCAN_CHORD_RE);
    if (!chord) return null;
    items.push({ text: chord[0], isChord: true });
    rest = rest.slice(chord[0].length);
  }
  if (!items.some((i) => i.isChord)) return null;

  // Cada acorde deja el ancho de su nombre (+1) en la letra de abajo, para que
  // al dibujarlos arriba no se pisen entre sí.
  let result = `${label[1]}${label[2]}: `;
  items.forEach((item, i) => {
    if (i > 0) result += " ".repeat(items[i - 1].text.length + 1);
    result += item.isChord ? `[${item.text}]` : item.text;
  });
  return result;
}

// Raíces "peladas" (sin calidad ni extensión) que además son palabras comunes de
// la letra: "A", "E", "Mi", "Si", "La", "Sol", "Re", "Do", "Fa".
const AMBIGUOUS_ROOT_RE = /^(?:A|E|Do|Re|Mi|Fa|Sol|La|Si)$/;

/** Línea con un único token, y ese token es una raíz ambigua ("A", "Mi"...). */
function isLoneAmbiguous(line: string): boolean {
  const tokens = line.trim().split(/\s+/);
  return tokens.length === 1 && AMBIGUOUS_ROOT_RE.test(tokens[0]);
}

/**
 * ¿La canción tiene alguna señal inequívoca de que hay acordes? Un acorde ya
 * entre corchetes, una línea de sección ("Intro: Am F"), o una línea de acordes
 * que no sea solo una raíz ambigua suelta (dos o más acordes, o uno con
 * calidad/alteración/bajo como Am, F#, D/F#).
 */
function hasChordEvidence(lines: string[]): boolean {
  return lines.some((line) => {
    if (line.includes("[")) {
      return /\[(?:[A-G]|Do|Re|Mi|Fa|Sol|La|Si)[^\]]*\]/.test(line);
    }
    if (convertSectionChordLine(line) !== null) return true;
    return isPlainChordLine(line) && !isLoneAmbiguous(line);
  });
}

/**
 * Algunas canciones vienen en texto plano (acordes en una línea y la letra
 * en la de abajo) en vez de "[Am]letra". Las convertimos al formato con
 * corchetes para que reciban el mismo tratamiento: acordes en rojo, pegados
 * a su letra y cortados junto con ella si la línea es muy larga.
 *
 * Esto también reescribe el texto al guardar, así que ante la duda NO se toca.
 * Regla para las líneas de un solo token ambiguo (A, E, Mi, Si, La, Sol...):
 * como "A" o "Si" también son palabras, solo se toman por acorde si
 *  - la línea tiene sangría (un acorde puesto en una columna sobre la letra), o
 *  - la canción tiene otras señales inequívocas de acordes (ver hasChordEvidence)
 *    Y la línea de abajo no parece seguir una frase (no empieza en minúscula).
 * Así un "A" suelto sobre "Ti te canto" queda como letra, pero "C" sobre
 * "sola" o una línea de acordes como "La   Mi" (dos tokens) siguen funcionando.
 */
export function normalizePlainChordLines(body: string): string[] {
  const lines = body.split("\n");
  const out: string[] = [];
  const evidence = hasChordEvidence(lines);
  const isChordLine = (line: string, following?: string): boolean => {
    if (!isPlainChordLine(line)) return false;
    if (!isLoneAmbiguous(line) || /^\s/.test(line)) return true;
    return evidence && !(following !== undefined && /^\s*\p{Ll}/u.test(following));
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("[")) {
      const section = convertSectionChordLine(line);
      if (section !== null) {
        out.push(section);
        continue;
      }
    }
    if (!isChordLine(line, lines[i + 1])) {
      out.push(line);
      continue;
    }
    if (hasDecoration(line)) {
      // Con marcas de repetición ("///Am ///") se deja la línea como está, solo
      // que con los acordes entre corchetes, sin mezclarla con la letra de abajo.
      out.push(
        line
          .trim()
          .split(/\s+/)
          .map((t) => {
            if (PLAIN_CHORD_RE.test(t)) return `[${t}]`;
            if (REPEAT_MARK_RE.test(t)) return t;
            const { pre, core, post } = splitDecoration(t);
            return `${pre}[${core}]${post}`;
          })
          .join(" ")
      );
      continue;
    }
    const tokens = [...line.matchAll(/\S+/g)]
      .map((m) => ({ chord: m[0], index: m.index ?? 0 }))
      .filter((t) => PLAIN_CHORD_RE.test(t.chord));
    const next = lines[i + 1];
    if (next === undefined || !next.trim() || isChordLine(next, lines[i + 2])) {
      out.push(tokens.map((t) => `[${t.chord}]`).join(" "));
      continue;
    }
    let lyrics = next;
    for (const t of [...tokens].reverse()) {
      lyrics = lyrics.padEnd(t.index);
      lyrics = lyrics.slice(0, t.index) + `[${t.chord}]` + lyrics.slice(t.index);
    }
    out.push(lyrics);
    i++;
  }
  return out;
}

/** Igual que normalizePlainChordLines pero devuelve el texto completo, listo para guardar. */
export function normalizePlainChords(body: string): string {
  return normalizePlainChordLines(body).join("\n");
}
