import { toEnglishNotation } from "@/lib/chords";

/**
 * Detección del tono original a partir de los acordes de la canción.
 *
 * Mirar solo el primer acorde falla cuando la canción arranca en otro grado
 * (un coro que empieza en el IV, una intro en el vi...). En cambio se puntúan
 * las 24 tonalidades posibles (12 notas x mayor/menor) con varias señales:
 *  - cuántos acordes de la canción son diatónicos de esa tonalidad (los que
 *    quedan afuera restan);
 *  - cuántas veces aparece el acorde de la tónica;
 *  - si el primer y el último acorde son la tónica;
 *  - cadencias V -> I (el dominante resolviendo a la tónica);
 *  - un pequeño sesgo hacia mayor, que desempata las tonalidades relativas
 *    (C y Am comparten todos los acordes) cuando no hay otra pista.
 */

type Quality = "maj" | "min" | "dim" | "any";
type ParsedChord = { pc: number; quality: Quality; root: string };

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Cómo se escribe cada tónica cuando la canción no deja pistas (convención habitual).
const MAJOR_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_NAMES = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];

// Grados diatónicos: [semitonos desde la tónica, calidad del acorde].
const MAJOR_DEGREES: [number, Quality][] = [
  [0, "maj"],
  [2, "min"],
  [4, "min"],
  [5, "maj"],
  [7, "maj"],
  [9, "min"],
  [11, "dim"],
];
// Menor natural + el V mayor de la menor armónica (muy común en la práctica).
const MINOR_DEGREES: [number, Quality][] = [
  [0, "min"],
  [2, "dim"],
  [3, "maj"],
  [5, "min"],
  [7, "min"],
  [7, "maj"],
  [8, "maj"],
  [10, "maj"],
];

const W_OUT_OF_KEY = 1.2;
const W_FIRST = 1.5;
const W_LAST = 1.5;
const W_CADENCE = 2;
const W_MAJOR_PRIOR = 2.5;

function parseChord(raw: string): ParsedChord | null {
  const main = toEnglishNotation(raw.trim()).split("/")[0];
  const m = main.match(/^([A-G])(#|b)?(.*)$/);
  if (!m) return null;
  const [, letter, acc, rest] = m;
  // Lo que sigue a la raíz tiene que parecer un sufijo de acorde, no una palabra.
  if (!/^[A-Za-z0-9#b+°ø()-]*$/.test(rest)) return null;
  if (/^[a-ln-zA-LN-Z]/.test(rest) && !/^(sus|add|aug|dim|maj|min)/i.test(rest)) return null;
  let pc = PC[letter];
  if (acc === "#") pc += 1;
  if (acc === "b") pc -= 1;
  pc = (pc + 12) % 12;

  let quality: Quality = "maj";
  if (/^(dim|°|ø|m7b5)/.test(rest)) quality = "dim";
  else if (/^(maj|M)/.test(rest)) quality = "maj";
  else if (/^(m|min)/.test(rest)) quality = "min";
  else if (/^(sus|5$)/.test(rest)) quality = "any";
  return { pc, quality, root: letter + (acc ?? "") };
}

function chordsOf(body: string): ParsedChord[] {
  const out: ParsedChord[] = [];
  for (const m of body.matchAll(/\[([^\]]+)\]/g)) {
    const c = parseChord(m[1]);
    if (c) out.push(c);
  }
  return out;
}

function qualityMatches(chord: Quality, expected: Quality): boolean {
  return chord === "any" || chord === expected;
}

function isInKey(chord: ParsedChord, tonic: number, degrees: [number, Quality][]): boolean {
  const rel = (chord.pc - tonic + 12) % 12;
  return degrees.some(([deg, q]) => deg === rel && qualityMatches(chord.quality, q));
}

/** Tono que declara la página (ej. "G", "F#m", "Sol", "Lam"): lo devuelve normalizado o null. */
export function normalizeKeyHint(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim().replace(/\s+/g, "");
  if (!text || text.length > 6) return null;
  const m = toEnglishNotation(text).match(/^([A-G])(#|b)?(m(?!aj)|min)?$/);
  if (!m) return null;
  return m[1] + (m[2] ?? "") + (m[3] ? "m" : "");
}

/**
 * Tono original de la canción. Si la página lo informa (`hint`), se usa tal
 * cual; si no, se estima con los acordes (ver arriba). Sin acordes devuelve "C".
 */
export function guessOriginalKey(body: string, hint?: string | null): string {
  const fromPage = normalizeKeyHint(hint);
  if (fromPage) return fromPage;

  const chords = chordsOf(body);
  if (chords.length === 0) return "C";

  let best: { score: number; tonic: number; minor: boolean } | null = null;
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const minor of [false, true]) {
      const degrees = minor ? MINOR_DEGREES : MAJOR_DEGREES;
      const tonicQuality: Quality = minor ? "min" : "maj";
      const isTonic = (c: ParsedChord) => c.pc === tonic && qualityMatches(c.quality, tonicQuality);

      let score = minor ? 0 : W_MAJOR_PRIOR;
      for (const c of chords) {
        score += isInKey(c, tonic, degrees) ? 1 : -W_OUT_OF_KEY;
        if (isTonic(c)) score += 1;
      }
      if (isTonic(chords[0])) score += W_FIRST;
      if (isTonic(chords[chords.length - 1])) score += W_LAST;
      for (let i = 0; i < chords.length - 1; i++) {
        const dominant = chords[i];
        if (
          dominant.pc === (tonic + 7) % 12 &&
          dominant.quality !== "min" &&
          dominant.quality !== "dim" &&
          isTonic(chords[i + 1])
        ) {
          score += W_CADENCE;
        }
      }
      if (!best || score > best.score) best = { score, tonic, minor };
    }
  }
  if (!best) return "C";

  // Se respeta cómo escribe la canción esa tónica (Bb en vez de A#).
  const wanted: Quality = best.minor ? "min" : "maj";
  const seen = chords.find((c) => c.pc === best.tonic && qualityMatches(c.quality, wanted));
  if (seen && seen.quality !== "any") return seen.root + (best.minor ? "m" : "");
  return (best.minor ? MINOR_NAMES : MAJOR_NAMES)[best.tonic];
}

/** Los 24 tonos que ofrece el selector del formulario: 12 mayores y 12 menores. */
export const KEY_OPTIONS = { major: MAJOR_NAMES, minor: MINOR_NAMES } as const;
