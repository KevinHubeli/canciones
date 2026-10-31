"use client";

import { useEffect, useRef, useState } from "react";

type SongStub = { id: string; title: string };

// "applied": se reemplazó la letra; "match": coincide pero todavía no se aplicó
// (pasada de revisión); "skipped": no hay coincidencia segura; "error": falló
// la red o LaCuerda y se puede reintentar.
type Outcome = {
  id: string;
  title: string;
  kind: "applied" | "match" | "skipped" | "error";
  reason: string;
  url?: string;
  similarity?: number;
  /** El pedido que generó este resultado era una revisión (no escribe). */
  dry: boolean;
};

const REASON_TEXT: Record<string, string> = {
  "no-candidates": "LaCuerda no tiene resultados para este título.",
  "no-exact-title": "Ningún resultado tiene exactamente este título.",
  "artist-mismatch": "Hay una con este título, pero de otro artista.",
  ambiguous: "Hay varias con este título y la canción no tiene artista: cargale el artista y probá de nuevo.",
  "lyrics-differ": "La letra es distinta: parece otra canción con el mismo título.",
  "already-has-chords": "Ya tiene acordes: no se toca.",
  "not-found": "La canción ya no existe.",
};

function pct(similarity?: number): string {
  return similarity === undefined ? "" : ` (parecido ${Math.round(similarity * 100)}%)`;
}

function describe(o: Outcome): string {
  if (o.kind === "applied") return `Acordes agregados${pct(o.similarity)}.`;
  if (o.kind === "match") return `Coincide con LaCuerda${pct(o.similarity)}. Falta aplicarla.`;
  if (o.kind === "error") return o.reason;
  const base = REASON_TEXT[o.reason] ?? "Sin coincidencia segura.";
  return o.reason === "lyrics-differ" ? `${base}${pct(o.similarity)}` : base;
}

const STYLE: Record<Outcome["kind"], { icon: string; className: string }> = {
  applied: { icon: "✓", className: "bg-plum/60 text-mist" },
  match: { icon: "✓", className: "bg-plum/30 text-mist" },
  skipped: { icon: "–", className: "bg-transparent text-lilac-light" },
  error: { icon: "!", className: "bg-accent/20 text-mist" },
};

export default function AutoMatchChords() {
  const [songs, setSongs] = useState<SongStub[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const stopRef = useRef(false);

  useEffect(() => {
    fetch("/api/songs/without-chords")
      .then((res) => {
        if (!res.ok) throw new Error("no ok");
        return res.json();
      })
      .then((data) => setSongs(data.songs ?? []))
      .catch(() => {
        setLoadError(true);
        setSongs([]);
      });
  }, []);

  async function matchOne(song: SongStub, dry: boolean): Promise<Outcome | "unauthorized"> {
    const base = { id: song.id, title: song.title, dry };
    try {
      const res = await fetch(`/api/songs/${song.id}/match-lacuerda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: dry }),
      });
      if (res.status === 401) return "unauthorized";
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) return { ...base, kind: "skipped", reason: "not-found" };
      if (res.status >= 500 || data.reason === "error") {
        return {
          ...base,
          kind: "error",
          reason:
            res.status === 502
              ? "LaCuerda no respondió bien. Se puede reintentar."
              : (data.error ?? "Falló la búsqueda. Se puede reintentar."),
        };
      }
      if (!res.ok) {
        return { ...base, kind: "error", reason: data.error ?? "Falló el pedido. Se puede reintentar." };
      }
      if (data.matched) {
        return {
          ...base,
          kind: dry ? "match" : "applied",
          reason: "ok",
          url: data.url,
          similarity: data.similarity,
        };
      }
      return {
        ...base,
        kind: "skipped",
        reason: data.reason ?? "no-exact-title",
        url: data.url,
        similarity: data.similarity,
      };
    } catch {
      return { ...base, kind: "error", reason: "No pudimos conectarnos. Se puede reintentar." };
    }
  }

  async function runPass(list: SongStub[], dry: boolean) {
    if (list.length === 0) return;
    setRunning(true);
    setNotice(null);
    setProgress({ done: 0, total: list.length });
    stopRef.current = false;

    for (let i = 0; i < list.length; i++) {
      if (stopRef.current) break;
      const result = await matchOne(list[i], dry);
      if (result === "unauthorized") {
        setNotice("Se venció la sesión. Volvé a entrar y seguí desde donde quedaste.");
        break;
      }
      setOutcomes((prev) => ({ ...prev, [result.id]: result }));
      setOrder((prev) => (prev.includes(result.id) ? prev : [...prev, result.id]));
      setProgress({ done: i + 1, total: list.length });
      // Pausa chica entre pedidos para no saturar a LaCuerda.
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    setRunning(false);
  }

  if (songs === null) {
    return <p className="px-5 text-sm text-lilac-light">Cargando...</p>;
  }

  const all = order.map((id) => outcomes[id]).filter(Boolean);
  const applied = all.filter((o) => o.kind === "applied");
  const matches = all.filter((o) => o.kind === "match");
  const skipped = all.filter((o) => o.kind === "skipped");
  const errors = all.filter((o) => o.kind === "error");
  const byId = new Map(songs.map((s) => [s.id, s]));
  const toStubs = (list: Outcome[]) =>
    list.map((o) => byId.get(o.id)).filter((s): s is SongStub => Boolean(s));
  // Las que todavía no se procesaron en ninguna pasada.
  const untouched = songs.filter((s) => !outcomes[s.id]);

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pb-10">
      <p className="text-sm text-lilac-light">
        Hay <strong className="text-mist">{songs.length}</strong> canciones sin acordes. Esto busca
        cada título en LaCuerda y solo trae los acordes si el título es exactamente el mismo, el
        artista coincide y la letra se parece a la que ya tenés. Si no, la deja como está. Antes
        de cambiar una se guarda su versión anterior en el historial.
      </p>

      {loadError && (
        <p role="alert" className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">
          No pudimos cargar la lista de canciones. Volvé a abrir esta pantalla.
        </p>
      )}
      {notice && (
        <p role="alert" className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">
          {notice}
        </p>
      )}

      {!running && (
        <div className="flex flex-col gap-2">
          {untouched.length > 0 && (
            <>
              <button
                onClick={() => runPass(untouched, true)}
                className="rounded-full bg-accent py-3 text-sm font-semibold text-night"
              >
                Revisar primero ({untouched.length}) — no cambia nada
              </button>
              <button
                onClick={() => runPass(untouched, false)}
                className="rounded-full border border-plum py-3 text-sm text-mist"
              >
                Buscar y aplicar directamente
              </button>
            </>
          )}
          {matches.length > 0 && (
            <button
              onClick={() => runPass(toStubs(matches), false)}
              className="rounded-full bg-accent py-3 text-sm font-semibold text-night"
            >
              Aplicar a las {matches.length} que coinciden
            </button>
          )}
          {errors.length > 0 && (
            <button
              onClick={async () => {
                // Cada error se reintenta con el mismo modo (revisar / aplicar) con el que falló.
                const dryOnes = toStubs(errors.filter((o) => o.dry));
                const realOnes = toStubs(errors.filter((o) => !o.dry));
                if (dryOnes.length) await runPass(dryOnes, true);
                if (realOnes.length && !stopRef.current) await runPass(realOnes, false);
              }}
              className="rounded-full border border-plum py-3 text-sm text-mist"
            >
              Reintentar las {errors.length} con error
            </button>
          )}
        </div>
      )}

      {running && (
        <button
          onClick={() => {
            stopRef.current = true;
          }}
          className="rounded-full bg-plum py-3 text-sm font-semibold text-mist"
        >
          Detener
        </button>
      )}

      {(running || all.length > 0) && (
        <div aria-live="polite">
          {running && (
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-plum/60">
              <div
                className="h-full bg-accent transition-all"
                style={{
                  width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
          )}
          <p className="text-xs text-lilac-light">
            {running && `${progress.done}/${progress.total} · `}
            {applied.length} reemplazadas · {matches.length > 0 && `${matches.length} listas para aplicar · `}
            {skipped.length} salteadas · {errors.length} con error
          </p>
        </div>
      )}

      {all.length > 0 && (
        <ul className="flex flex-col gap-1 pb-6">
          {[...all].reverse().map((o) => (
            <li key={o.id} className={`rounded-xl px-3 py-2 text-sm ${STYLE[o.kind].className}`}>
              <div className="flex items-baseline gap-2">
                <span aria-hidden>{STYLE[o.kind].icon}</span>
                <span className="min-w-0 flex-1 truncate">{o.title}</span>
              </div>
              <p className="pl-5 text-xs text-lilac-light">{describe(o)}</p>
              <div className="flex flex-wrap gap-3 pl-5 text-xs">
                {(o.kind === "applied" || o.kind === "match") && (
                  <a href={`/admin/${o.id}/editar`} className="underline">
                    {o.kind === "applied" ? "Revisar en el editor" : "Abrir en el editor"}
                  </a>
                )}
                {o.url && (
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="underline">
                    Ver en LaCuerda ↗
                  </a>
                )}
                {o.kind === "skipped" && o.reason !== "not-found" && (
                  <a href={`/admin/${o.id}/editar`} className="underline">
                    Cargar a mano
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
