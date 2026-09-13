"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Search, X } from "lucide-react";
import type { SongSummary } from "@/lib/types";
import type { Setlist } from "@/lib/setlists";
import { SONG_TAGS } from "@/lib/tags";
import Spinner from "@/components/Spinner";

export default function SetlistBuilder({ initial }: { initial?: Setlist }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [selected, setSelected] = useState<SongSummary[]>(initial?.songs ?? []);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [results, setResults] = useState<SongSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "200" });
        if (query.trim()) params.set("q", query.trim());
        if (activeTag) params.set("tag", activeTag);
        const res = await fetch(`/api/songs?${params}`);
        const data = await res.json();
        setResults(data.songs ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [query, activeTag]);

  const selectedIds = new Set(selected.map((s) => s.id));

  function addSong(song: SongSummary) {
    if (selectedIds.has(song.id)) return;
    setSelected((prev) => [...prev, song]);
  }

  function removeSong(id: string) {
    setSelected((prev) => prev.filter((s) => s.id !== id));
  }

  function move(index: number, dir: -1 | 1) {
    setSelected((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSave() {
    if (!title.trim() || selected.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(initial ? `/api/setlists/${initial.id}` : "/api/setlists", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), songIds: selected.map((s) => s.id) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar el power.");
        return;
      }
      router.push("/admin/powers");
      router.refresh();
    } catch {
      setError("No se pudo guardar el power.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pb-10">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Nombre del power (ej: Domingo 14/09 - Mañana)"
        className="rounded-2xl border border-plum bg-night/50 px-4 py-3 text-mist placeholder:text-lilac-light/70 focus:outline-none focus:ring-2 focus:ring-accent"
      />

      {selected.length > 0 && (
        <div className="rounded-2xl border border-plum/60 bg-night/40 p-3">
          <span className="mb-2 block text-xs uppercase tracking-wide text-lilac-light">
            Orden del power ({selected.length})
          </span>
          <ul className="flex flex-col gap-1.5">
            {selected.map((song, i) => (
              <li
                key={song.id}
                className="flex items-center gap-2 rounded-xl bg-night/60 px-3 py-2"
              >
                <span className="w-5 shrink-0 text-center text-xs text-lilac-light">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-mist">{song.title}</span>
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Subir"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-lilac-light disabled:opacity-30"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === selected.length - 1}
                  aria-label="Bajar"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-lilac-light disabled:opacity-30"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  onClick={() => removeSong(song.id)}
                  aria-label="Quitar"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-lilac-light"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lilac-light" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar canción para agregar..."
          className="w-full rounded-full border border-plum bg-night/50 py-2.5 pl-10 pr-4 text-sm text-mist placeholder:text-lilac-light/70"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {SONG_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => setActiveTag((prev) => (prev === tag ? null : tag))}
            aria-pressed={activeTag === tag}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTag === tag
                ? "border-accent bg-accent text-night"
                : "border-plum bg-night/50 text-lilac-light"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label="Buscando..." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {results.map((song) => {
            const added = selectedIds.has(song.id);
            return (
              <li
                key={song.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-plum/60 bg-night/40 px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-mist">{song.title}</span>
                  <span className="block truncate text-xs text-lilac-light">{song.artist}</span>
                </span>
                <button
                  onClick={() => addSong(song)}
                  disabled={added}
                  aria-label="Agregar al power"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-mist disabled:opacity-30"
                >
                  <Plus size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving || !title.trim() || selected.length === 0}
        className="sticky bottom-4 rounded-full bg-accent py-3 text-sm font-semibold text-night shadow-xl disabled:opacity-60"
      >
        {saving ? "Guardando..." : "Guardar power"}
      </button>
    </div>
  );
}
