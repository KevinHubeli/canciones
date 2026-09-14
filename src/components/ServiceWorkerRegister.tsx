"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // no pasa nada si el navegador no lo soporta o falla el registro
      });
    }
  }, []);

  return null;
}
