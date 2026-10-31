export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export const BPM_MIN = 30;
export const BPM_MAX = 300;
export const NOTES_MAX = 2000;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Número entero de un query param (limit, offset): si no es un número finito
 * usa `fallback`, los decimales se redondean hacia abajo y se acota a [min, max].
 */
export function parseIntParam(
  raw: string | null | undefined,
  opts: { fallback: number; min: number; max: number }
): number {
  const n = raw === null || raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(n)) return opts.fallback;
  return Math.min(opts.max, Math.max(opts.min, Math.floor(n)));
}

/** Tempo: entero entre 30 y 300, o null (sin tempo). */
export function parseBpm(input: unknown): Parsed<number | null> {
  if (input === null || input === undefined || input === "") return { ok: true, value: null };
  const n = typeof input === "string" && input.trim() !== "" ? Number(input) : input;
  if (typeof n !== "number" || !Number.isInteger(n) || n < BPM_MIN || n > BPM_MAX) {
    return { ok: false, error: `El tempo tiene que ser un número entero entre ${BPM_MIN} y ${BPM_MAX}.` };
  }
  return { ok: true, value: n };
}

/** Notas libres: hasta 2000 caracteres; vacío => null. */
export function parseNotes(input: unknown): Parsed<string | null> {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, error: "Las notas tienen que ser texto." };
  const text = input.trim();
  if (text.length > NOTES_MAX) {
    return { ok: false, error: `Las notas pueden tener hasta ${NOTES_MAX} caracteres.` };
  }
  return { ok: true, value: text || null };
}

/** true si es una fecha real con formato YYYY-MM-DD (rechaza 2026-02-30, por ejemplo). */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Fecha del culto: "YYYY-MM-DD" válida, o null (sin fecha). */
export function parseServiceDate(input: unknown): Parsed<string | null> {
  if (input === null || input === undefined || input === "") return { ok: true, value: null };
  if (!isValidDateString(input)) {
    return { ok: false, error: "La fecha no es válida (formato AAAA-MM-DD)." };
  }
  return { ok: true, value: input };
}

/** Timestamp ISO válido (lo que sale de Date#toISOString). */
export function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(new Date(value).getTime())
  );
}
