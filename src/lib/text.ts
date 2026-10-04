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
