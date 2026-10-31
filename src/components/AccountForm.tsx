"use client";

import { useState } from "react";

const inputClass =
  "rounded-2xl border border-plum bg-night/50 px-4 py-3 text-mist placeholder:text-lilac-light/70 focus:outline-none focus:ring-2 focus:ring-accent";

export default function AccountForm({ isOwner }: { isOwner: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (isOwner) {
    return (
      <div className="mx-5 rounded-2xl border border-plum/60 bg-night/40 p-4 text-sm text-lilac-light">
        Sos el dueño: tu contraseña no se cambia desde acá. Se cambia en Vercel, en la variable de
        entorno <span className="text-mist">ADMIN_PASSWORD</span> (Settings, Environment
        Variables), y después hay que volver a desplegar. Al cambiarla se cierran todas las sesiones
        del dueño.
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next !== repeat) {
      setError("La contraseña nueva y su repetición no coinciden.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo cambiar la contraseña.");
        return;
      }
      setDone(true);
      setCurrent("");
      setNext("");
      setRepeat("");
    } catch {
      setError("No se pudo cambiar la contraseña.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-5 flex max-w-sm flex-col gap-3 rounded-2xl border border-plum/60 bg-night/40 p-4"
    >
      <span className="text-xs uppercase tracking-wide text-lilac-light">Cambiar mi contraseña</span>
      <input
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        type="password"
        placeholder="Contraseña actual"
        autoComplete="current-password"
        className={inputClass}
      />
      <input
        value={next}
        onChange={(e) => setNext(e.target.value)}
        type="password"
        placeholder="Contraseña nueva (mínimo 8, nada obvio como 12345678)"
        autoComplete="new-password"
        className={inputClass}
      />
      <input
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        type="password"
        placeholder="Repetí la contraseña nueva"
        autoComplete="new-password"
        className={inputClass}
      />
      {error && (
        <p role="alert" className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="rounded-xl bg-plum/60 px-3 py-2 text-sm text-mist">
          Listo, cambiaste tu contraseña. Las sesiones abiertas en otros dispositivos se cerraron.
        </p>
      )}
      <button
        type="submit"
        disabled={saving || !current || !next || !repeat}
        className="rounded-full bg-accent py-3 text-sm font-semibold text-night disabled:opacity-60"
      >
        {saving ? "Guardando..." : "Cambiar contraseña"}
      </button>
    </form>
  );
}
