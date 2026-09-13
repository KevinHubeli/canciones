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

// Acordes abiertos reales: se muestran tal cual (son la forma en que se
// tocan de verdad), en vez de una cejilla arriba en el mástil.
const OPEN_CHORDS: Record<string, number[]> = {
  E: [0, 2, 2, 1, 0, 0],
  Em: [0, 2, 2, 0, 0, 0],
  E7: [0, 2, 0, 1, 0, 0],
  Em7: [0, 2, 0, 0, 0, 0],
  A: [-1, 0, 2, 2, 2, 0],
  Am: [-1, 0, 2, 2, 1, 0],
  A7: [-1, 0, 2, 0, 2, 0],
  Am7: [-1, 0, 2, 0, 1, 0],
  D: [-1, -1, 0, 2, 3, 2],
  Dm: [-1, -1, 0, 2, 3, 1],
  D7: [-1, -1, 0, 2, 1, 2],
  Dm7: [-1, -1, 0, 2, 1, 1],
  G: [3, 2, 0, 0, 0, 3],
  G7: [3, 2, 0, 0, 0, 1],
  C: [-1, 3, 2, 0, 1, 0],
  C7: [-1, 3, 2, 3, 1, 0],
  B7: [-1, 2, 1, 2, 0, 2],
};

// Formas movibles con la raíz en la 6ª cuerda (Mi) o en la 5ª (La), estilo
// "acorde con cejilla": se usan para el resto de las raíces/calidades.
const E_SHAPES: Record<string, number[]> = {
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

const A_SHAPES: Record<string, number[]> = {
  "": [-1, 0, 2, 2, 2, 0],
  maj: [-1, 0, 2, 2, 2, 0],
  M: [-1, 0, 2, 2, 2, 0],
  m: [-1, 0, 2, 2, 1, 0],
  min: [-1, 0, 2, 2, 1, 0],
  "7": [-1, 0, 2, 0, 2, 0],
  m7: [-1, 0, 2, 0, 1, 0],
  min7: [-1, 0, 2, 0, 1, 0],
  maj7: [-1, 0, 2, 1, 2, 0],
};

export function getGuitarDiagram(name: string): FretDiagram | null {
  const parsed = parseChord(name);
  if (!parsed) return null;

  const rootName = Object.keys(NOTE_INDEX).find((n) => NOTE_INDEX[n] === parsed.rootIndex)!;
  const openKey = rootName + parsed.suffix;
  if (OPEN_CHORDS[openKey]) return { frets: OPEN_CHORDS[openKey] };

  const eShape = E_SHAPES[parsed.suffix];
  const aShape = A_SHAPES[parsed.suffix];
  if (!eShape && !aShape) return null;

  const fromE = eShape
    ? shiftShape(eShape, (parsed.rootIndex - NOTE_INDEX.E + 12) % 12)
    : null;
  const fromA = aShape
    ? shiftShape(aShape, (parsed.rootIndex - NOTE_INDEX.A + 12) % 12)
    : null;

  // Se elige la cejilla más baja posible: es la forma más común de tocarlo.
  const maxFret = (frets: number[]) => Math.max(...frets.filter((f) => f > 0));
  if (fromE && fromA) return { frets: maxFret(fromE) <= maxFret(fromA) ? fromE : fromA };
  return { frets: (fromE ?? fromA)! };
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
