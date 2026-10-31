"use client";

import { useEffect, useState } from "react";
import { CloudOff, Check } from "lucide-react";

type State = "idle" | "working" | "done" | "partial";

// Manda al service worker las URLs de las canciones de este power para que,
// si se abrió con wifi, después se pueda tocar sin conexión (en el atril no
// siempre hay señal). Discreto: solo avisa cuando terminó.
export default function PrecachePower({ urls }: { urls: string[] }) {
  const [state, setState] = useState<State>("idle");
  // Cambia solo si cambian las canciones, no en cada render del padre.
  const urlsKey = urls.join("\n");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || navigator.onLine === false) return;
    const list = urlsKey ? urlsKey.split("\n") : [];
    if (list.length === 0) return;

    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; token?: string; ok?: number; failed?: number };
      if (data?.type !== "precache-done" || data.token !== token || cancelled) return;
      if (timer) clearTimeout(timer);
      setState(data.failed === 0 && (data.ok ?? 0) > 0 ? "done" : "partial");
    }

    navigator.serviceWorker.addEventListener("message", onMessage);
    navigator.serviceWorker.ready
      .then((registration) => {
        if (cancelled || !registration.active) return;
        setState("working");
        registration.active.postMessage({ type: "precache", urls: list, token });
        // Si el service worker nunca contesta, no queda un "guardando..." para siempre.
        timer = setTimeout(() => {
          if (!cancelled) setState("idle");
        }, 90_000);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [urlsKey]);

  if (state === "idle" || state === "working") return null;

  return (
    <p role="status" className="mt-3 flex items-center justify-center gap-1.5 text-xs text-lilac-light">
      {state === "done" ? (
        <>
          <Check size={14} aria-hidden />
          Disponible sin conexión
        </>
      ) : (
        <>
          <CloudOff size={14} aria-hidden />
          Solo algunas canciones quedaron disponibles sin conexión
        </>
      )}
    </p>
  );
}
