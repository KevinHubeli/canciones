"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import type { AdminUser } from "@/lib/users";
import Spinner from "@/components/Spinner";
import ConfirmDialog from "@/components/ConfirmDialog";

const inputClass =
  "rounded-2xl border border-plum bg-night/50 px-4 py-3 text-mist placeholder:text-lilac-light/70 focus:outline-none focus:ring-2 focus:ring-accent";

export default function UsersAdmin({ ownerName }: { ownerName: string }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<AdminUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/users")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data) => {
        if (!cancelled) setUsers(data.users ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setError("No pudimos cargar los usuarios.");
        setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear el usuario.");
        return;
      }
      setUsers((prev) =>
        [...(prev ?? []), data.user].sort((a, b) => a.username.localeCompare(b.username))
      );
      setUsername("");
      setPassword("");
    } catch {
      setError("No se pudo crear el usuario.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!pending) return;
    const user = pending;
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setUsers((prev) => (prev ?? []).filter((u) => u.id !== user.id));
    } catch {
      setError("No se pudo eliminar el usuario.");
    } finally {
      setPending(null);
    }
  }

  if (users === null) return <Spinner label="Cargando usuarios..." />;

  return (
    <div className="flex flex-1 flex-col gap-5 px-5 pb-10">
      <p className="text-sm text-lilac-light">
        Cada persona entra con su propio usuario y puede cargar canciones y armar powers. Solo
        vos, como dueño, podés agregar o sacar usuarios.
      </p>

      {error && <p className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">{error}</p>}

      <ul className="flex flex-col gap-1.5">
        <li className="flex items-center justify-between rounded-xl border border-accent/60 bg-accent/10 px-3 py-2.5">
          <span className="text-sm text-mist">{ownerName}</span>
          <span className="text-xs text-accent">Dueño</span>
        </li>
        {users.map((user) => (
          <li
            key={user.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-plum/60 bg-night/40 px-3 py-2.5"
          >
            <span className="min-w-0 truncate text-sm text-mist">{user.username}</span>
            <button
              onClick={() => setPending(user)}
              aria-label={`Eliminar a ${user.username}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-plum text-mist"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded-2xl border border-plum/60 bg-night/40 p-4">
        <span className="text-xs uppercase tracking-wide text-lilac-light">Agregar usuario</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Usuario (ej: maria)"
          autoCapitalize="none"
          autoComplete="off"
          className={inputClass}
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Contraseña (mínimo 8 caracteres)"
          autoComplete="new-password"
          className={inputClass}
        />
        <button
          type="submit"
          disabled={saving || !username.trim() || !password}
          className="rounded-full bg-accent py-3 text-sm font-semibold text-night disabled:opacity-60"
        >
          {saving ? "Creando..." : "Crear usuario"}
        </button>
      </form>

      <ConfirmDialog
        open={pending !== null}
        title={`¿Eliminar a "${pending?.username}"?`}
        message="Va a perder el acceso enseguida. Lo que cargó se queda."
        onConfirm={handleDelete}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
