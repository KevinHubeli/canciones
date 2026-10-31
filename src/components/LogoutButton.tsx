"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // El service worker guarda respuestas del admin: se borran sus cachés al salir.
      try {
        navigator.serviceWorker?.controller?.postMessage({ type: "clear-caches" });
      } catch {
        // sin service worker, no hay nada que limpiar
      }
    }
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-2 rounded-full bg-plum px-4 py-2 text-sm text-mist"
    >
      <LogOut size={16} />
      Salir
    </button>
  );
}
