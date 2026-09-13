// Diagramas de guitarra, bajo y teclado calculados con teoría musical: no
// dependen de ninguna API externa, así que siempre funcionan.

const NOTE_INDEX: Record<string, number> = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11,
};

const FLAT_TO_SHARP: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
};

const ROOT_RE = /^([A-G])(#|b)?(.*)$/;

type ParsedChord = { rootIndex: number; suffix: string } | null;

function parseChord(name: string): ParsedChord {
  // El bajo alterado ("D/F#") no cambia el diagrama del acorde principal.
  const base = name.split("/")[0].trim();
  const match = base.match(ROOT_RE);
  if (!match) return null;
  const [, letter, accidental, suffixRaw] = match;
  const rootName = FLAT_TO_SHARP[letter + (accidental ?? "")] ?? letter + (accidental ?? "");
  const rootIndex = NOTE_INDEX[rootName];
  if (rootIndex === undefined) return null;
  return { rootIndex, suffix: suffixRaw.trim() };
}

// Semitonos desde la raíz para cada calidad de acorde soportada.
const CHORD_INTERVALS: Record<string, number[]> = {
  "": [0, 4, 7],
  maj: [0, 4, 7],
  M: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  "7": [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  min7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
};

function intervalsFor(suffix: string): number[] | null {
  return CHORD_INTERVALS[suffix] ?? null;
}

function shiftShape(shape: number[], shift: number): number[] {
  return shape.map((f) => (f === -1 ? -1 : f + shift));
}

export type FretDiagram = { frets: number[] };
export type KeyboardDiagram = { activeKeys: number[] }; // 0-11, posición dentro de la octava (Do=0)

// Formas movibles con la raíz en la 6ª cuerda (Mi grave), estilo "acorde con cejilla".
const GUITAR_SHAPES: Record<string, number[]> = {
  "": [0, 2, 2, 1, 0, 0],
  maj: [0, 2, 2, 1, 0, 0],
  M: [0, 2, 2, 1, 0, 0],
  m: [0, 2, 2, 0, 0, 0],
  min: [0, 2, 2, 0, 0, 0],
  "7": [0, 2, 0, 1, 0, 0],
  m7: [0, 2, 0, 0, 0, 0],
  min7: [0, 2, 0, 0, 0, 0],
  maj7: [0, 2, 1, 1, 0, 0],
};

export function getGuitarDiagram(name: string): FretDiagram | null {
  const parsed = parseChord(name);
  if (!parsed) return null;
  const shape = GUITAR_SHAPES[parsed.suffix];
  if (!shape) return null;
  const shift = (parsed.rootIndex - NOTE_INDEX.E + 12) % 12;
  return { frets: shiftShape(shape, shift) };
}

// Bajo de 4 cuerdas (Mi-La-Re-Sol): se muestra raíz + quinta, el patrón más
// habitual para acompañar en bajo (el bajo casi nunca marca la tercera).
const BASS_ROOT_FIFTH = [0, 2, -1, -1];

export function getBassDiagram(name: string): FretDiagram | null {
  const parsed = parseChord(name);
  if (!parsed) return null;
  const shift = (parsed.rootIndex - NOTE_INDEX.E + 12) % 12;
  return { frets: shiftShape(BASS_ROOT_FIFTH, shift) };
}

export function getKeyboardDiagram(name: string): KeyboardDiagram | null {
  const parsed = parseChord(name);
  if (!parsed) return null;
  const intervals = intervalsFor(parsed.suffix);
  if (!intervals) return null;
  return { activeKeys: intervals.map((i) => (parsed.rootIndex + i) % 12) };
}
