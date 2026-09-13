"use client";

import { useEffect, useRef, useState } from "react";
import type { Song } from "@/lib/types";
import { displayChord, type ChordNotation } from "@/lib/chords";
import ChordLine from "@/components/ChordLine";
import FabMenu from "@/components/FabMenu";
import ChordDiagramPopover from "@/components/ChordDiagramPopover";

const TEXT_SIZES = ["text-sm", "text-base", "text-lg"];
const TEXT_SIZE_KEY = "cancionero:textSizeIndex";
const AUTOSCROLL_PX_PER_TICK = 2;

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
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const lines = song.body.split("\n");

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
        className="flex-1 overflow-y-auto overflow-x-auto px-5 pb-32"
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
            textSizeClass={TEXT_SIZES[textSizeIndex]}
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
