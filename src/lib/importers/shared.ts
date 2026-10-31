import type { AnyNode } from "domhandler";
import type { Cheerio, CheerioAPI } from "cheerio";

export type ImportedSong = {
  title: string;
  artist: string;
  originalKey: string;
  body: string;
};

export class ImportError extends Error {}

/**
 * Falló la conexión con la página (red, timeout, error HTTP, redirección
 * rara): se distingue de "no encontramos nada" para poder reintentar.
 */
export class NetworkImportError extends ImportError {}

export { guessOriginalKey, normalizeKeyHint } from "./key";

type ChordMark = { name: string; col: number };
type Line = { text: string; chords: ChordMark[] };

/**
 * Cifra Club y LaCuerda comparten el mismo formato clásico: cada acorde va en
 * su propio elemento inline, en una línea aparte, alineado por espacios justo
 * arriba de la letra. Esta función recorre el contenido de un bloque (un
 * `<pre>` o un `<div>` dentro de él) preservando el orden de texto/etiquetas,
 * separa por saltos de línea y devuelve una lista de líneas con la columna
 * exacta (en caracteres) donde cae cada acorde dentro de esa línea.
 */
export function extractLines(
  $: CheerioAPI,
  container: Cheerio<AnyNode>,
  isChordTag: (tagName: string) => boolean
): Line[] {
  const lines: Line[] = [];
  let curText = "";
  let curChords: ChordMark[] = [];

  const pushLine = () => {
    if (curChords.length > 0) addLooseChords(curText, curChords);
    lines.push({ text: curText, chords: curChords });
    curText = "";
    curChords = [];
  };

  const walk = (node: AnyNode) => {
    if (node.type === "text") {
      let remaining = "data" in node ? (node.data as string) : "";
      while (remaining.includes("\n")) {
        const idx = remaining.indexOf("\n");
        curText += remaining.slice(0, idx);
        pushLine();
        remaining = remaining.slice(idx + 1);
      }
      curText += remaining;
      return;
    }
    if (node.type === "tag") {
      if (isChordTag(node.name)) {
        const chordName = $(node).text().trim();
        if (chordName) {
          curChords.push({ name: chordName, col: curText.length });
          curText += chordName;
        }
        return;
      }
      // Otras etiquetas (spans, negrita decorativa, etc.): entrar igual a sus hijos.
      for (const child of node.children ?? []) walk(child);
    }
  };

  for (const node of container.get()) walk(node as AnyNode);
  pushLine();
  return lines;
}

// Acorde escrito suelto en el texto ("A/C#m", "F#m7"), tal como lo deja una
// página cuando no lo marca con su etiqueta propia.
const LOOSE_CHORD_RE =
  /^[A-G][#b]?(?:maj|min|dim|aug|sus|add|m|M|\d+|[#b]\d+|[+°ø])*(?:\/[A-G][#b]?m?)?$/;

/**
 * En una línea de acordes, algunos pueden venir sin etiqueta (LaCuerda deja
 * "A/C#m" como texto común mientras linkea el resto). Si no se rescatan, se
 * pierden al combinar la línea con la letra de abajo.
 */
function addLooseChords(text: string, chords: ChordMark[]) {
  const covered = chords.map((c) => [c.col, c.col + c.name.length] as const);
  for (const m of text.matchAll(/\S+/g)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (covered.some(([a, b]) => start < b && end > a)) continue;
    if (LOOSE_CHORD_RE.test(m[0])) chords.push({ name: m[0], col: start });
  }
  chords.sort((a, b) => a.col - b.col);
}

/**
 * Convierte la lista de líneas (acordes y letra intercalados) al formato
 * propio "[Acorde]letra": si una línea de solo acordes está seguida por una
 * línea de solo letra, las combina insertando cada acorde en la columna que
 * le corresponde. Si una línea de acordes queda sola (instrumental, sin
 * letra debajo), se listan los acordes entre corchetes separados por espacio.
 */
export function linesToBody(lines: Line[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];
    const nextIsPlainLyric =
      next && next.chords.length === 0 && next.text.trim().length > 0;

    if (line.chords.length > 0 && nextIsPlainLyric) {
      out.push(mergeChordsIntoLyric(line.chords, next.text));
      i += 2;
      continue;
    }

    if (line.chords.length > 0) {
      out.push(chordsOnlyLine(line.chords, line.text));
      i += 1;
      continue;
    }

    out.push(line.text);
    i += 1;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function mergeChordsIntoLyric(chords: ChordMark[], lyric: string): string {
  let result = "";
  let last = 0;
  for (const chord of chords) {
    const pos = Math.min(chord.col, lyric.length);
    result += lyric.slice(last, pos) + `[${chord.name}]`;
    last = pos;
  }
  result += lyric.slice(last);
  return result;
}

/**
 * Une acordes sueltos (sin letra debajo, ej. una intro instrumental) dejando
 * el espacio suficiente para que, al re-parsear con parseSongLine, ningún
 * nombre de acorde quede pisando al siguiente en la fila que se dibuja.
 */
function chordsOnlyLine(chords: ChordMark[], text = ""): string {
  // Si la línea trae una etiqueta antes del primer acorde ("// Intro: D G A //"),
  // se conserva como letra ("Intro:") para no perder qué parte de la canción es.
  const label = text
    .slice(0, chords[0].col)
    .replace(/[/|\\]+/g, " ")
    .trim();
  let result = /\p{L}/u.test(label) ? `${label} ` : "";
  chords.forEach((chord, i) => {
    if (i > 0) {
      // +1 para que quede al menos una columna vacía entre acorde y acorde.
      result += " ".repeat(chords[i - 1].name.length + 1);
    }
    result += `[${chord.name}]`;
  });
  return result;
}

// Palabras que van en minúscula dentro de un título (salvo la primera).
const SMALL_WORDS = new Set(
  "a al con de del e el en la las lo los mi mis o por para se su sus te tu tus u un una y".split(" ")
);

/**
 * Pone en mayúscula la inicial de cada palabra y deja el resto en minúscula,
 * conservando las tildes. Con `smallWords` (por defecto) los artículos y
 * preposiciones cortas ("de", "la", "tu"...) quedan en minúscula salvo al
 * principio: "no hay dios como tú" -> "No Hay Dios Como Tú" y "cristo en mí"
 * -> "Cristo en Mí". Para nombres de artista conviene `smallWords: false`.
 */
export function titleCase(text: string, opts: { smallWords?: boolean } = {}): string {
  const useSmall = opts.smallWords !== false;
  let first = true;
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const lower = token.toLowerCase();
      const bare = lower.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      const keepLower = useSmall && !first && SMALL_WORDS.has(bare);
      first = false;
      if (keepLower) return lower;
      // Capitaliza la primera letra real (después de comillas, paréntesis, ¿, ¡...).
      return lower.replace(/\p{L}/u, (ch) => ch.toUpperCase());
    })
    .join(" ");
}

/**
 * Como titleCase, pero solo si el texto viene todo en mayúsculas o todo en
 * minúsculas; si ya tiene mayúsculas y minúsculas mezcladas se respeta tal cual.
 */
export function fixCase(text: string, opts: { smallWords?: boolean } = {}): string {
  const t = text.trim();
  if (t === t.toUpperCase() || t === t.toLowerCase()) return titleCase(t, opts);
  return t;
}

/** "marcos_witt" -> "Marcos Witt" (todas las palabras con mayúscula: sirve para artistas). */
export function slugToTitleCase(slug: string, opts: { smallWords?: boolean } = {}): string {
  return titleCase(slug.replace(/[_-]+/g, " "), { smallWords: opts.smallWords ?? false });
}

// ---------------------------------------------------------------------------
// Descarga segura de páginas
// ---------------------------------------------------------------------------

const ALLOWED_DOMAINS = ["cifraclub.com", "cifraclub.com.br", "lacuerda.net"];
const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
export const IMPORT_USER_AGENT = "Mozilla/5.0 (compatible; CancioneroImporter/1.0)";

// Coincidencia estricta: "lacuerda.net.evil.com" o "evil.com/lacuerda.net" no pasan.
export function isHostOf(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function isAllowedImportHost(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_DOMAINS.some((d) => isHostOf(h, d));
}

export function isCifraClubHost(host: string): boolean {
  const h = host.toLowerCase();
  return isHostOf(h, "cifraclub.com") || isHostOf(h, "cifraclub.com.br");
}

export function isLaCuerdaHost(host: string): boolean {
  return isHostOf(host.toLowerCase(), "lacuerda.net");
}

/**
 * Valida una URL a importar: solo http/https, sin usuario/clave, puerto
 * estándar y un host de Cifra Club o LaCuerda. Acepta que falte el "https://".
 */
export function parseImportUrl(raw: string, base?: URL): URL {
  const text = raw.trim();
  let url: URL;
  try {
    url = base
      ? new URL(text, base)
      : new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    throw new ImportError("Esa URL no es válida.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ImportError("Esa URL no es válida.");
  }
  if (url.username || url.password) throw new ImportError("Esa URL no es válida.");
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new ImportError("Esa URL no es válida.");
  }
  if (!isAllowedImportHost(url.hostname)) {
    throw new ImportError("Solo se puede importar desde Cifra Club o LaCuerda.");
  }
  return url;
}

export type FetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Para tests: reemplaza a fetch. */
  fetchImpl?: typeof fetch;
};

async function readLimited(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw new NetworkImportError("Esa página es demasiado grande.");
  }
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new NetworkImportError("Esa página es demasiado grande.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function decodeBody(bytes: Uint8Array, contentType: string): string {
  const charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/**
 * Descarga el HTML de una página de Cifra Club o LaCuerda con tope de tiempo
 * (12 s en total), de tamaño (2 MB) y de redirecciones (3), validando que cada
 * salto siga cayendo en un host permitido. Lanza NetworkImportError si falla la
 * conexión y ImportError si la URL no es válida o no es de esos sitios.
 */
export async function fetchHtml(url: string, opts: FetchOptions = {}): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? FETCH_TIMEOUT_MS);

  let current = parseImportUrl(url);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let res: Response;
    try {
      res = await doFetch(current.toString(), {
        headers: { "User-Agent": IMPORT_USER_AGENT },
        redirect: "manual",
        signal,
      });
    } catch {
      throw new NetworkImportError("No pudimos conectarnos con esa página.");
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!location) throw new NetworkImportError("No pudimos leer esa página.");
      try {
        current = parseImportUrl(location, current);
      } catch {
        throw new NetworkImportError("Esa página redirige a otro sitio.");
      }
      continue;
    }

    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw new NetworkImportError(`La página respondió con error (${res.status}).`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/html/i.test(contentType)) {
      await res.body?.cancel().catch(() => {});
      throw new ImportError("Esa dirección no es una página de acordes.");
    }

    try {
      return decodeBody(await readLimited(res, maxBytes), contentType);
    } catch (err) {
      if (err instanceof ImportError) throw err;
      throw new NetworkImportError("No pudimos leer esa página.");
    }
  }
  throw new NetworkImportError("Esa página tiene demasiadas redirecciones.");
}
