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
    "teclado",
    "piano",
    "bajo",
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

// Líneas que, aunque tengan más texto, son claramente de la página web.
const JUNK_PATTERNS: RegExp[] = [
  /https?:\/\/|www\./i,
  /\bcifra\s?club\b|\blacuerda\b/i,
  /©|todos los derechos|all rights reserved/i,
];

export type JunkLine = { index: number; text: string };

function isJunk(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Una línea con acordes entre corchetes es de la canción, nunca basura.
  if (/\[[^\]]+\]/.test(trimmed)) return false;
  return JUNK_LABELS.has(normalizeTitle(trimmed)) || JUNK_PATTERNS.some((re) => re.test(trimmed));
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
