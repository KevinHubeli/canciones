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

const FLAT_TO_SHARP: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
};

/**
 * Transpone un acorde N semitonos. Soporta acordes con bajo alterado tipo
 * "D/F#" (transpone las dos partes). Los bemoles de entrada se normalizan a
 * sostenidos en el resultado: es una simplificación aceptada, ver spec 2.7.
 * Si el string no matchea el patrón de un acorde, se devuelve tal cual.
 */
export function transposeChord(chord: string, semitones: number): string {
  if (semitones === 0) return chord;

  const slashIndex = chord.indexOf("/");
  if (slashIndex !== -1) {
    const top = chord.slice(0, slashIndex);
    const bass = chord.slice(slashIndex + 1);
    return `${transposeChord(top, semitones)}/${transposeChord(bass, semitones)}`;
  }

  const match = chord.match(ROOT_RE);
  if (!match) return chord;
  const [, letter, accidental, suffix] = match;
  const rootName = letter + (accidental ?? "");
  const normalized = FLAT_TO_SHARP[rootName] ?? rootName;
  const idx = CHROMATIC.indexOf(normalized as (typeof CHROMATIC)[number]);
  if (idx === -1) return chord;

  const newIdx = ((idx + semitones) % 12 + 12) % 12;
  return CHROMATIC[newIdx] + suffix;
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

/** Inverso de toLatinNotation: acepta un acorde en notación latina o inglesa y devuelve inglesa. */
export function toEnglishNotation(chord: string): string {
  const slashIndex = chord.indexOf("/");
  if (slashIndex !== -1) {
    return `${toEnglishNotation(chord.slice(0, slashIndex))}/${toEnglishNotation(
      chord.slice(slashIndex + 1)
    )}`;
  }
  for (const [latin, en] of LATIN_ENTRIES) {
    if (chord.startsWith(latin)) {
      return en + chord.slice(latin.length);
    }
  }
  return chord; // ya está en inglés o no se reconoce
}

export type ChordNotation = "en" | "latin";

export function displayChord(
  chord: string,
  semitones: number,
  notation: ChordNotation
): string {
  const transposed = transposeChord(toEnglishNotation(chord), semitones);
  return notation === "latin" ? toLatinNotation(transposed) : transposed;
}
