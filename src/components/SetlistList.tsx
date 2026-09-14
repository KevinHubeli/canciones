"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import type { SetlistSummary } from "@/lib/setlists";
import Spinner from "@/components/Spinner";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function SetlistList() {
  const [setlists, setSetlists] = useState<SetlistSummary[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SetlistSummary | null>(null);

  async function handleShare(id: string) {
    const url = `${window.location.origin}/powers/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      prompt("Copiá el link:", url);
    }
  }

  async function load() {
    const res = await fetch("/api/setlists");
    const data = await res.json();
    setSetlists(data.setlists ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete() {
    if (!pendingDelete) return;
    const res = await fetch(`/api/setlists/${pendingDelete.id}`, { method: "DELETE" });
    if (res.ok) setSetlists((prev) => prev?.filter((s) => s.id !== pendingDelete.id) ?? null);
    setPendingDelete(null);
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
              <Link href={`/powers/${s.id}`} className="min-w-0 flex-1">
                <p className="truncate font-medium text-mist">{s.title}</p>
                <p className="text-sm text-lilac-light">{s.songCount} canciones</p>
              </Link>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => handleShare(s.id)}
                  aria-label="Copiar link para compartir"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-plum/60 text-mist"
                >
                  {copiedId === s.id ? <Check size={16} /> : <Share2 size={16} />}
                </button>
                <Link
                  href={`/admin/powers/${s.id}/editar`}
                  aria-label="Editar"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-plum/60 text-mist"
                >
                  <Pencil size={16} />
                </Link>
                <button
                  onClick={() => setPendingDelete(s)}
                  aria-label="Eliminar"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-plum/60 text-mist"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`¿Eliminar el power "${pendingDelete?.title}"?`}
        message="Esta acción no se puede deshacer."
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
