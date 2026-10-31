"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        // El servidor dice cuánto falta; si no, un aviso genérico.
        setError(data.error ?? "Demasiados intentos fallidos. Esperá unos minutos antes de probar de nuevo.");
        return;
      }
      if (!res.ok) {
        // Mismo texto para usuario inexistente y contraseña mala: no se revela cuáles usuarios hay.
        setError(
          res.status === 401
            ? "Usuario o contraseña incorrectos."
            : (data.error ?? "No pudimos iniciar sesión.")
        );
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("No pudimos conectarnos. Probá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-3">
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Usuario"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="username"
        name="username"
        required
        className="rounded-2xl border border-plum bg-night/50 px-4 py-3 text-mist placeholder:text-lilac-light/70 focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        placeholder="Contraseña"
        autoComplete="current-password"
        name="password"
        required
        className="rounded-2xl border border-plum bg-night/50 px-4 py-3 text-mist placeholder:text-lilac-light/70 focus:outline-none focus:ring-2 focus:ring-accent"
      />
      {error && <p role="alert" className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-1 rounded-full bg-accent py-3 text-sm font-semibold text-night disabled:opacity-60"
      >
        {loading ? "Ingresando..." : "Ingresar"}
      </button>
    </form>
  );
}
