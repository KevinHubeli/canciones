"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Minus, Plus, Search, X } from "lucide-react";
import type { SongSummary } from "@/lib/types";
import type { RecentlyUsedSong, Setlist, SetlistSong } from "@/lib/setlists";
import { SONG_TAGS } from "@/lib/tags";
import { displayChord } from "@/lib/chords";
import {
  DIVIDER_NAMES,
  mergeEntries,
  splitEntries,
  type DividerName,
  type SetlistEntry,
} from "@/lib/dividers";
import Spinner from "@/components/Spinner";

export default function SetlistBuilder({ initial }: { initial?: Setlist }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  // Lista única y ordenada: canciones y divisores (ALABANZA, OFRENDA...) mezclados.
  const [entries, setEntries] = useState<SetlistEntry<SetlistSong>[]>(() =>
    mergeEntries(initial?.songs ?? [], initial?.dividers ?? [])
  );
  const selected = entries.flatMap((e) => (e.kind === "song" ? [e.song] : []));
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [results, setResults] = useState<SongSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentlyUsed, setRecentlyUsed] = useState<RecentlyUsedSong[]>([]);

  useEffect(() => {
    fetch("/api/setlists/recent-songs")
      .then((res) => res.json())
      .then((data) => setRecentlyUsed(data.songs ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "500" });
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
    setEntries((prev) => [...prev, { kind: "song", song: { ...song, semitones: 0 } }]);
  }

  function addDivider(name: DividerName) {
    setEntries((prev) => [...prev, { kind: "divider", name }]);
  }

  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function move(index: number, dir: -1 | 1) {
    setEntries((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function changeSemitones(id: string, delta: number) {
    setEntries((prev) =>
      prev.map((e) =>
        e.kind === "song" && e.song.id === id
          ? {
              ...e,
              song: { ...e.song, semitones: Math.max(-11, Math.min(11, e.song.semitones + delta)) },
            }
          : e
      )
    );
  }

  async function handleSave() {
    if (!title.trim() || selected.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const transpose: Record<string, number> = {};
      for (const s of selected) transpose[s.id] = s.semitones;
      const { songs, dividers } = splitEntries(entries);

      const res = await fetch(initial ? `/api/setlists/${initial.id}` : "/api/setlists", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          songIds: songs.map((s) => s.id),
          transpose,
          dividers,
        }),
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

      {error && <p className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving || !title.trim() || selected.length === 0}
        className={`rounded-full py-3 text-sm font-semibold ${
          saving || !title.trim() || selected.length === 0
            ? "bg-plum/60 text-lilac-light"
            : "bg-accent text-night"
        }`}
      >
        {saving
          ? "Guardando..."
          : !title.trim()
            ? "Ponele un nombre al power para guardar"
            : selected.length === 0
              ? "Agregá al menos una canción"
              : "Guardar power"}
      </button>

      {entries.length > 0 && (
        <div className="rounded-2xl border border-plum/60 bg-night/40 p-3">
          <span className="mb-2 block text-xs uppercase tracking-wide text-lilac-light">
            Orden del power ({selected.length})
          </span>
          <ul className="flex flex-col gap-1.5">
            {entries.map((entry, i) => {
              const moveButtons = (
                <>
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Subir"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-plum text-lilac-light disabled:opacity-30"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === entries.length - 1}
                    aria-label="Bajar"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-plum text-lilac-light disabled:opacity-30"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    onClick={() => removeEntry(i)}
                    aria-label="Quitar"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-plum text-lilac-light"
                  >
                    <X size={14} />
                  </button>
                </>
              );

              if (entry.kind === "divider") {
                return (
                  <li
                    key={`divider-${i}`}
                    className="flex items-center gap-2 rounded-xl border border-accent/60 bg-accent/10 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[0.2em] text-accent">
                      {entry.name}
                    </span>
                    {moveButtons}
                  </li>
                );
              }

              const song = entry.song;
              const songNumber = entries.slice(0, i + 1).filter((e) => e.kind === "song").length;
              return (
                <li key={song.id} className="flex flex-col gap-1.5 rounded-xl bg-night/60 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-center text-xs text-lilac-light">
                      {songNumber}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-mist">{song.title}</span>
                    {moveButtons}
                  </div>
                  <div className="ml-7 flex items-center gap-2 text-xs text-lilac-light">
                    <span>Tono:</span>
                    <button
                      onClick={() => changeSemitones(song.id, -1)}
                      aria-label="Bajar semitono"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-plum"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="w-14 text-center font-mono text-chord-gold">
                      {displayChord(song.originalKey, song.semitones, "en")}
                    </span>
                    <button
                      onClick={() => changeSemitones(song.id, 1)}
                      aria-label="Subir semitono"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-plum"
                    >
                      <Plus size={12} />
                    </button>
                    {song.semitones !== 0 && (
                      <span className="text-lilac-light/70">(original: {song.originalKey})</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <span className="mb-2 block text-xs uppercase tracking-wide text-lilac-light">
          Agregar divisor (se suma al final; después lo subís o bajás)
        </span>
        <div className="flex flex-wrap gap-2">
          {DIVIDER_NAMES.map((name) => (
            <button
              key={name}
              onClick={() => addDivider(name)}
              className="rounded-full border border-accent/60 bg-night/50 px-3 py-1.5 text-xs font-medium tracking-wide text-accent"
            >
              + {name}
            </button>
          ))}
        </div>
      </div>

      {!query.trim() && !activeTag && recentlyUsed.length > 0 && (
        <div>
          <span className="mb-2 block text-xs uppercase tracking-wide text-lilac-light">
            Usadas últimamente (para no repetir)
          </span>
          <ul className="flex flex-col gap-1.5">
            {recentlyUsed.map((song) => {
              const added = selectedIds.has(song.id);
              return (
                <li
                  key={song.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-plum/60 bg-night/40 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-mist">{song.title}</span>
                    <span className="block truncate text-xs text-lilac-light">
                      en &quot;{song.lastUsedIn}&quot;
                    </span>
                  </span>
                  <button
                    onClick={() => addSong(song)}
                    disabled={added}
                    aria-label="Agregar al power"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-plum text-mist disabled:opacity-30"
                  >
                    <Plus size={16} />
                  </button>
                </li>
              );
            })}
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
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-plum text-mist disabled:opacity-30"
                >
                  <Plus size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
