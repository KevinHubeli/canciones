import { normalizeKeyHint } from "@/lib/importers/key";

export type ChordProSong = {
  title?: string;
  artist?: string;
  /** Tono ya normalizado ("G", "F#m") o, si no se reconoce, el texto tal cual. */
  key?: string;
  /** Entero entre 30 y 300. */
  bpm?: number;
  /** Letra con acordes en el formato de la app: "[Am]letra". */
  body: string;
};

// Directivas (con sus abreviaturas) que abren y cierran una sección.
const SECTION_OPEN: Record<string, string> = {
  start_of_chorus: "Coro",
  soc: "Coro",
  start_of_verse: "Verso",
  sov: "Verso",
  start_of_bridge: "Puente",
  sob: "Puente",
};
const SECTION_CLOSE = new Set([
  "end_of_chorus",
  "eoc",
  "end_of_verse",
  "eov",
  "end_of_bridge",
  "eob",
]);
// Secciones que no tienen sentido en un cancionero (tablaturas, grillas).
const BLOCK_OPEN_IGNORED = new Set(["start_of_tab", "sot", "start_of_grid", "sog"]);
const BLOCK_CLOSE_IGNORED = new Set(["end_of_tab", "eot", "end_of_grid", "eog"]);

const DIRECTIVE_RE = /^\s*\{\s*([A-Za-z_]+)\s*(?:[:\s]\s*(.*?))?\s*\}\s*$/;

/**
 * Lee un archivo ChordPro (.cho, .chordpro, .crd, .pro) o un .txt simple y lo
 * pasa al formato de la app. Entiende las directivas {title:}/{t:},
 * {artist:}, {subtitle:}, {key:}, {tempo:}, {comment:}/{c:} y las secciones
 * {start_of_chorus}/{end_of_chorus} (que se vuelven una etiqueta "Coro:"),
 * descarta los comentarios que empiezan con `#` y deja el resto igual, porque
 * el formato "[Am]letra" de la app ya es ChordPro. Un .txt sin directivas pasa
 * tal cual (los acordes sobre la letra se convierten al guardar).
 */
export function parseChordPro(input: string): ChordProSong {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const result: ChordProSong = { body: "" };
  const out: string[] = [];
  let subtitle: string | undefined;
  let ignoringBlock = false;

  for (const rawLine of text.split("\n")) {
    if (ignoringBlock) {
      const closing = rawLine.match(DIRECTIVE_RE);
      if (closing && BLOCK_CLOSE_IGNORED.has(closing[1].toLowerCase())) ignoringBlock = false;
      continue;
    }
    // Comentario de ChordPro.
    if (/^\s*#/.test(rawLine)) continue;

    const directive = rawLine.match(DIRECTIVE_RE);
    if (!directive) {
      out.push(cleanChords(rawLine));
      continue;
    }

    const name = directive[1].toLowerCase();
    const value = (directive[2] ?? "").trim();

    if (name === "title" || name === "t") {
      if (value && !result.title) result.title = value;
    } else if (name === "artist" || name === "a") {
      if (value && !result.artist) result.artist = value;
    } else if (name === "subtitle" || name === "st") {
      if (value && !subtitle) subtitle = value;
    } else if (name === "key" || name === "k") {
      if (value && !result.key) result.key = normalizeKeyHint(value) ?? value.slice(0, 12);
    } else if (name === "tempo" || name === "bpm") {
      const n = Math.round(Number(value.match(/\d+(?:[.,]\d+)?/)?.[0].replace(",", ".")));
      if (n >= 30 && n <= 300 && result.bpm === undefined) result.bpm = n;
    } else if (name in SECTION_OPEN) {
      pushBlankIfNeeded(out);
      out.push(`${value || SECTION_OPEN[name]}:`);
    } else if (SECTION_CLOSE.has(name)) {
      out.push("");
    } else if (name === "comment" || name === "c" || name === "comment_italic" || name === "ci" || name === "comment_box" || name === "cb") {
      if (value) {
        pushBlankIfNeeded(out);
        out.push(/[:：]$/.test(value) ? value : `${value}:`);
      }
    } else if (BLOCK_OPEN_IGNORED.has(name)) {
      ignoringBlock = true;
    }
    // Cualquier otra directiva (define, capo, new_page, columns...) se descarta.
  }

  // {subtitle} suele ser el artista; solo se usa si no vino {artist}.
  if (!result.artist && subtitle) result.artist = subtitle;

  result.body = out
    .join("\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return result;
}

/** "[*Anotación]" no es un acorde; "[ Am ]" sí, pero con espacios de más. */
function cleanChords(line: string): string {
  if (!line.includes("[")) return line;
  return line.replace(/\[([^\]]*)\]/g, (_, inner: string) => {
    const t = inner.trim();
    if (!t || t.startsWith("*")) return "";
    return `[${t}]`;
  });
}

function pushBlankIfNeeded(out: string[]) {
  if (out.length > 0 && out[out.length - 1].trim() !== "") out.push("");
}
