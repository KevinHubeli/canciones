// Rango Unicode de los diacríticos combinables (0x0300-0x036f), construido con
// fromCharCode para no depender de pegar el caracter literal en el código fuente.
const DIACRITICS_RE = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  "g"
);

/** Para comparar títulos: sin tildes, en minúsculas y sin signos ni espacios de más. */
export function normalizeTitle(s: string): string {
  return s
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** ¿El body ya trae algún acorde entre corchetes ("[Am]")? */
export function hasChords(body: string): boolean {
  return /\[[^\]]+\]/.test(body);
}

// Palabras muy comunes que no ayudan a decidir si dos letras son de la misma canción.
const LYRIC_STOPWORDS = new Set(
  "que los las del por con una uno unos unas mas como para hay sus muy pero sin sobre este esta esto ese esa eso ser soy eres fue son era yo mis tus nos les".split(" ")
);

/** Palabras "de contenido" de una letra: sin acordes, sin tildes, en minúsculas. */
export function lyricWords(text: string): Set<string> {
  const clean = text.replace(/\[[^\]]*\]/g, " ");
  const words = normalizeTitle(clean).split(" ");
  const out = new Set<string>();
  for (const w of words) {
    if (w.length > 2 && !LYRIC_STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

/**
 * Qué tan parecidas son dos letras (0 a 1), ignorando acordes, tildes y
 * mayúsculas. Usa el coeficiente de solapamiento (palabras en común sobre el
 * conjunto más chico) para tolerar que una de las dos sea una versión
 * incompleta. Si la letra actual está vacía no hay nada que proteger (1).
 */
export function lyricsSimilarity(a: string, b: string): number {
  const wa = lyricWords(a);
  const wb = lyricWords(b);
  if (wa.size === 0) return 1;
  if (wb.size === 0) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  // Una letra actual casi vacía (un par de palabras) tiene poco que perder:
  // alcanza con que sus palabras aparezcan en la importada.
  if (wa.size < 4) return common / wa.size;
  // Importada diminuta contra una letra real: sospechoso, se exige Jaccard.
  if (wb.size < 4) return common / (wa.size + wb.size - common);
  return common / Math.min(wa.size, wb.size);
}
