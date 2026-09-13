"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { ChordDiagram } from "@/app/api/chord-diagram/route";

type Status = "loading" | "ok" | "error";

export default function ChordDiagramPopover({
  chord,
  onClose,
}: {
  chord: string;
  onClose: () => void;
}) {
  const [diagram, setDiagram] = useState<ChordDiagram | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `chord-diagram:${chord}`;

    async function load() {
      setStatus("loading");
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached !== null) {
          const parsed: ChordDiagram | null = JSON.parse(cached);
          if (!cancelled) {
            setDiagram(parsed);
            setStatus(parsed ? "ok" : "error");
          }
          return;
        }
      } catch {
        // sessionStorage no disponible: seguimos y pedimos igual.
      }

      try {
        const res = await fetch(`/api/chord-diagram?name=${encodeURIComponent(chord)}`);
        const data = res.ok ? await res.json() : { diagram: null };
        if (!cancelled) {
          setDiagram(data.diagram ?? null);
          setStatus(data.diagram ? "ok" : "error");
        }
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(data.diagram ?? null));
        } catch {
          // no pasa nada si no se puede cachear en el navegador
        }
      } catch {
        if (!cancelled) {
          setDiagram(null);
          setStatus("error");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [chord]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-t-3xl bg-night p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-lg font-semibold text-chord-gold">{chord}</span>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-mist"
          >
            <X size={16} />
          </button>
        </div>

        {status === "loading" && (
          <p className="py-6 text-center text-sm text-lilac-light">Buscando el diagrama...</p>
        )}
        {status === "error" && (
          <p className="py-6 text-center text-sm text-lilac-light">
            Diagrama no disponible para este acorde.
          </p>
        )}
        {status === "ok" && diagram && <FretDiagram frets={diagram.frets} />}
      </div>
    </div>
  );
}

function FretDiagram({ frets }: { frets: number[] }) {
  const fretsUsed = frets.filter((f) => f > 0);
  const baseFret = fretsUsed.length ? Math.min(...fretsUsed) : 1;
  const width = 100;
  const height = 120;
  const stringGap = width / 5;
  const fretGap = height / 4;

  return (
    <svg viewBox={`-10 -14 ${width + 24} ${height + 20}`} className="mx-auto h-44 w-36">
      {[0, 1, 2, 3, 4].map((s) => (
        <line
          key={`string-${s}`}
          x1={s * stringGap}
          y1={0}
          x2={s * stringGap}
          y2={height}
          stroke="#c9b8d9"
          strokeWidth={1}
        />
      ))}
      {[0, 1, 2, 3, 4].map((f) => (
        <line
          key={`fret-${f}`}
          x1={0}
          y1={f * fretGap}
          x2={width}
          y2={f * fretGap}
          stroke="#c9b8d9"
          strokeWidth={f === 0 && baseFret === 1 ? 3 : 1}
        />
      ))}
      {baseFret > 1 && (
        <text x={width + 6} y={fretGap * 0.7} fontSize={10} fill="#c9b8d9">
          {baseFret}
        </text>
      )}
      {frets.map((f, i) => {
        const x = i * stringGap;
        if (f === -1) {
          return (
            <text key={`x-${i}`} x={x} y={-4} fontSize={10} textAnchor="middle" fill="#f0824a">
              ×
            </text>
          );
        }
        if (f === 0) {
          return <circle key={`o-${i}`} cx={x} cy={-6} r={3} fill="none" stroke="#c9b8d9" strokeWidth={1} />;
        }
        const rel = f - baseFret + 1;
        return <circle key={`d-${i}`} cx={x} cy={(rel - 0.5) * fretGap} r={5} fill="#e8a94a" />;
      })}
    </svg>
  );
}
