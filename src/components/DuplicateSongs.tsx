"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GitMerge, Pencil, Trash2 } from "lucide-react";
import type { DuplicateGroup, DuplicateSong } from "@/lib/songs";
import Spinner from "@/components/Spinner";
import ConfirmDialog from "@/components/ConfirmDialog";

/** La copia que conviene conservar: la que tiene más acordes y, si empatan, la más larga. */
function bestOf(songs: DuplicateSong[]): string {
  return [...songs].sort(
    (a, b) => b.chordCount - a.chordCount || b.bodyLength - a.bodyLength
  )[0].id;
}

const groupKey = (g: DuplicateGroup) => g.songs.map((s) => s.id).join("-");

/** Manda una canción a la papelera; true si salió bien. */
async function trashSong(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/songs/${id}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

export default function DuplicateSongs() {
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<DuplicateSong | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Copia elegida para conservar en cada grupo (si no se eligió, la recomendada).
  const [keepChoice, setKeepChoice] = useState<Record<string, string>>({});
  const [pendingMerge, setPendingMerge] = useState<DuplicateGroup | null>(null);

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

  function removeFromGroups(ids: string[]) {
    // Si en el grupo queda una sola canción, ya no es un duplicado.
    setGroups((prev) =>
      (prev ?? [])
        .map((g) => ({ ...g, songs: g.songs.filter((s) => !ids.includes(s.id)) }))
        .filter((g) => g.songs.length > 1)
    );
  }

  async function handleDelete() {
    if (!pending) return;
    const song = pending;
    setDeleting(true);
    setError(null);
    setNotice(null);
    if (await trashSong(song.id)) {
      removeFromGroups([song.id]);
      setNotice(`"${song.title}" está en la papelera.`);
      setPending(null);
    } else {
      setError("No se pudo mandar la canción a la papelera.");
    }
    setDeleting(false);
  }

  // Fusionar: se conserva la elegida y las otras copias van a la papelera.
  async function handleMerge() {
    if (!pendingMerge) return;
    const group = pendingMerge;
    const keepId = keepChoice[groupKey(group)] ?? bestOf(group.songs);
    const others = group.songs.filter((s) => s.id !== keepId);
    setDeleting(true);
    setError(null);
    setNotice(null);
    const done: string[] = [];
    for (const song of others) {
      if (await trashSong(song.id)) done.push(song.id);
    }
    removeFromGroups(done);
    setPendingMerge(null);
    setDeleting(false);
    if (done.length === others.length) {
      setNotice(
        `Quedó una sola copia de "${group.title}". ${
          done.length === 1 ? "La otra está" : `Las otras ${done.length} están`
        } en la papelera.`
      );
    } else {
      setError(
        `Solo se pudieron mandar ${done.length} de ${others.length} copias a la papelera. Probá de nuevo.`
      );
    }
  }

  if (groups === null) return <Spinner label="Buscando duplicadas..." />;

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pb-10">
      {error && <p className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">{error}</p>}
      {notice && (
        <p className="rounded-xl bg-plum px-3 py-2 text-sm text-mist">
          {notice}{" "}
          <Link href="/admin/papelera" className="underline">
            Ver papelera
          </Link>
        </p>
      )}

      {groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-lilac-light">
          No hay canciones con el mismo título.
        </p>
      ) : (
        <>
          <p className="text-sm text-lilac-light">
            Estas canciones comparten título. Te marcamos la que tiene más acordes. Elegí cuál
            conservar y fusioná: las otras copias van a la papelera (se pueden restaurar).
          </p>
          {groups.map((group) => {
            const best = bestOf(group.songs);
            const key = groupKey(group);
            const keepId = keepChoice[key] ?? best;
            return (
              <div key={key} className="rounded-2xl border border-plum/60 bg-night/40 p-3">
                <p className="mb-2 text-sm font-semibold text-mist">{group.title}</p>
                <ul className="flex flex-col gap-1.5">
                  {group.songs.map((song) => (
                    <li
                      key={song.id}
                      className={`flex items-center justify-between gap-2 rounded-xl bg-night/60 px-3 py-2 ${
                        song.id === keepId ? "ring-1 ring-accent" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name={`keep-${key}`}
                        checked={song.id === keepId}
                        onChange={() => setKeepChoice((prev) => ({ ...prev, [key]: song.id }))}
                        aria-label={`Conservar esta copia (${song.artist || "sin artista"})`}
                        className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                      />
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
                        aria-label="Mandar a la papelera"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-plum text-mist"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => setPendingMerge(group)}
                  disabled={deleting}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full bg-accent py-2 text-sm font-semibold text-night disabled:opacity-50"
                >
                  <GitMerge size={15} />
                  Fusionar: conservar la elegida
                </button>
              </div>
            );
          })}
        </>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={`¿Mandar esta copia de "${pending?.title}" a la papelera?`}
        message={
          deleting
            ? "Mandando a la papelera..."
            : "Podés restaurarla desde la papelera. Si estaba en algún power, ese power va a quedar sin esta canción."
        }
        confirmLabel="Mandar a la papelera"
        onConfirm={handleDelete}
        onCancel={() => setPending(null)}
      />

      <ConfirmDialog
        open={pendingMerge !== null}
        title={`¿Fusionar "${pendingMerge?.title}"?`}
        message={
          deleting
            ? "Fusionando..."
            : `Te quedás con la copia elegida y ${
                (pendingMerge?.songs.length ?? 2) - 1 === 1
                  ? "la otra va"
                  : `las otras ${(pendingMerge?.songs.length ?? 1) - 1} van`
              } a la papelera (se pueden restaurar). Si alguna estaba en un power, ese power va a quedar sin esa canción: revisalos.`
        }
        confirmLabel="Fusionar"
        onConfirm={handleMerge}
        onCancel={() => setPendingMerge(null)}
      />
    </div>
  );
}
