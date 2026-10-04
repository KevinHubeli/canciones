"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import type { DuplicateGroup, DuplicateSong } from "@/lib/songs";
import Spinner from "@/components/Spinner";
import ConfirmDialog from "@/components/ConfirmDialog";

/** La copia que conviene conservar: la que tiene más acordes y, si empatan, la más larga. */
function bestOf(songs: DuplicateSong[]): string {
  return [...songs].sort(
    (a, b) => b.chordCount - a.chordCount || b.bodyLength - a.bodyLength
  )[0].id;
}

export default function DuplicateSongs() {
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<DuplicateSong | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/songs/duplicates")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data) => {
        if (!cancelled) setGroups(data.groups ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setError("No pudimos buscar canciones duplicadas.");
        setGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete() {
    if (!pending) return;
    const song = pending;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/songs/${song.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      // Si en el grupo queda una sola canción, ya no es un duplicado.
      setGroups((prev) =>
        (prev ?? [])
          .map((g) => ({ ...g, songs: g.songs.filter((s) => s.id !== song.id) }))
          .filter((g) => g.songs.length > 1)
      );
      setPending(null);
    } catch {
      setError("No se pudo eliminar la canción.");
    } finally {
      setDeleting(false);
    }
  }

  if (groups === null) return <Spinner label="Buscando duplicadas..." />;

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pb-10">
      {error && <p className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">{error}</p>}

      {groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-lilac-light">
          No hay canciones con el mismo título.
        </p>
      ) : (
        <>
          <p className="text-sm text-lilac-light">
            Estas canciones comparten título. Te marcamos la que tiene más acordes para que
            conserves esa y elimines la otra.
          </p>
          {groups.map((group) => {
            const best = bestOf(group.songs);
            return (
              <div
                key={group.songs.map((s) => s.id).join("-")}
                className="rounded-2xl border border-plum/60 bg-night/40 p-3"
              >
                <p className="mb-2 text-sm font-semibold text-mist">{group.title}</p>
                <ul className="flex flex-col gap-1.5">
                  {group.songs.map((song) => (
                    <li
                      key={song.id}
                      className="flex items-center justify-between gap-2 rounded-xl bg-night/60 px-3 py-2"
                    >
                      <Link href={`/canciones/${song.id}`} className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-mist">
                          {song.artist || "Sin artista"} · tono {song.originalKey}
                          {song.id === best && (
                            <span className="ml-2 rounded-full border border-accent px-2 py-0.5 text-[10px] text-accent">
                              Recomendada
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-lilac-light">
                          {song.chordCount} acordes · {song.bodyLength} caracteres · actualizada{" "}
                          {new Date(song.updatedAt).toLocaleDateString("es-AR")}
                        </span>
                      </Link>
                      <Link
                        href={`/admin/${song.id}/editar`}
                        aria-label="Editar"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-plum text-mist"
                      >
                        <Pencil size={14} />
                      </Link>
                      <button
                        onClick={() => setPending(song)}
                        aria-label="Eliminar"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-plum text-mist"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={`¿Eliminar esta copia de "${pending?.title}"?`}
        message={deleting ? "Eliminando..." : "Esta acción no se puede deshacer."}
        onConfirm={handleDelete}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
