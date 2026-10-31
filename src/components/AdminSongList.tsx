"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChartColumn,
  Copy,
  DatabaseBackup,
  FileClock,
  History,
  ListMusic,
  Users,
  Music,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type { SongSummary } from "@/lib/types";
import { NO_CHORDS_FILTER } from "@/lib/tags";
import Spinner from "@/components/Spinner";
import ConfirmDialog from "@/components/ConfirmDialog";

const UNDO_MS = 5000;
const PAGE_SIZE = 30;
// Tope al traer todo para ordenar por fecha (la API da hasta 500 por pedido).
const ALL_CAP = 2000;

type Sort = "az" | "recent";

export default function AdminSongList({ isOwner = false }: { isOwner?: boolean }) {
  const router = useRouter();
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [query, setQuery] = useState("");
  const [noChordsOnly, setNoChordsOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("az");
  const [hasMore, setHasMore] = useState(false);
  // En el orden por fecha se trae todo junto y se muestra de a PAGE_SIZE.
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SongSummary | null>(null);
  const [pendingUndo, setPendingUndo] = useState<SongSummary | null>(null);
  // El borrado real se manda a los UNDO_MS; mientras tanto se puede deshacer.
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<SongSummary | null>(null);
  const latestLoad = useRef(0);

  // Manda ya el borrado pendiente (si lo hay). Se usa al borrar otra canción
  // mientras queda una pendiente y al salir de la pantalla: sin esto, esa
  // canción figuraba como eliminada pero seguía en la base. (El servidor la
  // manda a la papelera, no la borra para siempre.)
  function flushPending(): Promise<unknown> {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    const song = pendingRef.current;
    pendingRef.current = null;
    if (!song) return Promise.resolve();
    return fetch(`/api/songs/${song.id}`, { method: "DELETE", keepalive: true }).catch(() => {});
  }

  // Espera a que la canción esté en la papelera antes de mostrarla ahí.
  async function goToTrash() {
    await flushPending();
    setPendingUndo(null);
    router.push("/admin/papelera");
  }

  async function fetchPage(q: string, noChords: boolean, limit: number, offset: number) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (q) params.set("q", q);
    if (noChords) params.set("tag", NO_CHORDS_FILTER);
    const res = await fetch(`/api/songs?${params}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return { songs: (data.songs ?? []) as SongSummary[], hasMore: Boolean(data.hasMore) };
  }

  async function load(q: string, noChords: boolean, order: Sort) {
    const loadId = ++latestLoad.current;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    try {
      if (order === "recent") {
        const all: SongSummary[] = [];
        let more = true;
        while (more && all.length < ALL_CAP) {
          const page = await fetchPage(q, noChords, 500, all.length);
          if (loadId !== latestLoad.current) return;
          all.push(...page.songs);
          more = page.hasMore && page.songs.length > 0;
        }
        all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setSongs(all);
        setHasMore(false);
        setVisible(PAGE_SIZE);
      } else {
        const page = await fetchPage(q, noChords, PAGE_SIZE, 0);
        if (loadId !== latestLoad.current) return;
        setSongs(page.songs);
        setHasMore(page.hasMore);
      }
    } catch {
      if (loadId === latestLoad.current) setError("No pudimos cargar las canciones.");
    } finally {
      if (loadId === latestLoad.current) setLoading(false);
    }
  }

  async function loadMore() {
    if (sort === "recent") {
      setVisible((v) => v + PAGE_SIZE);
      return;
    }
    if (loading || loadingMore || !hasMore) return;
    const loadId = latestLoad.current;
    setLoadingMore(true);
    try {
      const page = await fetchPage(query.trim(), noChordsOnly, PAGE_SIZE, songs.length);
      if (loadId !== latestLoad.current) return;
      setSongs((prev) => {
        const seen = new Set(prev.map((s) => s.id));
        return [...prev, ...page.songs.filter((s) => !seen.has(s.id))];
      });
      setHasMore(page.hasMore);
    } catch {
      if (loadId === latestLoad.current) setError("No pudimos cargar más canciones.");
    } finally {
      if (loadId === latestLoad.current) setLoadingMore(false);
    }
  }

  useEffect(() => {
    // Lo que venga en camino de una búsqueda anterior ya no vale.
    latestLoad.current++;
    const id = setTimeout(() => load(query.trim(), noChordsOnly, sort), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, noChordsOnly, sort]);

  useEffect(() => {
    return () => {
      flushPending();
    };
  }, []);

  function handleDelete() {
    if (!pendingDelete) return;
    const song = pendingDelete;
    flushPending();
    setSongs((prev) => prev.filter((s) => s.id !== song.id));
    setPendingDelete(null);
    setPendingUndo(song);
    pendingRef.current = song;

    undoTimer.current = setTimeout(() => {
      flushPending();
      setPendingUndo((prev) => (prev?.id === song.id ? null : prev));
    }, UNDO_MS);
  }

  function handleUndo() {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    pendingRef.current = null;
    setPendingUndo(null);
    load(query.trim(), noChordsOnly, sort);
  }

  const shown = sort === "recent" ? songs.slice(0, visible) : songs;
  const canLoadMore = sort === "recent" ? visible < songs.length : hasMore;
  const pill = "flex items-center gap-1.5 rounded-full bg-plum px-3.5 py-2 text-sm text-mist";

  return (
    <div className="flex flex-1 flex-col px-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lilac-light" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar..."
            className="w-full rounded-full border border-plum bg-night/50 py-2.5 pl-10 pr-4 text-sm text-mist placeholder:text-lilac-light/70"
          />
        </div>
        <Link
          href="/admin/nueva"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-night"
          aria-label="Nueva canción"
        >
          <Plus size={20} />
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/powers" className={pill}>
          <ListMusic size={16} />
          Powers
        </Link>
        {isOwner && (
          <Link href="/admin/usuarios" className={pill}>
            <Users size={16} />
            Usuarios
          </Link>
        )}
        <Link href="/admin/historial" className={pill}>
          <History size={16} />
          Historial
        </Link>
        <Link href="/admin/duplicados" className={pill}>
          <Copy size={16} />
          Duplicadas
        </Link>
        <Link href="/admin/auto-acordes" className={pill}>
          <Music size={16} />
          Buscar acordes
        </Link>
        <Link href="/admin/papelera" className={pill}>
          <Trash2 size={16} />
          Papelera
        </Link>
        <Link href="/admin/estadisticas" className={pill}>
          <ChartColumn size={16} />
          Estadísticas
        </Link>
        {isOwner && (
          <Link href="/admin/respaldo" className={pill}>
            <DatabaseBackup size={16} />
            Respaldo
          </Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setNoChordsOnly((v) => !v)}
          aria-pressed={noChordsOnly}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            noChordsOnly
              ? "border-accent bg-accent text-night"
              : "border-plum bg-night/50 text-lilac-light"
          }`}
        >
          {NO_CHORDS_FILTER}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-lilac-light">
          Orden
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-full border border-plum bg-night/50 px-3 py-1.5 text-xs text-mist"
          >
            <option value="az">A–Z</option>
            <option value="recent">Modificadas hace poco</option>
          </select>
        </label>
        {!loading && !error && songs.length > 0 && (
          <span className="ml-auto text-xs text-lilac-light">
            {sort === "recent" || !hasMore
              ? `${songs.length} ${songs.length === 1 ? "canción" : "canciones"}`
              : `${songs.length}+ canciones`}
          </span>
        )}
      </div>

      {error && <p className="py-6 text-center text-sm text-lilac-light">{error}</p>}
      {loading && <Spinner label="Cargando canciones..." />}

      {!loading && songs.length === 0 && !error && (
        <p className="py-10 text-center text-sm text-lilac-light">
          {query.trim() || noChordsOnly
            ? "No hay canciones que coincidan."
            : "Todavía no cargaste ninguna canción."}
        </p>
      )}

      {!loading && shown.length > 0 && (
        <ul className="flex flex-col gap-2 pb-10">
          {shown.map((song) => (
            <li
              key={song.id}
              className="flex items-center justify-between gap-2 rounded-2xl border border-plum/60 bg-night/40 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-mist">{song.title}</p>
                <p className="truncate text-sm text-lilac-light">{song.artist}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`/admin/${song.id}/historial`}
                  aria-label="Historial de versiones"
                  title="Historial de versiones"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-plum text-mist"
                >
                  <FileClock size={16} />
                </Link>
                <Link
                  href={`/admin/${song.id}/editar`}
                  aria-label="Editar"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-plum text-mist"
                >
                  <Pencil size={16} />
                </Link>
                <button
                  onClick={() => setPendingDelete(song)}
                  aria-label="Eliminar"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-plum text-mist"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
          {canLoadMore && (
            <li>
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full rounded-full bg-plum py-2.5 text-sm font-medium text-mist disabled:opacity-60"
              >
                {loadingMore ? "Cargando..." : "Cargar más"}
              </button>
            </li>
          )}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`¿Mandar "${pendingDelete?.title}" a la papelera?`}
        message="Vas a poder deshacerlo unos segundos después, o restaurarla después desde la papelera."
        confirmLabel="Mandar a la papelera"
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {pendingUndo && (
        <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full bg-plum-deep px-4 py-2.5 shadow-2xl">
            <span className="text-sm text-mist">&quot;{pendingUndo.title}&quot; a la papelera</span>
            <button onClick={handleUndo} className="text-sm font-semibold text-chord-gold">
              Deshacer
            </button>
            <button onClick={goToTrash} className="text-sm text-lilac-light underline">
              Ver papelera
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
