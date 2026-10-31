// Preferencias y reglas puras del visor de canciones (sin React), para poder probarlas.

/** Tamaños de letra del visor, en px. El del medio-bajo (16) es el de siempre. */
export const TEXT_SIZES_PX: readonly number[] = [14, 16, 19, 22, 25, 28];
export const DEFAULT_TEXT_SIZE_INDEX = 1;

/** Velocidades del desfile automático en px por segundo. La del medio (50) equivale a los 2px/40ms de antes. */
export const AUTOSCROLL_SPEEDS_PX_PER_SEC: readonly number[] = [20, 35, 50, 75, 110];
export const DEFAULT_AUTOSCROLL_SPEED_INDEX = 2;

/** Traste máximo de la cejilla. */
export const MAX_CAPO = 7;

/**
 * Lee un índice guardado (string de localStorage): vale solo si es un entero
 * dentro de [0, length). Cualquier otra cosa (vacío, texto, fuera de rango) da el valor por defecto.
 */
export function parseStoredIndex(raw: string | null, length: number, fallback: number): number {
  if (raw === null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n < length ? n : fallback;
}

export function clampCapo(capo: number): number {
  if (!Number.isFinite(capo)) return 0;
  return Math.max(0, Math.min(MAX_CAPO, Math.round(capo)));
}

/** "Capo 3 · tocá en G" (o "Sin capo" con 0). `shapeKey` es el tono de las formas que se tocan. */
export function capoSummary(capo: number, shapeKey: string): string {
  return capo <= 0 ? "Sin capo" : `Capo ${capo} · tocá en ${shapeKey}`;
}

export type SwipeInput = {
  dx: number;
  dy: number;
  /** Milisegundos entre que el dedo toca y se levanta. */
  durationMs: number;
  /** Cantidad de dedos que tocaron en algún momento del gesto. */
  maxTouches: number;
  /** Zoom actual de la pantalla (visualViewport.scale); con zoom el deslizar es para moverse. */
  pageScale: number;
};

export const SWIPE_MIN_DX_PX = 80;
export const SWIPE_DOMINANCE = 2;
export const SWIPE_MAX_MS = 800;

/**
 * ¿Un deslizamiento horizontal deliberado? Devuelve "next" (hacia la
 * izquierda), "prev" (hacia la derecha) o null. Un scroll en diagonal, un
 * gesto lento, un pellizco con dos dedos o un deslizar con la pantalla
 * ampliada no cuentan.
 */
export function swipeDirection(input: SwipeInput): "next" | "prev" | null {
  const { dx, dy, durationMs, maxTouches, pageScale } = input;
  if (maxTouches > 1) return null;
  if (pageScale > 1.05) return null;
  if (durationMs > SWIPE_MAX_MS) return null;
  if (Math.abs(dx) < SWIPE_MIN_DX_PX) return null;
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_DOMINANCE) return null;
  return dx < 0 ? "next" : "prev";
}

/**
 * Pasos de scroll de un tick del desfile: acumula la fracción de píxel que
 * todavía no se pudo mover (los navegadores redondean el scroll) y devuelve
 * cuántos píxeles enteros avanzar ahora y lo que queda pendiente.
 */
export function autoscrollStep(
  pendingPx: number,
  speedPxPerSec: number,
  elapsedMs: number
): { move: number; pending: number } {
  // Un tick atrasado (pestaña dormida) no tiene que pegar un salto enorme.
  const dt = Math.max(0, Math.min(elapsedMs, 100));
  const total = pendingPx + (speedPxPerSec * dt) / 1000;
  const move = Math.floor(total);
  return { move, pending: total - move };
}
