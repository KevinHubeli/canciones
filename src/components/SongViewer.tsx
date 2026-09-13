"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Song } from "@/lib/types";
import { displayChord, type ChordNotation } from "@/lib/chords";
import ChordLine from "@/components/ChordLine";
import FabMenu from "@/components/FabMenu";
import ChordDiagramPopover from "@/components/ChordDiagramPopover";

const TEXT_SIZE_KEY = "cancionero:textSizeIndex";
const AUTOSCROLL_PX_PER_TICK = 2;
const PREFERRED_PX = [14, 16, 19];

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
  const [maxCharsPerRow, setMaxCharsPerRow] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const lines = useMemo(() => song.body.split("\n"), [song.body]);
  const fontSizePx = PREFERRED_PX[textSizeIndex];

  // Cuántos caracteres monoespaciados entran en el ancho disponible, al
  // tamaño de letra elegido. Cualquier línea más larga que eso se corta en
  // varias filas (ChordLine + wrapLine) en vez de desbordar la pantalla.
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    function measure() {
      if (!container) return;
      const available = container.clientWidth - 8;
      if (available <= 0) return;

      canvasRef.current ??= document.createElement("canvas");
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      ctx.font = `${fontSizePx}px ${getComputedStyle(container).fontFamily}`;
      const chWidth = ctx.measureText("0").width || fontSizePx * 0.6;
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
    </div>
  );
}
