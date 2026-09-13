"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { SongSummary } from "@/lib/types";
import Spinner from "@/components/Spinner";

const PAGE_SIZE = 24;

export default function SongList() {
  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (q: string, offset: number) => {
    if (loadingRef.current) return;
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
      const res = await fetch(`/api/songs?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSongs((prev) => (offset === 0 ? data.songs : [...prev, ...data.songs]));
      setHasMore(Boolean(data.hasMore));
    } catch {
      setError("No pudimos cargar las canciones. Probá de nuevo en un rato.");
    } finally {
      loadingRef.current = false;
      setInitialLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Debounce de la búsqueda: espera a que el usuario deje de tipear.
  useEffect(() => {
    const id = setTimeout(() => load(query.trim(), 0), 300);
    return () => clearTimeout(id);
  }, [query, load]);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && !initialLoading) {
          load(query.trim(), songs.length);
        }
      },
      { rootMargin: "600px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, initialLoading, songs.length]);

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
        <ul className="flex flex-col gap-2 pb-6">
          {songs.map((song) => (
            <li key={song.id}>
              <Link
                href={`/canciones/${song.id}`}
                className="flex items-center justify-between rounded-2xl border border-plum/60 bg-night/40 px-4 py-3 transition-colors active:bg-night/70"
              >
                <span>
                  <span className="block font-medium text-mist">{song.title}</span>
                  <span className="block text-sm text-lilac-light">{song.artist}</span>
                </span>
                <span className="font-mono text-sm text-chord-gold">{song.originalKey}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {hasMore && !initialLoading && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-plum border-t-chord-gold" />
        </div>
      )}
    </div>
  );
}
