"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Song } from "@/lib/types";
import { displayChord, parseSongLine, type ChordNotation } from "@/lib/chords";
import ChordLine from "@/components/ChordLine";
import FabMenu from "@/components/FabMenu";
import ChordDiagramPopover from "@/components/ChordDiagramPopover";
import { addRecentSong } from "@/lib/recentSongs";

const TEXT_SIZE_KEY = "cancionero:textSizeIndex";
const AUTOSCROLL_PX_PER_TICK = 2;
const PREFERRED_PX = [14, 16, 19];

export default function SongViewer({
  song,
  setIds,
  setSemitones: powerSemitones,
  index,
  initialSemitones,
}: {
  song: Song;
  setIds?: string[];
  setSemitones?: number[];
  index?: number;
  initialSemitones?: number;
}) {
  const router = useRouter();
  const [semitones, setSemitones] = useState(initialSemitones ?? 0);
  const [notation, setNotation] = useState<ChordNotation>("en");
  const [textSizeIndex, setTextSizeIndex] = useState(() => {
    if (typeof window === "undefined") return 1;
    try {
      const saved = window.localStorage.getItem(TEXT_SIZE_KEY);
      return saved !== null ? Number(saved) : 1;
    } catch {
      return 1;
    }
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [diagramMode, setDiagramMode] = useState(false);
  const [activeChord, setActiveChord] = useState<string | null>(null);
  const [maxCharsPerRow, setMaxCharsPerRow] = useState<number | null>(null);
  const [columnWidthPx, setColumnWidthPx] = useState<number | null>(null);
  const [isWide, setIsWide] = useState(false);
  const [columnHeightPx, setColumnHeightPx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);

  const lines = useMemo(() => song.body.split("\n"), [song.body]);
  const fontSizePx = PREFERRED_PX[textSizeIndex];

  // Ancho de columna "de lectura" ideal para esta canción en particular: la
  // línea más larga que tenga, así una canción de versos cortos usa menos
  // ancho por columna (y entran más columnas) que una de versos largos.
  const readingChars = useMemo(() => {
    const longest = lines.reduce((max, l) => Math.max(max, parseSongLine(l).lyrics.length), 0);
    return Math.min(50, Math.max(24, longest));
  }, [lines]);

  // Cuántos caracteres monoespaciados entran en el ancho disponible, al
  // tamaño de letra elegido. Cualquier línea más larga que eso se corta en
  // varias filas (ChordLine + wrapLine) en vez de desbordar la pantalla.
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    function measure() {
      if (!container || !measureRef.current) return;
      const style = getComputedStyle(container);
      // clientWidth incluye el padding horizontal del contenedor (px-5):
      // sin restarlo acá, el cálculo asumía más ancho real del que había.
      const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const available = container.clientWidth - paddingX - 4;
      if (available <= 0) return;

      // Se mide con un elemento real (mismas clases que las líneas de
      // letra) en vez de un canvas: un canvas puede resolver la fuente
      // monoespaciada con métricas levemente distintas a como el navegador
      // termina renderizando el texto real, y eso desalineaba el corte.
      const REF_LEN = 100;
      const chWidth = measureRef.current.getBoundingClientRect().width / REF_LEN || fontSizePx * 0.6;

      // En pantalla ancha (celular horizontal, tablet) sobra espacio a los
      // costados si dejamos una sola columna que ocupa todo el ancho. Para
      // esos casos se usa el ancho "de lectura" de esta canción (no todo el
      // disponible) y se deja que el CSS reparta en 2+ columnas solas; en
      // vertical se sigue usando el ancho completo, como siempre.
      const landscape = container.clientWidth > container.clientHeight;
      const COLUMN_GAP_PX = 40; // 2.5rem, tiene que matchear el columnGap de abajo

      const colWidthPx = readingChars * chWidth + paddingX;
      const fitsTwoColumns = landscape && container.clientWidth > colWidthPx * 2 + COLUMN_GAP_PX;

      if (fitsTwoColumns) {
        setMaxCharsPerRow(readingChars);
        setColumnWidthPx(colWidthPx);
        setIsWide(true);
        // Un contenedor con columnas necesita una altura explícita en
        // píxeles para repartir el contenido entre columnas: si la altura
        // sale solo del flex (flex-1), algunos navegadores no fragmentan
        // bien y todo se apila en una sola columna igual.
        setColumnHeightPx(container.clientHeight);
      } else {
        // No entran 2 columnas de lectura completas: mejor usar todo el
        // ancho disponible en una sola columna (como en vertical) que dejar
        // una columna angosta con medio celular vacío al lado.
        setMaxCharsPerRow(Math.max(4, Math.floor(available / chWidth)));
        setColumnWidthPx(null);
        setIsWide(false);
        setColumnHeightPx(null);
      }
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [fontSizePx, readingChars]);

  useEffect(() => {
    try {
      localStorage.setItem(TEXT_SIZE_KEY, String(textSizeIndex));
    } catch {
      // no pasa nada si no se puede guardar la preferencia
    }
  }, [textSizeIndex]);

  useEffect(() => {
    addRecentSong({ id: song.id, title: song.title, artist: song.artist });
  }, [song.id, song.title, song.artist]);

  useEffect(() => {
    if (isWide) setAutoScroll(false);
  }, [isWide]);

  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    const id = setInterval(() => el.scrollBy({ top: AUTOSCROLL_PX_PER_TICK }), 40);
    return () => clearInterval(id);
  }, [autoScroll]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pause = () => setAutoScroll(false);
    el.addEventListener("wheel", pause, { passive: true });
    el.addEventListener("touchstart", pause, { passive: true });
    return () => {
      el.removeEventListener("wheel", pause);
      el.removeEventListener("touchstart", pause);
    };
  }, []);

  // Deslizar para pasar de canción dentro de un power (solo en vertical: en
  // modo columnas el deslizar horizontal ya se usa para recorrer el texto).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || isWide || !setIds || index === undefined) return;

    const ids = setIds;
    const currentIndex = index;
    let startX = 0;
    let startY = 0;
    let tracking = false;

    function onStart(e: TouchEvent) {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
    }
    function onEnd(e: TouchEvent) {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const SWIPE_THRESHOLD = 60;
      if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) goTo(router, ids, powerSemitones, currentIndex + 1);
      else goTo(router, ids, powerSemitones, currentIndex - 1);
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
  }, [isWide, setIds, powerSemitones, index, router]);

  return (
    <div className="flex h-[100dvh] flex-col">
      <div className="px-5 pb-2 pt-6 animate-fade-in">
        <span className="text-xs uppercase tracking-[0.3em] text-lilac-light">{song.artist}</span>
        <h1 className="font-display text-2xl text-mist">{song.title}</h1>
        <p className="mt-1 text-xs text-lilac-light">
          Tono: {displayChord(song.originalKey, semitones, notation)}
          {song.category ? ` · ${song.category}` : ""}
          {diagramMode ? " · Tocá un acorde para ver el diagrama" : ""}
        </p>
      </div>

      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 px-5 pb-32 font-mono ${
          isWide ? "overflow-x-auto overflow-y-hidden" : "overflow-y-auto overflow-x-hidden"
        }`}
        style={{
          fontSize: `${fontSizePx}px`,
          ...(isWide && columnWidthPx && columnHeightPx
            ? {
                columnWidth: `${columnWidthPx}px`,
                columnGap: "2.5rem",
                columnFill: "auto" as const,
                height: `${columnHeightPx}px`,
              }
            : {}),
        }}
        onClick={(e) => {
          if (!diagramMode) return;
          const target = (e.target as HTMLElement).closest<HTMLElement>("[data-chord]");
          if (target?.dataset.chord) setActiveChord(target.dataset.chord);
        }}
      >
        <span
          ref={measureRef}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 -z-10 whitespace-pre font-mono opacity-0"
        >
          {"0".repeat(100)}
        </span>
        {lines.map((line, i) => (
          <ChordLine
            key={i}
            raw={line}
            semitones={semitones}
            notation={notation}
            interactive={diagramMode}
            maxCharsPerRow={maxCharsPerRow}
          />
        ))}
      </div>

      <FabMenu
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((v) => !v)}
        autoScroll={autoScroll}
        onToggleAutoScroll={() => setAutoScroll((v) => !v)}
        diagramMode={diagramMode}
        onToggleDiagramMode={() => setDiagramMode((v) => !v)}
        semitones={semitones}
        onChangeSemitones={setSemitones}
        keyLabel={displayChord(song.originalKey, semitones, notation)}
        notation={notation}
        onToggleNotation={() => setNotation((n) => (n === "en" ? "latin" : "en"))}
        textSizeIndex={textSizeIndex}
        onChangeTextSizeIndex={setTextSizeIndex}
        showAutoScroll={!isWide}
      />

      {activeChord && (
        <ChordDiagramPopover chord={activeChord} onClose={() => setActiveChord(null)} />
      )}

      {setIds && setIds.length > 0 && index !== undefined && (
        <div className="fixed bottom-24 left-4 z-40 flex items-center gap-2">
          <button
            onClick={() => goTo(router, setIds, powerSemitones, index - 1)}
            disabled={index <= 0}
            aria-label="Canción anterior del power"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-night/90 text-mist shadow-lg disabled:opacity-30"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="rounded-full bg-night/90 px-3 py-1.5 text-xs text-lilac-light shadow-lg">
            {index + 1}/{setIds.length}
          </span>
          <button
            onClick={() => goTo(router, setIds, powerSemitones, index + 1)}
            disabled={index >= setIds.length - 1}
            aria-label="Canción siguiente del power"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-night/90 text-mist shadow-lg disabled:opacity-30"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

function goTo(
  router: ReturnType<typeof useRouter>,
  setIds: string[],
  setSemitones: number[] | undefined,
  newIndex: number
) {
  if (newIndex < 0 || newIndex >= setIds.length) return;
  const params = new URLSearchParams({ set: setIds.join(","), i: String(newIndex) });
  if (setSemitones) params.set("t", setSemitones.join(","));
  router.push(`/canciones/${setIds[newIndex]}?${params}`);
}
