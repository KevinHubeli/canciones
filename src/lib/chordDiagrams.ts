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

const PC_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

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

const ROOT_RE = /^([A-G])(#|b)?(.*)$/;
const BASS_RE = /^(.*)\/([A-G](?:#|b)?)$/;

/** Cuerdas al aire (clase de nota, Do = 0), de la más grave a la más aguda. */
export const GUITAR_OPEN_STRINGS = [4, 9, 2, 7, 11, 4]; // E A D G B E
export const BASS_OPEN_STRINGS = [4, 9, 2, 7]; // E A D G

function noteIndex(name: string): number | null {
  const sharp = FLAT_TO_SHARP[name] ?? name;
  return NOTE_INDEX[sharp] ?? null;
}

type ParsedChord = { rootIndex: number; suffix: string; bassIndex: number | null } | null;

function parseChord(name: string): ParsedChord {
  let main = name.trim();
  let bassIndex: number | null = null;
  // "D/F#" lleva bajo; "6/9" no (después de la barra hay un número, no una nota).
  const withBass = main.match(BASS_RE);
  if (withBass) {
    main = withBass[1];
    bassIndex = noteIndex(withBass[2]);
  }
  const match = main.match(ROOT_RE);
  if (!match) return null;
  const [, letter, accidental, suffixRaw] = match;
  const rootIndex = noteIndex(letter + (accidental ?? ""));
  if (rootIndex === null) return null;
  return { rootIndex, suffix: suffixRaw.trim(), bassIndex };
}

// Semitonos desde la raíz para cada calidad de acorde soportada.
export const QUALITY_INTERVALS: Record<string, number[]> = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  "7": [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 2, 4, 7],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "9": [0, 2, 4, 7, 10],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  m7b5: [0, 3, 6, 10],
  maj9: [0, 2, 4, 7, 11],
  "5": [0, 7],
  "7sus4": [0, 5, 7, 10],
  "6/9": [0, 2, 4, 7, 9],
  madd9: [0, 2, 3, 7],
  m9: [0, 2, 3, 7, 10],
};

// Nombres alternativos con los que se escriben las calidades en las canciones.
const QUALITY_ALIASES: Record<string, string> = {
  major: "",
  maj: "",
  M: "",
  min: "m",
  "-": "m",
  dom7: "7",
  min7: "m7",
  "-7": "m7",
  M7: "maj7",
  ma7: "maj7",
  "Δ": "maj7",
  "Δ7": "maj7",
  sus: "sus4",
  "2": "sus2",
  add2: "add9",
  "°": "dim",
  o: "dim",
  "°7": "dim7",
  o7: "dim7",
  "+": "aug",
  aug7: "aug",
  "+7": "aug",
  "ø": "m7b5",
  "ø7": "m7b5",
  min7b5: "m7b5",
  "m7(b5)": "m7b5",
  "m7-5": "m7b5",
  M9: "maj9",
  "7sus": "7sus4",
  "69": "6/9",
  "6add9": "6/9",
  "m(add9)": "madd9",
  minadd9: "madd9",
  min9: "m9",
};

/** Calidad canónica del sufijo de un acorde ("min7" => "m7", "sus" => "sus4"), o null si no está soportada. */
export function canonicalQuality(suffix: string): string | null {
  const s = suffix.trim();
  if (s in QUALITY_INTERVALS) return s;
  return QUALITY_ALIASES[s] ?? null;
}

/**
 * Clases de nota (0-11) que forman el acorde, con la raíz primero y, si lleva
 * bajo ("D/F#"), el bajo agregado al final si no era parte del acorde.
 * Devuelve null si no se reconoce el acorde.
 */
export function chordPitchClasses(name: string): number[] | null {
  const parsed = parseChord(name);
  if (!parsed) return null;
  const quality = canonicalQuality(parsed.suffix);
  if (quality === null) return null;
  const notes = QUALITY_INTERVALS[quality].map((i) => (parsed.rootIndex + i) % 12);
  if (parsed.bassIndex !== null && !notes.includes(parsed.bassIndex)) notes.push(parsed.bassIndex);
  return notes;
}

function shiftShape(shape: number[], shift: number): number[] {
  return shape.map((f) => (f === -1 ? -1 : f + shift));
}

export type FretDiagram = { frets: number[] };
// 0-11, posición dentro de la octava (Do=0). `bassKey` es la nota del bajo en un acorde con bajo ("D/F#").
export type KeyboardDiagram = { activeKeys: number[]; bassKey?: number };

/**
 * Traste desde el que se dibuja el diagrama. Si hay alguna cuerda al aire o el
 * acorde entra en los primeros 4 trastes, es 1 (con la cejuela gruesa arriba);
 * si no, es el traste más bajo usado y se rotula al costado.
 */
export function diagramBaseFret(frets: number[]): number {
  const used = frets.filter((f) => f > 0);
  if (used.length === 0 || frets.includes(0)) return 1;
  if (Math.max(...used) <= 4) return 1;
  return Math.min(...used);
}

/** Cantidad de trastes (filas) que hay que dibujar: 4 como mínimo, más si el acorde se estira. */
export function diagramRows(frets: number[]): number {
  const used = frets.filter((f) => f > 0);
  if (used.length === 0) return 4;
  return Math.max(4, Math.max(...used) - diagramBaseFret(frets) + 1);
}

// Acordes abiertos reales: se muestran tal cual (son la forma en que se
// tocan de verdad), en vez de una cejilla arriba en el mástil. La clave es
// la raíz (con sostenido) más la calidad canónica.
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
  Cmaj7: [-1, 3, 2, 0, 0, 0],
  Dmaj7: [-1, -1, 0, 2, 2, 2],
  Fmaj7: [-1, -1, 3, 2, 1, 0],
  Gmaj7: [3, 2, 0, 0, 0, 2],
  Dsus2: [-1, -1, 0, 2, 3, 0],
  Dsus4: [-1, -1, 0, 2, 3, 3],
  Gsus2: [3, 0, 0, 0, 3, 3],
  Gsus4: [3, 3, 0, 0, 1, 3],
  Csus2: [-1, 3, 0, 0, 3, 3],
  Csus4: [-1, 3, 3, 0, 1, 1],
  Cadd9: [-1, 3, 2, 0, 3, 3],
  Gadd9: [3, 0, 0, 2, 0, 3],
  C6: [-1, 3, 2, 2, 1, 0],
  G6: [3, 2, 0, 0, 0, 0],
  D6: [-1, -1, 0, 2, 0, 2],
  Dm6: [-1, -1, 0, 2, 0, 1],
  D7sus4: [-1, -1, 0, 2, 1, 3],
  G7sus4: [3, 3, 0, 0, 1, 1],
  C7sus4: [-1, 3, 3, 3, 1, 1],
};

// Formas movibles con la raíz en la 6ª cuerda (Mi) o en la 5ª (La), estilo
// "acorde con cejilla". Los números son trastes relativos al de la raíz: al
// moverlas, las cuerdas al aire pasan a ser la cejilla. -1 = cuerda sin tocar.
const E_SHAPES: Record<string, number[]> = {
  "": [0, 2, 2, 1, 0, 0],
  m: [0, 2, 2, 0, 0, 0],
  "7": [0, 2, 0, 1, 0, 0],
  m7: [0, 2, 0, 0, 0, 0],
  maj7: [0, 2, 1, 1, 0, 0],
  sus2: [0, 2, 4, 4, 0, 0],
  sus4: [0, 2, 2, 2, 0, 0],
  add9: [0, 2, 4, 1, 0, 0],
  "6": [0, 2, 2, 1, 2, 0],
  m6: [0, 2, 2, 0, 2, 0],
  "9": [0, 2, 0, 1, 0, 2],
  dim: [0, 1, 2, 0, -1, -1],
  dim7: [0, 1, 2, 0, 2, -1],
  aug: [0, 3, 2, 1, 1, 0],
  m7b5: [0, 1, 0, 0, -1, -1],
  maj9: [0, 2, 1, 1, 0, 2],
  "5": [0, 2, 2, -1, -1, -1],
  "7sus4": [0, 2, 0, 2, 0, 0],
  "6/9": [0, 2, 2, 1, 2, 2],
  madd9: [0, 2, 4, 0, 0, 0],
  m9: [0, 2, 0, 0, 0, 2],
};

const A_SHAPES: Record<string, number[]> = {
  "": [-1, 0, 2, 2, 2, 0],
  m: [-1, 0, 2, 2, 1, 0],
  "7": [-1, 0, 2, 0, 2, 0],
  m7: [-1, 0, 2, 0, 1, 0],
  maj7: [-1, 0, 2, 1, 2, 0],
  sus2: [-1, 0, 2, 2, 0, 0],
  sus4: [-1, 0, 2, 2, 3, 0],
  add9: [-1, 0, 2, 4, 2, 0],
  "6": [-1, 0, 2, 2, 2, 2],
  m6: [-1, 0, 2, 2, 1, 2],
  "9": [-1, 0, 2, 4, 2, 3],
  dim: [-1, 0, 1, 2, 1, -1],
  dim7: [-1, 0, 1, -1, 1, 2],
  aug: [-1, 0, 3, 2, 2, 1],
  m7b5: [-1, 0, 1, 0, 1, -1],
  maj9: [-1, 0, 2, 1, 0, 0],
  "5": [-1, 0, 2, 2, -1, -1],
  "7sus4": [-1, 0, 2, 0, 3, 0],
  "6/9": [-1, 0, 4, 4, 2, 2],
  madd9: [-1, 0, 2, 4, 1, 0],
  m9: [-1, 0, 2, 4, 1, 3],
};

const maxFret = (frets: number[]) => Math.max(0, ...frets.filter((f) => f > 0));

function baseGuitarShape(rootIndex: number, quality: string): number[] | null {
  const open = OPEN_CHORDS[PC_NAMES[rootIndex] + quality];
  if (open) return open;

  const eShape = E_SHAPES[quality];
  const aShape = A_SHAPES[quality];
  const fromE = eShape ? shiftShape(eShape, (rootIndex - NOTE_INDEX.E + 12) % 12) : null;
  const fromA = aShape ? shiftShape(aShape, (rootIndex - NOTE_INDEX.A + 12) % 12) : null;
  if (!fromE && !fromA) return null;

  // Se elige la cejilla más baja posible: es la forma más común de tocarlo.
  if (fromE && fromA) return maxFret(fromE) <= maxFret(fromA) ? fromE : fromA;
  return (fromE ?? fromA)!;
}

const MAX_BASS_FRET = 5;
const pitchAt = (open: number[], frets: number[], s: number) => (open[s] + frets[s]) % 12;

/**
 * Adapta una forma al bajo de un acorde con bajo ("D/F#"): pone la nota del
 * bajo en la cuerda grave más cómoda (silenciando las de más abajo). Si no hay
 * una forma razonable, devuelve la forma original (sin el bajo).
 */
function withGuitarBass(frets: number[], bassIndex: number): number[] {
  const firstSounding = frets.findIndex((f) => f !== -1);
  if (firstSounding !== -1 && pitchAt(GUITAR_OPEN_STRINGS, frets, firstSounding) === bassIndex) {
    return frets;
  }

  let best: { frets: number[]; cost: number } | null = null;
  for (let s = 0; s < 4; s++) {
    const f = (bassIndex - GUITAR_OPEN_STRINGS[s] + 12) % 12;
    if (f > MAX_BASS_FRET) continue;
    const candidate = frets.map((x, i) => (i < s ? -1 : i === s ? f : x));
    if (candidate.filter((x) => x !== -1).length < 3) continue;
    const used = candidate.filter((x) => x > 0);
    if (used.length > 0 && Math.max(...used) - Math.min(...used) > 4) continue;
    if (candidate.includes(0) && maxFret(candidate) > 5) continue;
    const removed = frets.filter((x, i) => i < s && x !== -1).length;
    const cost = f + removed * 10;
    if (!best || cost < best.cost) best = { frets: candidate, cost };
  }
  return best ? best.frets : frets;
}

export function getGuitarDiagram(name: string): FretDiagram | null {
  const parsed = parseChord(name);
  if (!parsed) return null;
  const quality = canonicalQuality(parsed.suffix);
  if (quality === null) return null;

  const base = baseGuitarShape(parsed.rootIndex, quality);
  if (!base) return null;
  if (parsed.bassIndex === null || parsed.bassIndex === parsed.rootIndex) return { frets: base };
  return { frets: withGuitarBass(base, parsed.bassIndex) };
}

/**
 * Bajo de 4 cuerdas (Mi-La-Re-Sol): se muestra raíz + quinta, el patrón más
 * habitual para acompañar en bajo (el bajo casi nunca marca la tercera). En
 * los acordes con bajo ("D/F#") se muestra la nota del bajo más su octava.
 * La raíz va en la cuerda (Mi o La) donde queda más cerca de la cejuela.
 */
export function getBassDiagram(name: string): FretDiagram | null {
  const parsed = parseChord(name);
  if (!parsed) return null;
  const quality = canonicalQuality(parsed.suffix);
  if (quality === null) return null;

  const slash = parsed.bassIndex !== null && parsed.bassIndex !== parsed.rootIndex;
  const note = slash ? parsed.bassIndex! : parsed.rootIndex;
  const onE = (note - BASS_OPEN_STRINGS[0] + 12) % 12;
  const onA = (note - BASS_OPEN_STRINGS[1] + 12) % 12;
  const stringIdx = onE <= onA ? 0 : 1;
  const fret = stringIdx === 0 ? onE : onA;

  // La quinta (o la octava) cae 2 trastes más arriba en la cuerda siguiente.
  // Con quinta disminuida/aumentada se corre un traste.
  let second = fret + 2;
  if (!slash) {
    const fifth = QUALITY_INTERVALS[quality].find((i) => i >= 6 && i <= 8) ?? 7;
    second += fifth - 7;
  }
  const frets = [-1, -1, -1, -1];
  frets[stringIdx] = fret;
  frets[stringIdx + (slash ? 2 : 1)] = second;
  return { frets };
}

export function getKeyboardDiagram(name: string): KeyboardDiagram | null {
  const parsed = parseChord(name);
  if (!parsed) return null;
  const quality = canonicalQuality(parsed.suffix);
  if (quality === null) return null;
  const activeKeys = QUALITY_INTERVALS[quality].map((i) => (parsed.rootIndex + i) % 12);
  if (parsed.bassIndex === null || parsed.bassIndex === parsed.rootIndex) return { activeKeys };
  const bassKey = parsed.bassIndex;
  return { activeKeys: activeKeys.includes(bassKey) ? activeKeys : [...activeKeys, bassKey], bassKey };
}
