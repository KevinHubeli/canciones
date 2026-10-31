import {
  mergeEntries,
  splitEntries,
  type DividerName,
  type SetlistDivider,
  type SetlistEntry,
} from "./dividers";

/**
 * Una "estructura típica" de power: las secciones en orden y cuánto pesa cada
 * una (cuántas canciones le tocan, en proporción) para repartir las que ya
 * están cargadas.
 */
export type PowerTemplate = {
  id: string;
  label: string;
  description: string;
  sections: { name: DividerName; weight: number }[];
};

export const POWER_TEMPLATES: PowerTemplate[] = [
  {
    id: "domingo",
    label: "Domingo",
    description: "Alabanza, adoración, ofrenda, ministración y final",
    sections: [
      { name: "ALABANZA", weight: 4 },
      { name: "ADORACIÓN", weight: 3 },
      { name: "OFRENDA", weight: 1 },
      { name: "MINISTRACIÓN", weight: 2 },
      { name: "FINAL", weight: 1 },
    ],
  },
  {
    id: "jueves-intimo",
    label: "Jueves íntimo",
    description: "Más adoración y ministración, sin ofrenda",
    sections: [
      { name: "ALABANZA", weight: 2 },
      { name: "ADORACIÓN", weight: 4 },
      { name: "MINISTRACIÓN", weight: 2 },
      { name: "FINAL", weight: 1 },
    ],
  },
  {
    id: "completa",
    label: "Completa (parejo)",
    description: "Las cinco secciones con el mismo peso",
    sections: [
      { name: "ALABANZA", weight: 1 },
      { name: "ADORACIÓN", weight: 1 },
      { name: "OFRENDA", weight: 1 },
      { name: "MINISTRACIÓN", weight: 1 },
      { name: "FINAL", weight: 1 },
    ],
  },
];

export function getTemplate(id: string): PowerTemplate | undefined {
  return POWER_TEMPLATES.find((t) => t.id === id);
}

/**
 * Posiciones de cada divisor de la plantilla para `songCount` canciones:
 * reparte las canciones según el peso de cada sección. Con pocas canciones
 * varias secciones pueden quedar vacías (mismo `position`), y se respeta el
 * orden de la plantilla. Los pesos inválidos (<= 0, NaN) cuentan como 1.
 */
export function templateDividers(template: PowerTemplate, songCount: number): SetlistDivider[] {
  const n = Number.isFinite(songCount) ? Math.max(0, Math.floor(songCount)) : 0;
  const weights = template.sections.map((s) => (Number.isFinite(s.weight) && s.weight > 0 ? s.weight : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let before = 0;
  return template.sections.map((section, i) => {
    const position = total > 0 ? Math.min(n, Math.max(0, Math.round((n * before) / total))) : 0;
    before += weights[i];
    return { name: section.name, position };
  });
}

/**
 * Aplica la plantilla: saca los divisores que hubiera y pone los de la
 * plantilla repartiendo las canciones (que no se tocan ni se reordenan).
 */
export function applyTemplate<S>(
  entries: SetlistEntry<S>[],
  template: PowerTemplate
): SetlistEntry<S>[] {
  const { songs } = splitEntries(entries);
  return mergeEntries(songs, templateDividers(template, songs.length));
}

/**
 * Inserta `item` al final de la sección que arranca en el divisor
 * `dividerIndex` (justo antes del próximo divisor). Con `null`, o si el índice
 * no es un divisor, va al final de todo.
 */
export function insertInSection<E extends { kind: "song" | "divider" }>(
  entries: E[],
  dividerIndex: number | null,
  item: E
): E[] {
  const at =
    dividerIndex !== null && entries[dividerIndex]?.kind === "divider"
      ? entries.findIndex((e, i) => i > dividerIndex && e.kind === "divider")
      : -1;
  const index = at === -1 ? entries.length : at;
  return [...entries.slice(0, index), item, ...entries.slice(index)];
}

/** Hace cuánto fue una fecha, en palabras cortas ("hoy", "hace 3 días", "hace 2 meses"). */
export function daysAgoText(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then) || !Number.isFinite(now)) return "";
  const days = Math.floor((now - then) / 86_400_000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 14) return `hace ${days} días`;
  if (days < 60) return `hace ${Math.floor(days / 7)} semanas`;
  if (days < 365) return `hace ${Math.floor(days / 30)} meses`;
  const years = Math.floor(days / 365);
  return years === 1 ? "hace un año" : `hace ${years} años`;
}
