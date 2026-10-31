// Mantiene la pantalla del celular encendida mientras se toca (Screen Wake Lock API).
// Se pide al abrir el visor, se vuelve a pedir al volver a la pestaña (el
// navegador lo suelta solo al ocultarla) y se libera al salir. Donde la API
// no existe (o el navegador la rechaza) no pasa nada: la pantalla se apaga como siempre.

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type WakeLockApi = { request: (type: "screen") => Promise<WakeLockSentinelLike> };

function getApi(): WakeLockApi | null {
  if (typeof navigator === "undefined") return null;
  const wl = (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock;
  return wl && typeof wl.request === "function" ? wl : null;
}

export function isWakeLockSupported(): boolean {
  return getApi() !== null;
}

/**
 * Empieza a mantener la pantalla encendida. `onChange` recibe true cuando el
 * bloqueo está activo y false cuando se suelta. Devuelve la función que lo libera.
 */
export function keepScreenAwake(onChange?: (active: boolean) => void): () => void {
  const api = getApi();
  if (!api) return () => {};

  let sentinel: WakeLockSentinelLike | null = null;
  let disposed = false;
  let requesting = false;

  async function acquire() {
    if (!api || disposed || requesting || sentinel) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    requesting = true;
    try {
      const s = await api.request("screen");
      if (disposed) {
        // Se cerró el visor mientras el navegador respondía.
        s.release().catch(() => {});
        return;
      }
      sentinel = s;
      s.addEventListener("release", () => {
        if (sentinel === s) sentinel = null;
        if (!disposed) onChange?.(false);
      });
      onChange?.(true);
    } catch {
      // Sin permiso (ahorro de batería, política del navegador): se sigue sin bloqueo.
      if (!disposed) onChange?.(false);
    } finally {
      requesting = false;
    }
  }

  function onVisibility() {
    if (document.visibilityState === "visible") void acquire();
  }

  document.addEventListener("visibilitychange", onVisibility);
  void acquire();

  return () => {
    disposed = true;
    document.removeEventListener("visibilitychange", onVisibility);
    const s = sentinel;
    sentinel = null;
    s?.release().catch(() => {});
  };
}
