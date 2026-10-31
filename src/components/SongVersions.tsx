"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import Spinner from "@/components/Spinner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { collapseSame, diffLines, hasChanges } from "@/lib/lineDiff";
import { timeAgo } from "@/lib/timeAgo";

type Reason = "update" | "delete" | "chords" | "restore" | "revert";

type Version = {
  id: string;
  savedAt: string;
  savedBy: string;
  reason: Reason;
  title: string;
  artist: string;
  originalKey: string;
  body: string;
};

type CurrentSong = { title: string; artist: string; originalKey: string; body: string };

const REASON_TEXT: Record<Reason, string> = {
  update: "editó",
  delete: "borró",
  chords: "buscó acordes",
  restore: "restauró",
  revert: "revirtió",
};

const dateFormat = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const LINE_STYLE = {
  same: "text-lilac-light",
  added: "bg-accent/15 text-mist",
  removed: "bg-plum/70 text-lilac-light line-through decoration-lilac-light/60",
} as const;
const LINE_MARK = { same: " ", added: "+", removed: "-" } as const;

export default function SongVersions({
  songId,
  current,
}: {
  songId: string;
  current: CurrentSong | null;
}) {
  const router = useRouter();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"changes" | "full">("changes");
  const [confirming, setConfirming] = useState(false);
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/songs/${songId}/versions`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data) => {
        if (!cancelled) setVersions(data.versions ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setError("No pudimos cargar las versiones.");
        setVersions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [songId]);

  const selected = versions?.find((v) => v.id === selectedId) ?? null;

  // Cambios que traería volver a la versión elegida: lo actual -> lo guardado.
  const diff = useMemo(
    () => (selected && current ? diffLines(current.body, selected.body) : null),
    [selected, current]
  );
  const items = useMemo(() => (diff ? collapseSame(diff, 2) : null), [diff]);

  async function handleRevert() {
    if (!selected) return;
    setReverting(true);
    setError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/versions/${selected.id}/revert`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "");
      }
      router.push(`/admin/${songId}/editar`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error && err.message ? err.message : "No se pudo volver a esa versión."
      );
      setConfirming(false);
      setReverting(false);
    }
  }

  if (versions === null) return <Spinner label="Cargando versiones..." />;

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        {current ? (
          <Link href={`/admin/${songId}/editar`} className="text-lilac-light underline">
            Volver al editor
          </Link>
        ) : (
          <Link href="/admin" className="text-lilac-light underline">
            Volver al panel
          </Link>
        )}
      </div>

      {!current && (
        <p className="rounded-xl border border-plum/60 bg-night/40 px-3 py-2 text-sm text-lilac-light">
          Esta canción ya no está en el cancionero (la borraron o está en la papelera). Acá podés
          ver las versiones que quedaron guardadas.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">
          {error}
        </p>
      )}

      {versions.length === 0 ? (
        <div className="py-10 text-center">
          <History size={28} className="mx-auto text-lilac-light" aria-hidden />
          <p className="mt-2 font-display text-lg text-mist">Todavía no hay versiones</p>
          <p className="mt-1 text-sm text-lilac-light">
            Cada vez que alguien cambie esta canción, la versión anterior queda guardada acá.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-lilac-light">
            Elegí una versión para compararla con la actual. Cada una es cómo estaba la canción{" "}
            <em>antes</em> de ese cambio.
          </p>

          <ul className="flex flex-col gap-1.5">
            {versions.map((v) => {
              const isSelected = v.id === selectedId;
              const sameAsCurrent = current !== null && current.body === v.body &&
                current.title === v.title && current.artist === v.artist &&
                current.originalKey === v.originalKey;
              return (
                <li key={v.id}>
                  <button
                    onClick={() => {
                      setSelectedId(isSelected ? null : v.id);
                      setView("changes");
                    }}
                    aria-pressed={isSelected}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                      isSelected
                        ? "border-accent bg-plum/60"
                        : "border-plum/60 bg-night/40 hover:bg-plum/30"
                    }`}
                  >
                    <span className="block text-mist">
                      <span className="font-semibold">{v.savedBy}</span>{" "}
                      {REASON_TEXT[v.reason] ?? v.reason}
                      {sameAsCurrent && (
                        <span className="ml-2 rounded-full border border-plum px-2 py-0.5 text-[10px] text-lilac-light">
                          Igual a la actual
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-lilac-light">
                      <time dateTime={v.savedAt} title={dateFormat.format(new Date(v.savedAt))}>
                        {dateFormat.format(new Date(v.savedAt))} · {timeAgo(v.savedAt)}
                      </time>
                      {" · "}
                      {v.title} · tono {v.originalKey}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {selected && (
        <section
          aria-label="Comparación con la versión actual"
          className="flex flex-col gap-3 rounded-2xl border border-plum/60 bg-night/40 p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg text-mist">
              {current ? "Comparación con la actual" : "Contenido de esta versión"}
            </h2>
            {current && (
              <div role="group" aria-label="Qué mostrar" className="flex gap-1 text-xs">
                {(
                  [
                    ["changes", "Cambios"],
                    ["full", "Versión completa"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setView(value)}
                    aria-pressed={view === value}
                    className={`rounded-full px-3 py-1 ${
                      view === value ? "bg-accent text-night" : "bg-plum text-mist"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-lilac-light">
            <dt>Título</dt>
            <dd className="text-mist">
              {selected.title}
              {current && current.title !== selected.title && (
                <span className="text-lilac-light"> (ahora: {current.title})</span>
              )}
            </dd>
            <dt>Artista</dt>
            <dd className="text-mist">
              {selected.artist || "Sin artista"}
              {current && current.artist !== selected.artist && (
                <span className="text-lilac-light"> (ahora: {current.artist || "Sin artista"})</span>
              )}
            </dd>
            <dt>Tono</dt>
            <dd className="text-mist">
              {selected.originalKey}
              {current && current.originalKey !== selected.originalKey && (
                <span className="text-lilac-light"> (ahora: {current.originalKey})</span>
              )}
            </dd>
          </dl>

          {current && view === "changes" && diff && items ? (
            hasChanges(diff) ? (
              <>
                <p className="text-xs text-lilac-light">
                  Si volvés a esta versión, <span className="text-mist">+</span> se agrega y{" "}
                  <span className="text-mist">-</span> se quita de la letra actual.
                </p>
                <pre
                  className="overflow-x-auto rounded-xl bg-plum-deep/60 p-2 font-mono text-xs leading-relaxed"
                  aria-label="Diferencias de la letra"
                >
                  {items.map((item, idx) =>
                    item.kind === "gap" ? (
                      <span key={idx} className="block px-1 py-0.5 text-center text-lilac-light/70">
                        … {item.hidden} {item.hidden === 1 ? "línea igual" : "líneas iguales"} …
                      </span>
                    ) : (
                      <span key={idx} className={`block whitespace-pre px-1 ${LINE_STYLE[item.kind]}`}>
                        {LINE_MARK[item.kind]} {item.text || " "}
                      </span>
                    )
                  )}
                </pre>
              </>
            ) : (
              <p className="text-sm text-lilac-light">La letra es idéntica a la actual.</p>
            )
          ) : (
            <pre className="max-h-96 overflow-auto whitespace-pre rounded-xl bg-plum-deep/60 p-2 font-mono text-xs leading-relaxed text-mist">
              {selected.body}
            </pre>
          )}

          <button
            onClick={() => setConfirming(true)}
            disabled={reverting}
            className="rounded-full bg-accent py-2.5 text-sm font-semibold text-night disabled:opacity-60"
          >
            {current ? "Volver a esta versión" : "Recuperar esta versión"}
          </button>
        </section>
      )}

      <ConfirmDialog
        open={confirming}
        title="¿Volver a esta versión?"
        message={
          reverting
            ? "Volviendo..."
            : current
              ? "La canción va a quedar como estaba entonces. La versión actual se guarda en el historial, así que podés deshacerlo."
              : "Vamos a recuperar la canción con el contenido de esta versión."
        }
        confirmLabel="Volver a esta versión"
        danger
        onConfirm={handleRevert}
        onCancel={() => !reverting && setConfirming(false)}
      />
    </div>
  );
}
