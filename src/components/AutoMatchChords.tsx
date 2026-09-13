"use client";

import { useEffect, useRef, useState } from "react";

type SongStub = { id: string; title: string };
type LogEntry = { title: string; status: "matched" | "skipped" | "error" };

export default function AutoMatchChords() {
  const [songs, setSongs] = useState<SongStub[] | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const stopRef = useRef(false);

  useEffect(() => {
    fetch("/api/songs/without-chords")
      .then((res) => res.json())
      .then((data) => setSongs(data.songs ?? []));
  }, []);

  async function handleRun() {
    if (!songs || songs.length === 0) return;
    setRunning(true);
    setProgress(0);
    setLog([]);
    stopRef.current = false;

    for (let i = 0; i < songs.length; i++) {
      if (stopRef.current) break;
      const song = songs[i];
      try {
        const res = await fetch(`/api/songs/${song.id}/match-lacuerda`, { method: "POST" });
        const data = await res.json();
        setLog((prev) => [
          ...prev,
          { title: song.title, status: data.matched ? "matched" : "skipped" },
        ]);
      } catch {
        setLog((prev) => [...prev, { title: song.title, status: "error" }]);
      }
      setProgress(i + 1);
      // Pausa chica entre pedidos para no saturar a LaCuerda.
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    setRunning(false);
  }

  if (songs === null) {
    return <p className="px-5 text-sm text-lilac-light">Cargando...</p>;
  }

  const matchedCount = log.filter((l) => l.status === "matched").length;
  const skippedCount = log.filter((l) => l.status === "skipped").length;

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pb-10">
      <p className="text-sm text-lilac-light">
        Hay <strong className="text-mist">{songs.length}</strong> canciones sin acordes.
        Esto busca cada título en LaCuerda y solo trae los acordes si encuentra una
        coincidencia exacta de nombre — si no, la deja como está para agregarla a mano.
      </p>

      {!running && songs.length > 0 && (
        <button
          onClick={handleRun}
          className="rounded-full bg-accent py-3 text-sm font-semibold text-night"
        >
          Buscar acordes para las {songs.length} canciones
        </button>
      )}

      {running && (
        <button
          onClick={() => {
            stopRef.current = true;
          }}
          className="rounded-full bg-white/10 py-3 text-sm font-semibold text-mist"
        >
          Detener
        </button>
      )}

      {(running || log.length > 0) && (
        <div>
          <div className="mb-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${songs.length ? (progress / songs.length) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-lilac-light">
            {progress}/{songs.length} · {matchedCount} con acordes encontrados ·{" "}
            {skippedCount} sin coincidencia
          </p>
        </div>
      )}

      {log.length > 0 && (
        <ul className="flex flex-col gap-1 pb-6">
          {[...log].reverse().map((entry, i) => (
            <li
              key={i}
              className={`rounded-xl px-3 py-2 text-sm ${
                entry.status === "matched"
                  ? "bg-white/10 text-mist"
                  : "bg-transparent text-lilac-light"
              }`}
            >
              {entry.status === "matched" ? "✓" : entry.status === "error" ? "!" : "–"}{" "}
              {entry.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
