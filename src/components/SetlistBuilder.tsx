"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  LayoutTemplate,
  Minus,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { SongSummary } from "@/lib/types";
import type { LastTone, RecentlyUsedSong, Setlist, SetlistSong } from "@/lib/setlists";
import { SONG_TAGS } from "@/lib/tags";
import { displayChord } from "@/lib/chords";
import {
  DIVIDER_NAMES,
  mergeEntries,
  splitEntries,
  type DividerName,
  type SetlistEntry,
} from "@/lib/dividers";
import {
  POWER_TEMPLATES,
  applyTemplate,
  daysAgoText,
  getTemplate,
  insertInSection,
} from "@/lib/powerTemplates";
import Spinner from "@/components/Spinner";
import ConfirmDialog from "@/components/ConfirmDialog";

const PAGE_SIZE = 30;

/** Cada fila lleva un id estable propio: así reordenar no mezcla el estado de las filas. */
type Item = SetlistEntry<SetlistSong> & { key: string };

type PendingAction =
  | { kind: "clear" }
  | { kind: "dividers" }
  | { kind: "template"; id: string };

function initialItems(initial?: Setlist): Item[] {
  let dividerCount = 0;
  return mergeEntries(initial?.songs ?? [], initial?.dividers ?? []).map((e) =>
    e.kind === "song"
      ? { ...e, key: `s-${e.song.id}` }
      : { ...e, key: `d-init-${dividerCount++}` }
  );
}

/** Foto del estado editable, para saber si hay cambios sin guardar. */
function snapshot(title: string, date: string, notes: string, items: Item[]): string {
  return JSON.stringify([
    title.trim(),
    date,
    notes.trim(),
    items.map((e) => (e.kind === "song" ? [e.song.id, e.song.semitones] : e.name)),
  ]);
}

function midY(el: HTMLElement | undefined): number | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.top + r.height / 2;
}

export default function SetlistBuilder({ initial }: { initial?: Setlist }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [serviceDate, setServiceDate] = useState(initial?.serviceDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  // Lista única y ordenada: canciones y divisores (ALABANZA, OFRENDA...) mezclados.
  const [items, setItems] = useState<Item[]>(() => initialItems(initial));
  const [baseline] = useState(() =>
    snapshot(initial?.title ?? "", initial?.serviceDate ?? "", initial?.notes ?? "", initialItems(initial))
  );
  const selected = items.flatMap((e) => (e.kind === "song" ? [e.song] : []));
  const selectedIds = new Set(selected.map((s) => s.id));

  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [results, setResults] = useState<SongSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentlyUsed, setRecentlyUsed] = useState<RecentlyUsedSong[]>([]);
  // Tono con el que se usó cada canción la última vez (para arrancar con ese).
  const [lastTones, setLastTones] = useState<Record<string, LastTone>>({});
  // "Ahora" fijo para los "hace X días" (no se recalcula en cada render).
  const [now] = useState(() => Date.now());

  // Sección donde se agregan las canciones nuevas (clave del divisor); null = al final.
  const [addToKey, setAddToKey] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [announce, setAnnounce] = useState("");

  // Cambios sin guardar.
  const [leaving, setLeaving] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const dirty = !leaving && snapshot(title, serviceDate, notes, items) !== baseline;

  const nextKey = useRef(0);
  const reqId = useRef(0);
  const nextOffset = useRef(0);
  const itemsRef = useRef(items);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const handleRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);
  const drag = useRef<{ key: string; y: number; raf: number } | null>(null);
  const stopDragRef = useRef<(() => void) | null>(null);
  const sentinelRef = useRef<HTMLButtonElement>(null);
  const loadMoreRef = useRef<() => void>(() => {});
  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  useEffect(() => {
    itemsRef.current = items;
    // Mover una fila en el DOM le saca el foco: se lo devolvemos a su agarradera.
    if (pendingFocus.current) {
      handleRefs.current.get(pendingFocus.current)?.focus();
      pendingFocus.current = null;
    }
  }, [items]);

  useEffect(() => {
    fetch("/api/setlists/recent-songs")
      .then((res) => res.json())
      .then((data) => setRecentlyUsed(data.songs ?? []))
      .catch(() => {});
    const exclude = initial ? `?exclude=${initial.id}` : "";
    fetch(`/api/setlists/last-tones${exclude}`)
      .then((res) => res.json())
      .then((data) => setLastTones(data.tones ?? {}))
      .catch(() => {});
  }, [initial]);

  // ---- Buscador: páginas de 30, con debounce, descartando respuestas viejas ----
  async function fetchSongs(q: string, tag: string | null, offset: number) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (q) params.set("q", q);
    if (tag) params.set("tag", tag);
    const res = await fetch(`/api/songs?${params}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return { songs: (data.songs ?? []) as SongSummary[], hasMore: Boolean(data.hasMore) };
  }

  useEffect(() => {
    // Cualquier respuesta que venga en camino ya no corresponde a lo que se está tipeando.
    const id = ++reqId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setLoadingMore(false);
      setSearchError(false);
      try {
        const data = await fetchSongs(query.trim(), activeTag, 0);
        if (id !== reqId.current) return;
        nextOffset.current = data.songs.length;
        setResults(data.songs);
        setHasMore(data.hasMore);
      } catch {
        if (id !== reqId.current) return;
        setResults([]);
        setHasMore(false);
        setSearchError(true);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, activeTag]);

  async function loadMore() {
    if (loading || loadingMore || !hasMore) return;
    const id = reqId.current;
    setLoadingMore(true);
    try {
      const data = await fetchSongs(query.trim(), activeTag, nextOffset.current);
      if (id !== reqId.current) return;
      nextOffset.current += data.songs.length;
      setResults((prev) => {
        const seen = new Set(prev.map((s) => s.id));
        return [...prev, ...data.songs.filter((s) => !seen.has(s.id))];
      });
      setHasMore(data.hasMore);
    } catch {
      if (id === reqId.current) setSearchError(true);
    } finally {
      if (id === reqId.current) setLoadingMore(false);
    }
  }

  useEffect(() => {
    loadMoreRef.current = loadMore;
  });

  // Al acercarse al final de la lista se pide la página siguiente (el botón queda de respaldo).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMoreRef.current();
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, results.length]);

  // ---- Aviso de cambios sin guardar ----
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    // Los links internos (barra de abajo, etc.) no disparan beforeunload: se frenan acá.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  // Si se sale de la pantalla en medio de un arrastre, se corta.
  useEffect(() => () => stopDragRef.current?.(), []);

  // ---- Edición de la lista ----
  function newDividerKey() {
    return `d-new-${nextKey.current++}`;
  }

  function addSong(song: SongSummary) {
    if (selectedIds.has(song.id)) return;
    const item: Item = {
      kind: "song",
      key: `s-${song.id}`,
      song: { ...song, semitones: lastTones[song.id]?.semitones ?? 0 },
    };
    setItems((prev) => insertInSection(prev, addToKey ? prev.findIndex((e) => e.key === addToKey) : null, item));
  }

  function addDivider(name: DividerName) {
    setItems((prev) => [...prev, { kind: "divider", name, key: newDividerKey() }]);
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((e) => e.key !== key));
  }

  function moveBy(key: string, dir: -1 | 1) {
    setItems((prev) => {
      const index = prev.findIndex((e) => e.key === key);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  /** Cambia de lugar con el vecino solo si sigue pegado en esa dirección (no se repite si se llama dos veces). */
  function swapWithNeighbour(key: string, neighbourKey: string, dir: -1 | 1) {
    setItems((prev) => {
      const a = prev.findIndex((e) => e.key === key);
      const b = prev.findIndex((e) => e.key === neighbourKey);
      if (a < 0 || b !== a + dir) return prev;
      const next = [...prev];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  }

  function labelOf(item: Item) {
    return item.kind === "divider" ? item.name : item.song.title;
  }

  function moveWithKeyboard(item: Item, dir: -1 | 1) {
    const index = itemsRef.current.findIndex((e) => e.key === item.key);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= itemsRef.current.length) return;
    pendingFocus.current = item.key;
    moveBy(item.key, dir);
    setAnnounce(`${labelOf(item)}: lugar ${target + 1} de ${itemsRef.current.length}`);
  }

  function changeSemitones(id: string, delta: number) {
    setItems((prev) =>
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

  // ---- Arrastrar para reordenar (mouse o dedo) ----
  function startDrag(e: React.PointerEvent, key: string) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    stopDragRef.current?.();

    const state = { key, y: e.clientY, raf: 0 };
    drag.current = state;
    setDraggingKey(key);

    const onMove = (ev: PointerEvent) => {
      state.y = ev.clientY;
    };
    const tick = () => {
      // Cerca del borde de la pantalla, la página se desplaza sola.
      const zone = 90;
      const vh = window.innerHeight;
      if (state.y < zone) window.scrollBy(0, -Math.ceil(((zone - state.y) / zone) * 18));
      else if (state.y > vh - zone) window.scrollBy(0, Math.ceil(((state.y - (vh - zone)) / zone) * 18));

      // La fila agarrada se cambia con el vecino cuando el puntero pasa la mitad de ese vecino.
      const list = itemsRef.current;
      const i = list.findIndex((it) => it.key === key);
      if (i > 0) {
        const mid = midY(itemRefs.current.get(list[i - 1].key));
        if (mid !== null && state.y < mid) swapWithNeighbour(key, list[i - 1].key, -1);
      }
      if (i >= 0 && i < list.length - 1) {
        const mid = midY(itemRefs.current.get(list[i + 1].key));
        if (mid !== null && state.y > mid) swapWithNeighbour(key, list[i + 1].key, 1);
      }
      state.raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(state.raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      if (drag.current === state) drag.current = null;
      if (stopDragRef.current === stop) stopDragRef.current = null;
      setDraggingKey(null);
    };
    stopDragRef.current = stop;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    state.raf = requestAnimationFrame(tick);
  }

  // ---- Plantillas y vaciado ----
  function runTemplate(id: string) {
    const template = getTemplate(id);
    if (!template) return;
    const applied = applyTemplate(items, template);
    let firstDivider: string | null = null;
    const next: Item[] = applied.map((e) => {
      if (e.kind === "song") return { ...e, key: `s-${e.song.id}` };
      const key = newDividerKey();
      firstDivider ??= key;
      return { ...e, key };
    });
    setItems(next);
    setAddToKey(firstDivider);
    setShowTemplates(false);
  }

  function requestTemplate(id: string) {
    if (items.some((e) => e.kind === "divider")) setPendingAction({ kind: "template", id });
    else runTemplate(id);
  }

  function confirmPending() {
    const action = pendingAction;
    setPendingAction(null);
    if (!action) return;
    if (action.kind === "clear") {
      setItems([]);
      setAddToKey(null);
    } else if (action.kind === "dividers") {
      setItems((prev) => prev.filter((e) => e.kind === "song"));
      setAddToKey(null);
    } else {
      runTemplate(action.id);
    }
  }

  async function handleSave() {
    if (!title.trim() || selected.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const transpose: Record<string, number> = {};
      for (const s of selected) transpose[s.id] = s.semitones;
      const { songs, dividers } = splitEntries(items);

      const res = await fetch(initial ? `/api/setlists/${initial.id}` : "/api/setlists", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          songIds: songs.map((s) => s.id),
          transpose,
          dividers,
          serviceDate: serviceDate || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar el power.");
        return;
      }
      setLeaving(true);
      router.push("/admin/powers");
      router.refresh();
    } catch {
      setError("No se pudo guardar el power.");
    } finally {
      setSaving(false);
    }
  }

  const usedInfo = new Map(recentlyUsed.map((s) => [s.id, s]));
  const hasDividers = items.some((e) => e.kind === "divider");
  const sections = items.flatMap((e) => (e.kind === "divider" ? [{ key: e.key, name: e.name }] : []));
  const activeSection = sections.some((s) => s.key === addToKey) ? addToKey : null;

  // Número de cada canción (los divisores no cuentan).
  let songCounter = 0;
  const songNumbers = items.map((e) => (e.kind === "song" ? ++songCounter : 0));

  const pendingText: Record<PendingAction["kind"], { title: string; message: string; confirm: string }> = {
    clear: {
      title: "¿Vaciar el power?",
      message: `Se sacan las ${selected.length} canciones y los divisores. Lo que ya está guardado no cambia hasta que toques Guardar.`,
      confirm: "Vaciar",
    },
    dividers: {
      title: "¿Quitar todos los divisores?",
      message: "Las canciones se quedan como están, solo se sacan ALABANZA, OFRENDA, etc.",
      confirm: "Quitar divisores",
    },
    template: {
      title: "¿Reemplazar los divisores?",
      message: "La estructura nueva reemplaza a los divisores que ya pusiste. Las canciones no se tocan.",
      confirm: "Reemplazar",
    },
  };

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pb-10">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Nombre del power (ej: Domingo 14/09 - Mañana)"
        className="rounded-2xl border border-plum bg-night/50 px-4 py-3 text-mist placeholder:text-lilac-light/70 focus:outline-none focus:ring-2 focus:ring-accent"
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex flex-col gap-1 sm:w-48">
          <span className="text-xs uppercase tracking-wide text-lilac-light">Fecha (opcional)</span>
          <input
            type="date"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
            className="rounded-2xl border border-plum bg-night/50 px-4 py-2.5 text-sm text-mist focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-lilac-light">Notas (opcional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Para el equipo (ej: entra el coro en la última)"
            className="resize-y rounded-2xl border border-plum bg-night/50 px-4 py-2.5 text-sm text-mist placeholder:text-lilac-light/70 focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
      </div>

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
      {dirty && !saving && (
        <p className="-mt-2 text-center text-xs text-lilac-light">Tenés cambios sin guardar.</p>
      )}

      {items.length > 0 && (
        <div className="rounded-2xl border border-plum/60 bg-night/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wide text-lilac-light">
              Orden del power ({selected.length})
            </span>
            <div className="flex items-center gap-3 text-xs text-lilac-light">
              {hasDividers && (
                <button onClick={() => setPendingAction({ kind: "dividers" })} className="underline">
                  Quitar divisores
                </button>
              )}
              <button
                onClick={() => setPendingAction({ kind: "clear" })}
                className="flex items-center gap-1 underline"
              >
                <Trash2 size={12} />
                Vaciar
              </button>
            </div>
          </div>
          <p className="mb-2 text-[11px] text-lilac-light/80">
            Agarrá el ícono de la izquierda y arrastrá para ordenar. Con el teclado: enfocalo y usá las
            flechas ↑ ↓.
          </p>
          <p className="sr-only" aria-live="polite">
            {announce}
          </p>
          <ul className="flex flex-col gap-1.5">
            {items.map((entry, i) => {
              const isDragging = draggingKey === entry.key;
              const handle = (
                <button
                  type="button"
                  ref={(el) => {
                    if (el) handleRefs.current.set(entry.key, el);
                    else handleRefs.current.delete(entry.key);
                  }}
                  onPointerDown={(e) => startDrag(e, entry.key)}
                  onContextMenu={(e) => e.preventDefault()}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      moveWithKeyboard(entry, e.key === "ArrowUp" ? -1 : 1);
                    }
                  }}
                  aria-label={`Reordenar ${labelOf(entry)}. Arrastrá o usá las flechas arriba y abajo`}
                  className="flex h-9 w-7 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-lg text-lilac-light active:cursor-grabbing"
                >
                  <GripVertical size={18} />
                </button>
              );
              const moveButtons = (
                <>
                  <button
                    onClick={() => moveBy(entry.key, -1)}
                    disabled={i === 0}
                    aria-label="Subir"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-plum text-lilac-light disabled:opacity-30"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => moveBy(entry.key, 1)}
                    disabled={i === items.length - 1}
                    aria-label="Bajar"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-plum text-lilac-light disabled:opacity-30"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    onClick={() => removeItem(entry.key)}
                    aria-label="Quitar"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-plum text-lilac-light"
                  >
                    <X size={14} />
                  </button>
                </>
              );
              const setRef = (el: HTMLLIElement | null) => {
                if (el) itemRefs.current.set(entry.key, el);
                else itemRefs.current.delete(entry.key);
              };

              if (entry.kind === "divider") {
                return (
                  <li
                    key={entry.key}
                    ref={setRef}
                    className={`flex items-center gap-1.5 rounded-xl border bg-accent/10 px-2 py-1.5 ${
                      isDragging ? "border-accent ring-2 ring-accent" : "border-accent/60"
                    }`}
                  >
                    {handle}
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[0.2em] text-accent">
                      {entry.name}
                    </span>
                    {moveButtons}
                  </li>
                );
              }

              const song = entry.song;
              const prev = items[i - 1];
              const sameToneAsPrev =
                prev?.kind === "song" &&
                displayChord(song.originalKey, song.semitones, "en", song.originalKey) ===
                  displayChord(prev.song.originalKey, prev.song.semitones, "en", prev.song.originalKey);
              return (
                <li
                  key={entry.key}
                  ref={setRef}
                  className={`flex flex-col gap-1.5 rounded-xl bg-night/60 px-2 py-1.5 ${
                    isDragging ? "ring-2 ring-accent" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {handle}
                    <span className="w-5 shrink-0 text-center text-xs text-lilac-light">
                      {songNumbers[i]}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-mist">{song.title}</span>
                    {moveButtons}
                  </div>
                  <div className="ml-9 flex flex-wrap items-center gap-2 text-xs text-lilac-light">
                    <span>Tono:</span>
                    <button
                      onClick={() => changeSemitones(song.id, -1)}
                      aria-label="Bajar semitono"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-plum"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="w-14 text-center font-mono text-chord-gold">
                      {displayChord(song.originalKey, song.semitones, "en", song.originalKey)}
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
                    {sameToneAsPrev && (
                      <span className="text-lilac-light/70">· mismo tono que la anterior</span>
                    )}
                  </div>
                  {lastTones[song.id] && (
                    <p className="ml-9 text-[11px] text-lilac-light/80">
                      Última vez:{" "}
                      {displayChord(song.originalKey, lastTones[song.id].semitones, "en", song.originalKey)} en{" "}
                      &quot;{lastTones[song.id].setlistTitle}&quot;
                      {lastTones[song.id].semitones !== song.semitones && (
                        <button
                          onClick={() =>
                            changeSemitones(song.id, lastTones[song.id].semitones - song.semitones)
                          }
                          className="ml-2 underline"
                        >
                          usar ese
                        </button>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <span className="mb-2 block text-xs uppercase tracking-wide text-lilac-light">
          Divisores (se suman al final; después los arrastrás)
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowTemplates((v) => !v)}
            aria-expanded={showTemplates}
            className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-night"
          >
            <LayoutTemplate size={14} />
            Estructura típica
          </button>
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
        {showTemplates && (
          <ul className="mt-2 flex flex-col gap-1.5">
            {POWER_TEMPLATES.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => requestTemplate(t.id)}
                  className="w-full rounded-xl border border-plum/60 bg-night/40 px-3 py-2 text-left"
                >
                  <span className="block text-sm font-medium text-mist">{t.label}</span>
                  <span className="block text-xs text-lilac-light">
                    {t.sections.map((s) => s.name).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
            <li className="px-1 text-[11px] text-lilac-light/80">
              Reparte las canciones que ya cargaste entre las secciones; si todavía no cargaste ninguna,
              las que agregues van a la sección elegida.
            </li>
          </ul>
        )}
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
                      {daysAgoText(song.lastUsedAt, now)} en &quot;{song.lastUsedIn}&quot;
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

      {sections.length > 0 && (
        <div>
          <span className="mb-2 block text-xs uppercase tracking-wide text-lilac-light">
            Las canciones nuevas van a
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setAddToKey(null)}
              aria-pressed={activeSection === null}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                activeSection === null
                  ? "border-accent bg-accent text-night"
                  : "border-plum bg-night/50 text-lilac-light"
              }`}
            >
              El final
            </button>
            {sections.map((s) => (
              <button
                key={s.key}
                onClick={() => setAddToKey(s.key)}
                aria-pressed={activeSection === s.key}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium tracking-wide ${
                  activeSection === s.key
                    ? "border-accent bg-accent text-night"
                    : "border-plum bg-night/50 text-lilac-light"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <Spinner label="Buscando..." />
      ) : searchError && results.length === 0 ? (
        <p className="py-6 text-center text-sm text-lilac-light">No pudimos cargar las canciones.</p>
      ) : results.length === 0 ? (
        <p className="py-6 text-center text-sm text-lilac-light">No encontramos canciones.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {results.map((song) => {
              const added = selectedIds.has(song.id);
              const used = usedInfo.get(song.id);
              return (
                <li
                  key={song.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-plum/60 bg-night/40 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-mist">{song.title}</span>
                    <span className="block truncate text-xs text-lilac-light">{song.artist}</span>
                    {used && (
                      <span className="block truncate text-[11px] text-lilac-light/80">
                        Usada {daysAgoText(used.lastUsedAt, now)} en &quot;{used.lastUsedIn}&quot;
                      </span>
                    )}
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
          {searchError && (
            <p className="text-center text-xs text-lilac-light">No pudimos cargar más canciones.</p>
          )}
          {hasMore && (
            <button
              ref={sentinelRef}
              onClick={() => {
                setSearchError(false);
                loadMore();
              }}
              disabled={loadingMore}
              className="rounded-full bg-plum py-2.5 text-sm font-medium text-mist disabled:opacity-60"
            >
              {loadingMore ? "Cargando..." : "Cargar más"}
            </button>
          )}
        </>
      )}

      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction ? pendingText[pendingAction.kind].title : ""}
        message={pendingAction ? pendingText[pendingAction.kind].message : undefined}
        confirmLabel={pendingAction ? pendingText[pendingAction.kind].confirm : undefined}
        danger={pendingAction?.kind !== "template"}
        onConfirm={confirmPending}
        onCancel={() => setPendingAction(null)}
      />

      <ConfirmDialog
        open={leaveTo !== null}
        title="¿Salir sin guardar?"
        message="Hiciste cambios en el power que todavía no guardaste. Si salís, se pierden."
        confirmLabel="Salir sin guardar"
        cancelLabel="Seguir editando"
        onConfirm={() => {
          const to = leaveTo;
          setLeaveTo(null);
          setLeaving(true);
          if (to) router.push(to);
        }}
        onCancel={() => setLeaveTo(null)}
      />
    </div>
  );
}
