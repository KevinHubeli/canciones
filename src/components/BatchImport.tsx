"use client";

import { useRef, useState } from "react";

const MAX_URLS = 10;
const CHUNK = 3;

type ImportedSong = { title: string; artist: string; originalKey: string; body: string };

type Item = {
  url: string;
  status: "pending" | "reading" | "saving" | "saved" | "duplicate" | "error";
  song?: ImportedSong;
  title?: string;
  savedId?: string;
  duplicateOf?: { id: string; title: string };
  error?: string;
};

const STATUS_TEXT: Record<Item["status"], string> = {
  pending: "En espera",
  reading: "Leyendo...",
  saving: "Guardando...",
  saved: "Cargada",
  duplicate: "Ya existe",
  error: "No se pudo",
};

/**
 * Pega varias URLs (una por línea, hasta 10), lee cada canción en el servidor
 * y la carga como canción nueva. Si ya hay una con el mismo título no la pisa:
 * avisa y deja elegir entre abrir la existente o cargarla igual.
 */
export default function BatchImport() {
  const [text, setText] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);

  const patch = (url: string, changes: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.url === url ? { ...it, ...changes } : it)));

  async function createSong(item: Item, force: boolean) {
    if (!item.song) return;
    patch(item.url, { status: "saving", error: undefined });
    try {
      const res = await fetch("/api/songs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...item.song, force }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.duplicateOf) {
        patch(item.url, { status: "duplicate", duplicateOf: data.duplicateOf });
        return;
      }
      if (!res.ok) {
        patch(item.url, { status: "error", error: data.error ?? "No se pudo guardar la canción." });
        return;
      }
      patch(item.url, { status: "saved", savedId: data.song?.id, duplicateOf: undefined });
    } catch {
      patch(item.url, { status: "error", error: "No pudimos conectarnos para guardarla." });
    }
  }

  async function handleRun() {
    const urls = [...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
    if (urls.length === 0) return;
    if (urls.length > MAX_URLS) {
      setError(`Pegá hasta ${MAX_URLS} URLs por vez (pegaste ${urls.length}).`);
      return;
    }
    setError(null);
    stopRef.current = false;
    setRunning(true);
    setItems(urls.map((url) => ({ url, status: "pending" })));

    for (let i = 0; i < urls.length; i += CHUNK) {
      if (stopRef.current) break;
      const chunk = urls.slice(i, i + CHUNK);
      chunk.forEach((url) => patch(url, { status: "reading" }));
      let results: {
        url: string;
        ok: boolean;
        song?: ImportedSong;
        duplicateOf?: { id: string; title: string };
        error?: string;
      }[] = [];
      let failure: string | null = null;
      try {
        const res = await fetch("/api/songs/import/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: chunk }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) results = data.results ?? [];
        else failure = data.error ?? "No pudimos leer esas páginas.";
      } catch {
        failure = "No pudimos conectarnos para leer esas páginas.";
      }

      for (const url of chunk) {
        const r = results.find((x) => x.url === url);
        if (!r || !r.ok || !r.song) {
          patch(url, { status: "error", error: r?.error ?? failure ?? "No pudimos leer esa página." });
          continue;
        }
        const item: Item = { url, status: "saving", song: r.song, title: r.song.title };
        patch(url, { song: r.song, title: r.song.title });
        if (r.duplicateOf) {
          patch(url, { status: "duplicate", duplicateOf: r.duplicateOf });
          continue;
        }
        if (stopRef.current) {
          patch(url, { status: "pending" });
          continue;
        }
        await createSong(item, false);
      }
    }
    setRunning(false);
  }

  const saved = items.filter((i) => i.status === "saved").length;
  const dupes = items.filter((i) => i.status === "duplicate").length;
  const failed = items.filter((i) => i.status === "error").length;

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        inputMode="url"
        spellCheck={false}
        autoCapitalize="none"
        placeholder={"Una URL por línea (hasta 10)\nhttps://www.cifraclub.com/artista/cancion/\nhttps://acordes.lacuerda.net/artista/cancion/"}
        className="rounded-xl border border-plum bg-night/50 px-3 py-2 font-mono text-xs text-mist placeholder:text-lilac-light/70"
      />
      <div className="flex gap-2">
        {!running ? (
          <button
            type="button"
            onClick={handleRun}
            disabled={!text.trim()}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-night disabled:opacity-60"
          >
            Importar y cargar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              stopRef.current = true;
            }}
            className="rounded-full bg-plum px-4 py-2 text-sm font-semibold text-mist"
          >
            Detener
          </button>
        )}
      </div>
      <p className="text-xs text-lilac-light">
        Cada URL se carga como una canción nueva (no toca este formulario). Si ya hay una con el
        mismo título te avisa antes de cargarla.
      </p>

      {error && <p className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">{error}</p>}

      {items.length > 0 && (
        <div aria-live="polite">
          <p className="text-xs text-lilac-light">
            {saved} cargadas · {dupes} ya existían · {failed} con error
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.url} className="rounded-xl bg-night/40 px-3 py-2 text-sm text-mist">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">{item.title ?? item.url}</span>
                  <span className="shrink-0 text-xs text-lilac-light">{STATUS_TEXT[item.status]}</span>
                </div>
                {item.title && <p className="truncate text-xs text-lilac-light">{item.url}</p>}
                {item.status === "error" && (
                  <p className="mt-1 text-xs text-chord-gold">{item.error}</p>
                )}
                {item.status === "duplicate" && item.duplicateOf && (
                  <div className="mt-1 flex flex-wrap gap-3 text-xs">
                    <span className="text-lilac-light">
                      Ya hay una llamada &quot;{item.duplicateOf.title}&quot;.
                    </span>
                    <a href={`/admin/${item.duplicateOf.id}/editar`} className="underline">
                      Abrir la que ya existe
                    </a>
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => createSong(item, true)}
                      className="font-semibold underline disabled:opacity-60"
                    >
                      Cargar igual
                    </button>
                  </div>
                )}
                {item.status === "saved" && item.savedId && (
                  <a href={`/admin/${item.savedId}/editar`} className="mt-1 inline-block text-xs underline">
                    Abrir para revisar
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
