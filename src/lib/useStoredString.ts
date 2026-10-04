"use client";

import { useSyncExternalStore } from "react";

// Si localStorage no se puede usar (modo privado, bloqueado), los valores
// viven en memoria mientras la pestaña está abierta.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

export function readStored(key: string): string | null {
  try {
    const value = window.localStorage.getItem(key);
    if (value !== null) return value;
  } catch {
    // se usa la copia en memoria
  }
  return memory.get(key) ?? null;
}

export function writeStored(key: string, value: string) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // no pasa nada si no se puede guardar la preferencia
  }
  listeners.forEach((l) => l());
}

/**
 * Lee un valor de localStorage de forma segura para SSR: en el servidor y en
 * el primer render de hidratación devuelve null (así no hay diferencias con
 * el HTML del servidor) y enseguida pasa al valor real.
 */
export function useStoredString(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => readStored(key),
    () => null
  );
}
