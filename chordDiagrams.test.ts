import {
  BASS_OPEN_STRINGS,
  GUITAR_OPEN_STRINGS,
  QUALITY_INTERVALS,
  canonicalQuality,
  chordPitchClasses,
  diagramBaseFret,
  diagramRows,
  getBassDiagram,
  getGuitarDiagram,
  getKeyboardDiagram,
} from "./src/lib/chordDiagrams";

let failures = 0;
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failures++;
    console.log(`  FAIL: ${name}${detail ? " — " + detail : ""}`);
  }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const pcOf = (i: number) => ROOTS[((i % 12) + 12) % 12];

// ---- diagramBaseFret ----
{
  check("base: acorde de cuerdas al aire (A) => 1", diagramBaseFret([-1, 0, 2, 2, 2, 0]) === 1);
  check("base: Em => 1", diagramBaseFret([0, 2, 2, 0, 0, 0]) === 1);
  check("base: A7 => 1", diagramBaseFret([-1, 0, 2, 0, 2, 0]) === 1);
  check("base: D (sin cuerda al aire grave pero entra en 4 trastes) => 1", diagramBaseFret([-1, -1, 0, 2, 3, 2]) === 1);
  check("base: F con cejilla (1,3,3,2,1,1) => 1", diagramBaseFret([1, 3, 3, 2, 1, 1]) === 1);
  check("base: B (2,4,4,4,2,2) entra en 4 trastes => 1", diagramBaseFret([-1, 2, 4, 4, 4, 2]) === 1);
  check("base: C# (4,6,6,5,4,4) => 4", diagramBaseFret([4, 6, 6, 5, 4, 4]) === 4);
  check("base: G (3,5,5,4,3,3) => 3", diagramBaseFret([3, 5, 5, 4, 3, 3]) === 3);
  check("base: nada pisado => 1", diagramBaseFret([0, 0, 0, 0, 0, 0]) === 1 && diagramBaseFret([-1, -1, -1, -1]) === 1);
  check("base: con cuerda al aire siempre es 1 aunque haya trastes altos", diagramBaseFret([0, 5, 7, 7, 5, 5]) === 1);
  check("rows: mínimo 4", diagramRows([-1, 0, 2, 2, 2, 0]) === 4);
  check("rows: se estira si el acorde es ancho (sin aire)", diagramRows([5, 7, 9, 9, 7, 7]) === 5, String(diagramRows([5, 7, 9, 9, 7, 7])));
}

// ---- calidades canónicas ----
{
  const cases: [string, string | null][] = [
    ["", ""], ["maj", ""], ["m", "m"], ["min", "m"], ["7", "7"], ["m7", "m7"], ["min7", "m7"], ["maj7", "maj7"],
    ["sus", "sus4"], ["sus4", "sus4"], ["sus2", "sus2"], ["add9", "add9"], ["6", "6"], ["m6", "m6"], ["9", "9"],
    ["dim", "dim"], ["dim7", "dim7"], ["aug", "aug"], ["+", "aug"], ["m7b5", "m7b5"], ["ø", "m7b5"], ["maj9", "maj9"],
    ["5", "5"], ["7sus4", "7sus4"], ["6/9", "6/9"], ["69", "6/9"], ["madd9", "madd9"], ["m9", "m9"], ["xyz", null], ["13", null],
  ];
  for (const [input, expected] of cases) {
    check(`calidad "${input}" => ${expected}`, canonicalQuality(input) === expected, String(canonicalQuality(input)));
  }
}

// ---- Guitarra: las notas de cada forma coinciden con las del acorde ----
// Qué intervalos no pueden faltar (la quinta puede omitirse en acordes de 4 o más notas).
const REQUIRED: Record<string, number[]> = {
  "": [0, 4], m: [0, 3], "7": [0, 4, 10], m7: [0, 3, 10], maj7: [0, 4, 11], sus2: [0, 2], sus4: [0, 5],
  add9: [0, 2, 4], "6": [0, 4, 9], m6: [0, 3, 9], "9": [0, 4, 10, 2], dim: [0, 3, 6], dim7: [0, 3, 6, 9],
  aug: [0, 4, 8], m7b5: [0, 3, 6, 10], maj9: [0, 11, 2], "5": [0], "7sus4": [0, 5, 10], "6/9": [0, 4, 9, 2],
  madd9: [0, 3, 2], m9: [0, 3, 10, 2],
};

function soundingNotes(open: number[], frets: number[]): number[] {
  return frets.map((f, s) => (f === -1 ? -1 : (open[s] + f) % 12)).filter((n) => n !== -1);
}

for (const quality of Object.keys(QUALITY_INTERVALS)) {
  check(`REQUIRED cubre la calidad "${quality}"`, REQUIRED[quality] !== undefined);
  for (let root = 0; root < 12; root++) {
    const suffix = quality;
    const name = pcOf(root) + suffix;
    const tag = `guitarra ${name}`;
    const diagram = getGuitarDiagram(name);
    if (!diagram) {
      check(`${tag}: existe`, false);
      continue;
    }
    const { frets } = diagram;
    const notes = soundingNotes(GUITAR_OPEN_STRINGS, frets);
    const allowed = new Set(QUALITY_INTERVALS[quality].map((i) => (root + i) % 12));
    const required = REQUIRED[quality].map((i) => (root + i) % 12);
    check(`${tag}: 6 cuerdas`, frets.length === 6);
    check(`${tag}: solo suenan notas del acorde`, notes.every((n) => allowed.has(n)), `${notes.map(pcOf)} vs ${[...allowed].map(pcOf)}`);
    check(`${tag}: están las notas imprescindibles`, required.every((n) => notes.includes(n)), `${notes.map(pcOf)}`);
    const lowest = frets.findIndex((f) => f !== -1);
    check(`${tag}: la nota más grave es la raíz`, lowest !== -1 && (GUITAR_OPEN_STRINGS[lowest] + frets[lowest]) % 12 === root);
    check(`${tag}: al menos 3 cuerdas suenan`, notes.length >= 3, String(notes.length));
    const used = frets.filter((f) => f > 0);
    check(`${tag}: no se estira más de 5 trastes`, used.length === 0 || Math.max(...used) - Math.min(...used) <= 4);
    check(`${tag}: no pasa del traste 12`, Math.max(0, ...used) <= 12, String(Math.max(0, ...used)));
    const base = diagramBaseFret(frets);
    const rows = diagramRows(frets);
    check(`${tag}: todos los puntos caben en el diagrama`, used.every((f) => f >= base && f - base + 1 <= rows));
  }
}

// Formas abiertas conocidas (no deben correrse)
{
  check("A abierta", same(getGuitarDiagram("A")?.frets, [-1, 0, 2, 2, 2, 0]));
  check("Em7 abierto", same(getGuitarDiagram("Em7")?.frets, [0, 2, 0, 0, 0, 0]));
  check("Asus2 abierto", same(getGuitarDiagram("Asus2")?.frets, [-1, 0, 2, 2, 0, 0]));
  check("F con cejilla", same(getGuitarDiagram("F")?.frets, [1, 3, 3, 2, 1, 1]));
  check("Bb con cejilla (forma de La)", same(getGuitarDiagram("Bb")?.frets, [-1, 1, 3, 3, 3, 1]), String(getGuitarDiagram("Bb")?.frets));
  check("acordes bemol y sostenido son lo mismo", same(getGuitarDiagram("Bb7"), getGuitarDiagram("A#7")));
  check("acorde desconocido => null", getGuitarDiagram("Xyz") === null && getGuitarDiagram("C13") === null);
  check("sus => sus4", same(getGuitarDiagram("Dsus"), getGuitarDiagram("Dsus4")));
}

// ---- Acordes con bajo ----
{
  const slash: [string, number][] = [
    ["D/F#", 6], ["C/E", 4], ["G/B", 11], ["A/C#", 1], ["C/G", 7], ["D/A", 9], ["E/G#", 8], ["F/A", 9], ["G/D", 2],
    ["Am/E", 4], ["Am/G", 7], ["Em/B", 11], ["Em/G", 7], ["Dm/F", 5], ["Dm/A", 9], ["Bm/F#", 6], ["B/D#", 3], ["F/C", 0],
    ["Bb/D", 2], ["Eb/G", 7], ["Ab/C", 0], ["G/F#", 6], ["C/B", 11], ["Am7/G", 7], ["Cmaj7/E", 4],
  ];
  for (const [name, bass] of slash) {
    const d = getGuitarDiagram(name);
    check(`${name}: tiene diagrama`, !!d);
    if (!d) continue;
    const lowest = d.frets.findIndex((f) => f !== -1);
    const lowestNote = (GUITAR_OPEN_STRINGS[lowest] + d.frets[lowest]) % 12;
    check(`${name}: la nota más grave es el bajo (${pcOf(bass)})`, lowestNote === bass, `${pcOf(lowestNote)} ${d.frets}`);
    const pcs = chordPitchClasses(name)!;
    check(`${name}: solo suenan notas del acorde`, soundingNotes(GUITAR_OPEN_STRINGS, d.frets).every((n) => pcs.includes(n)));
    check(`${name}: no pasa del traste 12`, Math.max(0, ...d.frets) <= 12);
  }
  check("D/F# conocido", same(getGuitarDiagram("D/F#")?.frets, [2, -1, 0, 2, 3, 2]), String(getGuitarDiagram("D/F#")?.frets));
  check("C/E conocido", same(getGuitarDiagram("C/E")?.frets, [0, 3, 2, 0, 1, 0]), String(getGuitarDiagram("C/E")?.frets));
  check("G/B conocido", same(getGuitarDiagram("G/B")?.frets, [-1, 2, 0, 0, 0, 3]), String(getGuitarDiagram("G/B")?.frets));
  check("bajo que es la raíz: igual al acorde común", same(getGuitarDiagram("G/G"), getGuitarDiagram("G")));
  check("6/9 no es un acorde con bajo", same(getGuitarDiagram("C6/9"), getGuitarDiagram("C69")) && !!getGuitarDiagram("C6/9"));
}

// ---- Bajo ----
{
  for (const quality of Object.keys(QUALITY_INTERVALS)) {
    for (let root = 0; root < 12; root++) {
      const name = pcOf(root) + quality;
      const d = getBassDiagram(name);
      if (!d) {
        check(`bajo ${name}: existe`, false);
        continue;
      }
      const notes = soundingNotes(BASS_OPEN_STRINGS, d.frets);
      const allowed = new Set(QUALITY_INTERVALS[quality].map((i) => (root + i) % 12));
      check(`bajo ${name}: 4 cuerdas`, d.frets.length === 4);
      check(`bajo ${name}: dos notas`, notes.length === 2, String(notes.length));
      check(`bajo ${name}: notas del acorde`, notes.every((n) => allowed.has(n)), notes.map(pcOf).join());
      const lowest = d.frets.findIndex((f) => f !== -1);
      check(`bajo ${name}: la más grave es la raíz`, (BASS_OPEN_STRINGS[lowest] + d.frets[lowest]) % 12 === root);
      check(`bajo ${name}: la segunda es la quinta (o su alteración)`, (() => {
        const fifth = QUALITY_INTERVALS[quality].find((i) => i >= 6 && i <= 8) ?? 7;
        return notes.includes((root + fifth) % 12);
      })());
      check(`bajo ${name}: trastes razonables`, Math.max(...d.frets) <= 12, String(d.frets));
    }
  }
  check("bajo A: raíz en la cuerda La al aire", same(getBassDiagram("A")?.frets, [-1, 0, 2, -1]), String(getBassDiagram("A")?.frets));
  check("bajo E: raíz en la cuerda Mi al aire", same(getBassDiagram("E")?.frets, [0, 2, -1, -1]));
  check("bajo Edim: quinta bemol", same(getBassDiagram("Edim")?.frets, [0, 1, -1, -1]));
  check("bajo Eaug: quinta aumentada", same(getBassDiagram("Eaug")?.frets, [0, 3, -1, -1]));
  const slash = getBassDiagram("D/F#")!;
  const notes = soundingNotes(BASS_OPEN_STRINGS, slash.frets);
  const lowest = slash.frets.findIndex((f) => f !== -1);
  check("bajo D/F#: nota grave F# + su octava", (BASS_OPEN_STRINGS[lowest] + slash.frets[lowest]) % 12 === 6 && notes.length === 2 && notes[0] === notes[1], notes.map(pcOf).join());
  check("bajo: acorde desconocido => null", getBassDiagram("Xyz") === null);
}

// ---- Teclado ----
{
  for (const quality of Object.keys(QUALITY_INTERVALS)) {
    for (let root = 0; root < 12; root++) {
      const d = getKeyboardDiagram(pcOf(root) + quality);
      const expected = QUALITY_INTERVALS[quality].map((i) => (root + i) % 12);
      check(`teclado ${pcOf(root)}${quality}`, !!d && same(d.activeKeys, expected), JSON.stringify(d));
    }
  }
  check("teclado Dsus2 = D E A", same(getKeyboardDiagram("Dsus2")?.activeKeys, [2, 4, 9]));
  check("teclado Cmaj9 = C E G B D", same([...getKeyboardDiagram("Cmaj9")!.activeKeys].sort((a, b) => a - b), [0, 2, 4, 7, 11]));
  const slash = getKeyboardDiagram("D/F#");
  check("teclado D/F#: D F# A y el bajo marcado", same(slash?.activeKeys, [2, 6, 9]) && slash?.bassKey === 6, JSON.stringify(slash));
  const foreign = getKeyboardDiagram("D/E");
  check("teclado D/E: agrega el bajo que no era del acorde", foreign?.bassKey === 4 && foreign.activeKeys.includes(4), JSON.stringify(foreign));
  check("teclado: bemoles", same(getKeyboardDiagram("Bbm")?.activeKeys, [10, 1, 5]));
  check("teclado: desconocido => null", getKeyboardDiagram("Xyz") === null);
}

console.log(`\nRESULTADO: ${passed} OK, ${failures} FAIL`);
process.exit(failures > 0 ? 1 : 0);
