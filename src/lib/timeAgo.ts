const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "hace un momento", "hace 3 horas", "hace 2 semanas"... */
export function timeAgo(from: Date | string | number, now: Date | number = Date.now()): string {
  const diff = Math.max(0, +now - +new Date(from));
  if (diff < MINUTE) return "hace un momento";
  if (diff < HOUR) return `hace ${plural(Math.floor(diff / MINUTE), "minuto", "minutos")}`;
  if (diff < DAY) return `hace ${plural(Math.floor(diff / HOUR), "hora", "horas")}`;
  const days = Math.floor(diff / DAY);
  if (days < 14) return `hace ${plural(days, "día", "días")}`;
  if (days < 60) return `hace ${plural(Math.floor(days / 7), "semana", "semanas")}`;
  if (days < 730) return `hace ${plural(Math.floor(days / 30), "mes", "meses")}`;
  return `hace ${plural(Math.floor(days / 365), "año", "años")}`;
}

/** Días enteros transcurridos desde `from`. */
export function daysSince(from: Date | string | number, now: Date | number = Date.now()): number {
  return Math.max(0, Math.floor((+now - +new Date(from)) / DAY));
}
