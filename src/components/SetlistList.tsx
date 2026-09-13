"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { SetlistSummary } from "@/lib/setlists";
import Spinner from "@/components/Spinner";

export default function SetlistList() {
  const [setlists, setSetlists] = useState<SetlistSummary[] | null>(null);

  async function load() {
    const res = await fetch("/api/setlists");
    const data = await res.json();
    setSetlists(data.setlists ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este power?")) return;
    const res = await fetch(`/api/setlists/${id}`, { method: "DELETE" });
    if (res.ok) setSetlists((prev) => prev?.filter((s) => s.id !== id) ?? null);
  }

  return (
    <div className="flex flex-1 flex-col px-5">
      <div className="mb-4 flex justify-end">
        <Link
          href="/admin/powers/nuevo"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-night"
          aria-label="Nuevo power"
        >
          <Plus size={20} />
        </Link>
      </div>

      {setlists === null && <Spinner label="Cargando powers..." />}

      {setlists?.length === 0 && (
        <p className="py-10 text-center text-sm text-lilac-light">Todavía no armaste ningún power.</p>
      )}

      {setlists && setlists.length > 0 && (
        <ul className="flex flex-col gap-2 pb-10">
          {setlists.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-2xl border border-plum/60 bg-night/40 px-4 py-3"
            >
              <Link href={`/admin/powers/${s.id}`} className="min-w-0 flex-1">
                <p className="truncate font-medium text-mist">{s.title}</p>
                <p className="text-sm text-lilac-light">{s.songCount} canciones</p>
              </Link>
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`/admin/powers/${s.id}/editar`}
                  aria-label="Editar"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-mist"
                >
                  <Pencil size={16} />
                </Link>
                <button
                  onClick={() => handleDelete(s.id)}
                  aria-label="Eliminar"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-mist"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
