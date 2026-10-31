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
// Reintentos automáticos tras un fallo (1s, 2s, 4s); después queda el botón "Reintentar".
const MAX_AUTO_RETRIES = 3;
const RETRY_BASE_MS = 1000;

// "more": falló al cargar más (ya hay canciones en pantalla) y no la búsqueda entera.
type LoadError = { message: string; more: boolean };
const ALL_FILTERS: string[] = [...SONG_TAGS, NO_CHORDS_FILTER];

export default function SongList() {
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<LoadError | null>(null);
  // Fallos seguidos: mide el backoff y corta los reintentos automáticos.
  const [failures, setFailures] = useState(0);
  const recentRaw = useStoredString(RECENT_KEY);
  const recent = useMemo(() => parseRecentSongs(recentRaw), [recentRaw]);
  const loadingRef = useRef(false);
  // Número de la última búsqueda: una respuesta vieja (de lo que se tipeó antes) se descarta.
  const searchIdRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Lo último que se buscó, para que el reintento no use valores viejos.
  const latestRef = useRef({ query: "", tags: [] as string[], count: 0 });

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
      setFailures(0);
      setSongs((prev) => (offset === 0 ? data.songs : [...prev, ...data.songs]));
      setHasMore(Boolean(data.hasMore));
    } catch {
      if (searchId !== searchIdRef.current) return;
      setFailures((n) => n + 1);
      if (offset === 0) {
        // Sin esto quedaría en pantalla el resultado de la búsqueda anterior, que no corresponde.
        setSongs([]);
        setHasMore(false);
      }
      setError({
        message:
          typeof navigator !== "undefined" && navigator.onLine === false
            ? "Sin conexión. Cuando vuelva internet probamos de nuevo."
            : "No pudimos cargar las canciones.",
        more: offset > 0,
      });
    } finally {
      if (searchId === searchIdRef.current) {
        loadingRef.current = false;
        setInitialLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    latestRef.current = { query: query.trim(), tags: activeTags, count: songs.length };
  });

  // Debounce de la búsqueda: espera a que el usuario deje de tipear.
  useEffect(() => {
    const id = setTimeout(() => {
      setFailures(0);
      load(query.trim(), activeTags, 0);
    }, 300);
    return () => clearTimeout(id);
  }, [query, activeTags, load]);

  // Reintenta lo que falló: la búsqueda entera, o la página siguiente si ya había canciones.
  const retry = useCallback(() => {
    const { query: q, tags, count } = latestRef.current;
    load(q, tags, error?.more ? count : 0);
  }, [load, error?.more]);

  useEffect(() => {
    // Con un error pendiente NO se observa: al fallar, el observador se recrearía,
    // volvería a disparar la carga y se armaría un bucle de pedidos fallidos.
    if (!sentinelRef.current || !hasMore || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && !initialLoading) {
          const { query: q, tags, count } = latestRef.current;
          load(q, tags, count);
        }
      },
      { rootMargin: "600px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, initialLoading, songs.length, error, load]);

  // Backoff: unos pocos reintentos automáticos y después espera al botón.
  useEffect(() => {
    if (!error || failures === 0 || failures > MAX_AUTO_RETRIES) return;
    const id = setTimeout(retry, RETRY_BASE_MS * 2 ** (failures - 1));
    return () => clearTimeout(id);
  }, [error, failures, retry]);

  // Si vuelve internet, se reintenta enseguida.
  useEffect(() => {
    if (!error) return;
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [error, retry]);

  function toggleTag(tag: string) {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  return (
    <div className="flex flex-1 flex-col px-5">
      <div className="relative mb-4">
        <Search
          size={18}
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lilac-light"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          aria-label="Buscar canciones por título o artista"
          placeholder="Buscar por título o artista..."
          className="w-full rounded-full border border-plum bg-night/50 py-3 pl-11 pr-4 text-sm text-mist placeholder:text-lilac-light focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <div role="group" aria-label="Filtrar por tipo" className="mb-4 flex flex-wrap gap-2">
        {ALL_FILTERS.map((tag) => {
          const active = activeTags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
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

      {error && !error.more && (
        <ErrorBox message={error.message} onRetry={retry} stopped={failures > MAX_AUTO_RETRIES} />
      )}

      {initialLoading ? (
        <Spinner label="Buscando canciones..." />
      ) : songs.length === 0 ? (
        error ? null : (
          <p className="py-10 text-center text-sm text-lilac-light">
            No encontramos canciones{query ? ` para "${query}"` : ""}.
          </p>
        )
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

      {error?.more && (
        <ErrorBox message={error.message} onRetry={retry} stopped={failures > MAX_AUTO_RETRIES} />
      )}

      {hasMore && !initialLoading && !error && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          <span
            aria-hidden
            className="h-3 w-3 animate-spin rounded-full border-2 border-plum border-t-chord-gold"
          />
        </div>
      )}
    </div>
  );
}

function ErrorBox({
  message,
  onRetry,
  stopped,
}: {
  message: string;
  onRetry: () => void;
  /** Ya no se reintenta solo: hay que tocar el botón. */
  stopped: boolean;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center">
      <p className="text-sm text-lilac-light">
        {message}
        {!stopped && " Reintentando..."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-night"
      >
        Reintentar
      </button>
    </div>
  );
}
