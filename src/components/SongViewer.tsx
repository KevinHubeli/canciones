"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Song } from "@/lib/types";
import { displayChord, type ChordNotation } from "@/lib/chords";
import ChordLine from "@/components/ChordLine";
import FabMenu from "@/components/FabMenu";
import ChordDiagramPopover from "@/components/ChordDiagramPopover";

const TEXT_SIZE_KEY = "cancionero:textSizeIndex";
const AUTOSCROLL_PX_PER_TICK = 2;
const PREFERRED_PX = [14, 16, 19];

export default function SongViewer({
  song,
  setIds,
  index,
}: {
  song: Song;
  setIds?: string[];
  index?: number;
}) {
  const router = useRouter();
  const [semitones, setSemitones] = useState(0);
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);

  const lines = useMemo(() => song.body.split("\n"), [song.body]);
  const fontSizePx = PREFERRED_PX[textSizeIndex];

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
      setMaxCharsPerRow(Math.max(4, Math.floor(available / chWidth)));
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [fontSizePx]);

  useEffect(() => {
    try {
      localStorage.setItem(TEXT_SIZE_KEY, String(textSizeIndex));
    } catch {
      // no pasa nada si no se puede guardar la preferencia
    }
  }, [textSizeIndex]);

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

  return (
    <div className="flex flex-1 flex-col">
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
        className="flex-1 overflow-y-auto overflow-x-hidden px-5 pb-32 font-mono"
        style={{ fontSize: `${fontSizePx}px` }}
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
      />

      {activeChord && (
        <ChordDiagramPopover chord={activeChord} onClose={() => setActiveChord(null)} />
      )}

      {setIds && setIds.length > 0 && index !== undefined && (
        <div className="fixed bottom-24 left-4 z-40 flex items-center gap-2">
          <button
            onClick={() => goTo(router, setIds, index - 1)}
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
            onClick={() => goTo(router, setIds, index + 1)}
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

function goTo(router: ReturnType<typeof useRouter>, setIds: string[], newIndex: number) {
  if (newIndex < 0 || newIndex >= setIds.length) return;
  const params = new URLSearchParams({ set: setIds.join(","), i: String(newIndex) });
  router.push(`/canciones/${setIds[newIndex]}?${params}`);
}
