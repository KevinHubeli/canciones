"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Song } from "@/lib/types";
import { displayChord, parseSongLine, type ChordNotation } from "@/lib/chords";
import ChordLine from "@/components/ChordLine";
import FabMenu from "@/components/FabMenu";
import ChordDiagramPopover from "@/components/ChordDiagramPopover";

const TEXT_SIZE_KEY = "cancionero:textSizeIndex";
const AUTOSCROLL_PX_PER_TICK = 2;
// Tamaños preferidos por el usuario (A-/A+); nunca se usan si no entran en
// el ancho de pantalla: ahí gana el cálculo de "fitPx" (ver más abajo).
const PREFERRED_PX = [14, 16, 19];
const MIN_FIT_PX = 10;

export default function SongViewer({ song }: { song: Song }) {
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
  const [menuOpen, setMenuOpen] = useState(true);
  const [autoScroll, setAutoScroll] = useState(false);
  const [diagramMode, setDiagramMode] = useState(false);
  const [activeChord, setActiveChord] = useState<string | null>(null);
  const [fontSizePx, setFontSizePx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const lines = useMemo(() => song.body.split("\n"), [song.body]);

  // El caracter más ancho que puede llegar a ocupar cada línea: la letra, o
  // el último acorde si queda más a la derecha que la letra (línea corta con
  // un acorde final, p. ej. "...corazón[A7]"). Se recalcula si cambia el
  // tono o la notación porque el largo del nombre del acorde puede variar.
  const maxChars = useMemo(() => {
    let max = 1;
    for (const raw of lines) {
      const { lyrics, chords } = parseSongLine(raw);
      let lineMax = lyrics.length;
      for (const chord of chords) {
        const label = displayChord(chord.chord, semitones, notation);
        lineMax = Math.max(lineMax, chord.index + label.length);
      }
      max = Math.max(max, lineMax);
    }
    return max;
  }, [lines, semitones, notation]);

  // Ajusta el tamaño de letra para que la línea más larga siempre entre en el
  // ancho de pantalla disponible: así nunca hace falta hacer scroll horizontal.
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    function fit() {
      if (!container) return;
      const available = container.clientWidth - 8;
      if (available <= 0) return;

      canvasRef.current ??= document.createElement("canvas");
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      const probe = 16;
      ctx.font = `${probe}px ${getComputedStyle(container).fontFamily}`;
      const chWidthAtProbe = ctx.measureText("0").width || probe * 0.6;

      const fitPx = Math.max(MIN_FIT_PX, Math.floor((available * probe) / (maxChars * chWidthAtProbe)));
      setFontSizePx(Math.min(PREFERRED_PX[textSizeIndex], fitPx));
    }

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [maxChars, textSizeIndex]);

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
        className="flex-1 overflow-y-auto overflow-x-auto px-5 pb-32 font-mono"
        style={fontSizePx ? { fontSize: `${fontSizePx}px` } : { visibility: "hidden" }}
        onClick={(e) => {
          if (!diagramMode) return;
          const target = (e.target as HTMLElement).closest<HTMLElement>("[data-chord]");
          if (target?.dataset.chord) setActiveChord(target.dataset.chord);
        }}
      >
        {lines.map((line, i) => (
          <ChordLine
            key={i}
            raw={line}
            semitones={semitones}
            notation={notation}
            interactive={diagramMode}
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
    </div>
  );
}
