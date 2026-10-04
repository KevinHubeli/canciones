"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import type { SetlistSummary } from "@/lib/setlists";
import Spinner from "@/components/Spinner";
import ConfirmDialog from "@/components/ConfirmDialog";
import UndoToast from "@/components/UndoToast";

const UNDO_MS = 5000;

export default function SetlistList() {
  const [setlists, setSetlists] = useState<SetlistSummary[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SetlistSummary | null>(null);
  const [pendingUndo, setPendingUndo] = useState<SetlistSummary | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<SetlistSummary | null>(null);
  const [loadError, setLoadError] = useState(false);
  const router = useRouter();
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);

  // Copia el power (canciones, tonos y divisores) y abre la copia para editarla.
  async function handleCopy(id: string) {
    setCopyingId(id);
    setCopyError(false);
    try {
      const res = await fetch(`/api/setlists/${id}/duplicate`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      router.push(`/admin/powers/${data.setlist.id}/editar`);
    } catch {
      setCopyError(true);
      setCopyingId(null);
    }
  }

  // Ver AdminSongList: el borrado pendiente se manda ya si se borra otro o se sale de la pantalla.
  function flushPending() {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    const setlist = pendingRef.current;
    pendingRef.current = null;
    if (setlist) {
      fetch(`/api/setlists/${setlist.id}`, { method: "DELETE", keepalive: true }).catch(() => {});
    }
  }

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
    try {
      const res = await fetch("/api/setlists");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLoadError(false);
      setSetlists(data.setlists ?? []);
    } catch {
      setLoadError(true);
      setSetlists((prev) => prev ?? []);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/setlists")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data) => {
        if (cancelled) return;
        setLoadError(false);
        setSetlists(data.setlists ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
        setSetlists([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => flushPending();
  }, []);

  function handleDelete() {
    if (!pendingDelete) return;
    const setlist = pendingDelete;
    flushPending();
    setSetlists((prev) => prev?.filter((s) => s.id !== setlist.id) ?? null);
    setPendingDelete(null);
    setPendingUndo(setlist);
    pendingRef.current = setlist;

    undoTimer.current = setTimeout(() => {
      flushPending();
      setPendingUndo((prev) => (prev?.id === setlist.id ? null : prev));
    }, UNDO_MS);
  }

  function handleUndo() {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    pendingRef.current = null;
    setPendingUndo(null);
    load();
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

      {copyError && (
        <p className="mb-3 rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">
          No se pudo copiar el power.
        </p>
      )}

      {setlists === null && <Spinner label="Cargando powers..." />}

      {loadError && (
        <p className="py-6 text-center text-sm text-lilac-light">
          No pudimos cargar los powers. Revisá que sigas con la sesión iniciada.
        </p>
      )}

      {setlists?.length === 0 && !loadError && (
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
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-plum text-mist"
                >
                  {copiedId === s.id ? <Check size={16} /> : <Share2 size={16} />}
                </button>
                <button
                  onClick={() => handleCopy(s.id)}
                  disabled={copyingId !== null}
                  aria-label="Copiar este power para armar uno nuevo"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-plum text-mist disabled:opacity-50"
                >
                  <Copy size={16} />
                </button>
                <Link
                  href={`/admin/powers/${s.id}/editar`}
                  aria-label="Editar"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-plum text-mist"
                >
                  <Pencil size={16} />
                </Link>
                <button
                  onClick={() => setPendingDelete(s)}
                  aria-label="Eliminar"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-plum text-mist"
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
        message="Vas a poder deshacerlo unos segundos después."
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {pendingUndo && (
        <UndoToast message={`Power "${pendingUndo.title}" eliminado`} onUndo={handleUndo} />
      )}
    </div>
  );
}
