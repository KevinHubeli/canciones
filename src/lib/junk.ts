import { normalizeTitle } from "@/lib/text";

// Textos de menús y botones que se cuelan al copiar una canción de una página
// de acordes ("Diagramas de Acordes", "Mostrar / Ocultar", "Guitarra"...).
// Se comparan sin tildes ni signos, y la línea tiene que ser solo eso.
const JUNK_LABELS = new Set(
  [
    "diagramas de acordes",
    "diagrama de acordes",
    "mostrar ocultar",
    "mostrar",
    "ocultar",
    "mostrar acordes",
    "ocultar acordes",
    "guitarra",
    "ukelele",
    "ukulele",
    "charango",
    "cavaquinho",
    "banjo",
    "versiones",
    "cifra simplificada",
    "ver cifra simplificada",
    "dificultad",
    "afinacion",
    "autodesplazamiento",
    "desplazamiento automatico",
    "tamano de la fuente",
    "tamano de letra",
    "imprimir",
    "corregir",
    "enviar correccion",
    "enviar cifra",
    "agregar a lista",
    "agregar a mi lista",
    "me gusta",
    "compartir",
    "favorito",
    "favoritos",
    "ver mas",
    "ver menos",
    "ver video",
    "reproducir",
    "tonalidad",
    "transponer",
    "simplificar cifra",
    "modo oscuro",
    "cifra club",
    "cifraclub",
    "la cuerda",
    "lacuerda",
    "tabs",
    "tablatura",
  ].map(normalizeTitle)
);

// Nombres de instrumentos de los menús ("Guitarra  Teclado  Bajo  Piano"). Son
// basura solo si la línea completa es esa palabra: "Bajo tu mirada" o "Piano:"
// (un rótulo de sección) son de la canción. Una línea suelta que dice solo
// "Bajo" sí se marca; es raro como letra y el aviso deja "Dejar así".
const INSTRUMENT_LABELS = new Set(["teclado", "piano", "bajo", "bateria", "voz", "voces"]);

// Líneas que, aunque tengan más texto, son claramente de la página web.
const JUNK_PATTERNS: RegExp[] = [
  /https?:\/\/|www\./i,
  /\bcifra\s?club\b|\blacuerda\b/i,
  /©|todos los derechos|all rights reserved/i,
  // "Capo en el traste 2", "Capotraste 3", "Capo: 2", "Cejilla en 3".
  /^(?:capo(?:traste)?|cejilla|cejuela)\b\s*(?:en\s+(?:el\s+|la\s+)?)?(?:traste|casa|[:：]|\d)/i,
  // "Afinación", "Afinación: E A D G B E", "Afinación estándar".
  /^afinaci[oó]n\b\s*(?:[:：].*|est[aá]ndar|normal)?$/i,
  // "Tono: G", "Tom: C", "Tonalidad: Am" (con dos puntos; "Tono" solo en una frase es letra).
  /^(?:tono|tom|tonalidad|key)\s*[:：]\s*\S/i,
  // "Dificultad: Principiante", "Nivel: fácil".
  /^(?:dificultad|nivel)\s*[:：].*$/i,
  // "Versión: 2", "Versión 3".
  /^versi[oó]n\s*(?:[:：]\s*\S.*|\d+)$/i,
];

export type JunkLine = { index: number; text: string };

function isJunk(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Una línea con acordes entre corchetes es de la canción, nunca basura.
  if (/\[[^\]]+\]/.test(trimmed)) return false;
  const norm = normalizeTitle(trimmed);
  if (JUNK_LABELS.has(norm)) return true;
  // "Piano:" con dos puntos es un rótulo de sección, no un botón del menú.
  if (INSTRUMENT_LABELS.has(norm) && !/[:：]\s*$/.test(trimmed)) return true;
  return JUNK_PATTERNS.some((re) => re.test(trimmed));
}

/** Líneas que parecen texto de la página de donde se copió la canción, no de la canción. */
export function findJunkLines(body: string): JunkLine[] {
  const junk: JunkLine[] = [];
  body.split("\n").forEach((line, index) => {
    if (isJunk(line)) junk.push({ index, text: line.trim() });
  });
  return junk;
}

/** Saca esas líneas y deja los espacios en blanco prolijos (sin más de uno seguido ni al principio). */
export function removeJunkLines(body: string): string {
  return body
    .split("\n")
    .filter((line) => !isJunk(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s*\n/, "");
}
