"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ListMusic, Music, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { SongSummary } from "@/lib/types";
import Spinner from "@/components/Spinner";
import ConfirmDialog from "@/components/ConfirmDialog";
import UndoToast from "@/components/UndoToast";

const UNDO_MS = 5000;

export default function AdminSongList() {
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SongSummary | null>(null);
  const [pendingUndo, setPendingUndo] = useState<SongSummary | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load(q: string) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (q) params.set("q", q);
      const res = await fetch(`/api/songs?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSongs(data.songs);
    } catch {
      setError("No pudimos cargar las canciones.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = setTimeout(() => load(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  function handleDelete() {
    if (!pendingDelete) return;
    const song = pendingDelete;
    setSongs((prev) => prev.filter((s) => s.id !== song.id));
    setPendingDelete(null);
    setPendingUndo(song);

    undoTimer.current = setTimeout(async () => {
      await fetch(`/api/songs/${song.id}`, { method: "DELETE" });
      setPendingUndo((prev) => (prev?.id === song.id ? null : prev));
    }, UNDO_MS);
  }

  function handleUndo() {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setPendingUndo(null);
    load(query.trim());
  }

  return (
    <div className="flex flex-1 flex-col px-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lilac-light" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar..."
            className="w-full rounded-full border border-plum bg-night/50 py-2.5 pl-10 pr-4 text-sm text-mist placeholder:text-lilac-light/70"
          />
        </div>
        <Link
          href="/admin/nueva"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-night"
          aria-label="Nueva canción"
        >
          <Plus size={20} />
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/admin/powers"
          className="flex items-center gap-1.5 rounded-full bg-plum px-3.5 py-2 text-sm text-mist"
        >
          <ListMusic size={16} />
          Powers
        </Link>
        <Link
          href="/admin/auto-acordes"
          className="flex items-center gap-1.5 rounded-full bg-plum px-3.5 py-2 text-sm text-mist"
        >
          <Music size={16} />
          Buscar acordes
        </Link>
      </div>

      {error && <p className="py-6 text-center text-sm text-lilac-light">{error}</p>}
      {loading && <Spinner label="Cargando canciones..." />}

      {!loading && songs.length === 0 && !error && (
        <p className="py-10 text-center text-sm text-lilac-light">Todavía no cargaste ninguna canción.</p>
      )}

      {!loading && songs.length > 0 && (
        <ul className="flex flex-col gap-2 pb-10">
          {songs.map((song) => (
            <li
              key={song.id}
              className="flex items-center justify-between gap-2 rounded-2xl border border-plum/60 bg-night/40 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-mist">{song.title}</p>
                <p className="truncate text-sm text-lilac-light">{song.artist}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`/admin/${song.id}/editar`}
                  aria-label="Editar"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-plum text-mist"
                >
                  <Pencil size={16} />
                </Link>
                <button
                  onClick={() => setPendingDelete(song)}
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
        title={`¿Eliminar "${pendingDelete?.title}"?`}
        message="Vas a poder deshacerlo unos segundos después."
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {pendingUndo && (
        <UndoToast message={`"${pendingUndo.title}" eliminada`} onUndo={handleUndo} />
      )}
    </div>
  );
}
