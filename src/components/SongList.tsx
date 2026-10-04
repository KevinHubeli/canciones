"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { SongSummary } from "@/lib/types";
import Spinner from "@/components/Spinner";
import { SONG_TAGS, NO_CHORDS_FILTER } from "@/lib/tags";
import { RECENT_KEY, parseRecentSongs } from "@/lib/recentSongs";
import { useStoredString } from "@/lib/useStoredString";

const PAGE_SIZE = 24;
const ALL_FILTERS: string[] = [...SONG_TAGS, NO_CHORDS_FILTER];

export default function SongList() {
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recentRaw = useStoredString(RECENT_KEY);
  const recent = useMemo(() => parseRecentSongs(recentRaw), [recentRaw]);
  const loadingRef = useRef(false);
  // Número de la última búsqueda: una respuesta vieja (de lo que se tipeó antes) se descarta.
  const searchIdRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (q: string, tags: string[], offset: number) => {
    // "Cargar más" no se pisa a sí mismo, pero una búsqueda nueva siempre arranca.
    if (offset > 0 && loadingRef.current) return;
    const searchId = offset === 0 ? ++searchIdRef.current : searchIdRef.current;
    loadingRef.current = true;
    if (offset === 0) setInitialLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (q) params.set("q", q);
      tags.forEach((tag) => params.append("tag", tag));
      const res = await fetch(`/api/songs?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (searchId !== searchIdRef.current) return;
      setSongs((prev) => (offset === 0 ? data.songs : [...prev, ...data.songs]));
      setHasMore(Boolean(data.hasMore));
    } catch {
      if (searchId !== searchIdRef.current) return;
      setError("No pudimos cargar las canciones. Probá de nuevo en un rato.");
    } finally {
      if (searchId === searchIdRef.current) {
        loadingRef.current = false;
        setInitialLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  // Debounce de la búsqueda: espera a que el usuario deje de tipear.
  useEffect(() => {
    const id = setTimeout(() => load(query.trim(), activeTags, 0), 300);
    return () => clearTimeout(id);
  }, [query, activeTags, load]);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && !initialLoading) {
          load(query.trim(), activeTags, songs.length);
        }
      },
      { rootMargin: "600px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, initialLoading, songs.length]);

  function toggleTag(tag: string) {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  return (
    <div className="flex flex-1 flex-col px-5">
      <div className="relative mb-4">
        <Search
          size={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lilac-light"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por título o artista..."
          className="w-full rounded-full border border-plum bg-night/50 py-3 pl-11 pr-4 text-sm text-mist placeholder:text-lilac-light/70 focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {ALL_FILTERS.map((tag) => {
          const active = activeTags.includes(tag);
          return (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-accent bg-accent text-night"
                  : "border-plum bg-night/50 text-lilac-light"
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>

      {!query.trim() && activeTags.length === 0 && recent.length > 0 && (
        <div className="mb-5">
          <span className="mb-2 block text-xs uppercase tracking-wide text-lilac-light">
            Recientes
          </span>
          <ul className="flex flex-col gap-2">
            {recent.map((song) => (
              <li key={song.id}>
                <Link
                  href={`/canciones/${song.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-plum/60 bg-night/40 px-4 py-3 transition-colors active:bg-night/70"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-mist">{song.title}</span>
                    <span className="block truncate text-sm text-lilac-light">{song.artist}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && songs.length === 0 && (
        <p className="py-6 text-center text-sm text-lilac-light">{error}</p>
      )}

      {initialLoading ? (
        <Spinner label="Buscando canciones..." />
      ) : songs.length === 0 ? (
        <p className="py-10 text-center text-sm text-lilac-light">
          No encontramos canciones{query ? ` para "${query}"` : ""}.
        </p>
      ) : (
        <>
          {!query.trim() && activeTags.length === 0 && recent.length > 0 && (
            <span className="mb-2 block text-xs uppercase tracking-wide text-lilac-light">
              Todas las canciones
            </span>
          )}
          <ul className="flex flex-col gap-2 pb-6">
          {songs.map((song) => (
            <li key={song.id}>
              <Link
                href={`/canciones/${song.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-plum/60 bg-night/40 px-4 py-3 transition-colors active:bg-night/70"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-mist">{song.title}</span>
                  <span className="block truncate text-sm text-lilac-light">{song.artist}</span>
                  {song.tags.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {song.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-plum px-2 py-0.5 text-[10px] text-lilac-light"
                        >
                          {tag}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-sm text-chord-gold">{song.originalKey}</span>
              </Link>
            </li>
          ))}
          </ul>
        </>
      )}

      {hasMore && !initialLoading && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-plum border-t-chord-gold" />
        </div>
      )}
    </div>
  );
}
