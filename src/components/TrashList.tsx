"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RotateCcw, Trash2 } from "lucide-react";
import Spinner from "@/components/Spinner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { timeAgo } from "@/lib/timeAgo";

type TrashedSong = { id: string; title: string; artist: string; deletedAt: string };

// Los horarios se muestran en hora de Argentina sin importar dónde corra el navegador.
const dateFormat = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default function TrashList() {
  const [songs, setSongs] = useState<TrashedSong[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; songId?: string } | null>(null);
  const [restoring, setRestoring] = useState<Set<string>>(new Set());
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [emptying, setEmptying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/songs/trash")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data) => {
        if (!cancelled) setSongs(data.songs ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setError("No pudimos cargar la papelera.");
        setSongs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRestore(song: TrashedSong) {
    setError(null);
    setNotice(null);
    setRestoring((prev) => new Set(prev).add(song.id));
    try {
      const res = await fetch(`/api/songs/${song.id}/restore`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "");
      }
      setSongs((prev) => (prev ?? []).filter((s) => s.id !== song.id));
      setNotice({ text: `Restauramos "${song.title}".`, songId: song.id });
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : `No se pudo restaurar "${song.title}".`
      );
    } finally {
      setRestoring((prev) => {
        const next = new Set(prev);
        next.delete(song.id);
        return next;
      });
    }
  }

  async function handleEmpty() {
    setEmptying(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/songs/trash", { method: "DELETE" });
      if (!res.ok) throw new Error();
      const data = await res.json().catch(() => ({}));
      const purged = typeof data.purged === "number" ? data.purged : (songs?.length ?? 0);
      setSongs([]);
      setNotice({
        text:
          purged === 1
            ? "Se eliminó 1 canción para siempre."
            : `Se eliminaron ${purged} canciones para siempre.`,
      });
      setConfirmEmpty(false);
    } catch {
      setError("No se pudo vaciar la papelera.");
      setConfirmEmpty(false);
    } finally {
      setEmptying(false);
    }
  }

  if (songs === null) return <Spinner label="Cargando la papelera..." />;

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pb-10">
      {error && (
        <p role="alert" className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-plum/60 bg-night/40 px-3 py-2 text-sm text-mist"
        >
          <span>{notice.text}</span>
          {notice.songId && (
            <Link href={`/admin/${notice.songId}/editar`} className="text-chord-gold underline">
              Abrir
            </Link>
          )}
        </p>
      )}

      {songs.length === 0 ? (
        <div className="py-10 text-center">
          <p className="font-display text-lg text-mist">La papelera está vacía</p>
          <p className="mt-1 text-sm text-lilac-light">
            Cuando elimines una canción vas a poder recuperarla desde acá.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-lilac-light">
              {songs.length === 1 ? "1 canción borrada" : `${songs.length} canciones borradas`}.
              Podés restaurarlas o vaciar la papelera para siempre.
            </p>
            <button
              onClick={() => setConfirmEmpty(true)}
              disabled={emptying}
              className="flex items-center gap-1.5 rounded-full bg-plum px-4 py-2 text-sm font-medium text-mist disabled:opacity-50"
            >
              <Trash2 size={14} />
              Vaciar papelera
            </button>
          </div>

          <ul className="flex flex-col gap-1.5">
            {songs.map((song) => {
              const busy = restoring.has(song.id);
              return (
                <li
                  key={song.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-plum/60 bg-night/40 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-mist">{song.title}</p>
                    <p className="truncate text-xs text-lilac-light">
                      {song.artist || "Sin artista"} ·{" "}
                      <time dateTime={song.deletedAt} title={dateFormat.format(new Date(song.deletedAt))}>
                        borrada {timeAgo(song.deletedAt)}
                      </time>
                    </p>
                  </div>
                  <button
                    onClick={() => handleRestore(song)}
                    disabled={busy}
                    className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-night disabled:opacity-60"
                  >
                    <RotateCcw size={13} className={busy ? "animate-spin" : ""} />
                    {busy ? "Restaurando..." : "Restaurar"}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={confirmEmpty}
        title="¿Vaciar la papelera?"
        message={
          emptying
            ? "Eliminando..."
            : "Las canciones de la papelera se eliminan para siempre y no se pueden recuperar."
        }
        confirmLabel="Vaciar papelera"
        onConfirm={handleEmpty}
        onCancel={() => !emptying && setConfirmEmpty(false)}
      />
    </div>
  );
}
