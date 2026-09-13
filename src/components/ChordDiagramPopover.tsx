"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  getBassDiagram,
  getGuitarDiagram,
  getKeyboardDiagram,
  type FretDiagram as FretDiagramData,
  type KeyboardDiagram as KeyboardDiagramData,
} from "@/lib/chordDiagrams";

type Instrument = "guitar" | "bass" | "keyboard";

export default function ChordDiagramPopover({
  chord,
  onClose,
}: {
  chord: string;
  onClose: () => void;
}) {
  const [instrument, setInstrument] = useState<Instrument>("guitar");

  const guitar = getGuitarDiagram(chord);
  const bass = getBassDiagram(chord);
  const keyboard = getKeyboardDiagram(chord);
  const nothingAvailable = !guitar && !bass && !keyboard;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-t-3xl bg-night p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-lg font-semibold text-chord-gold">{chord}</span>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-mist"
          >
            <X size={16} />
          </button>
        </div>

        {nothingAvailable ? (
          <p className="py-6 text-center text-sm text-lilac-light">
            Diagrama no disponible para este acorde.
          </p>
        ) : (
          <>
            <div className="mb-4 flex justify-center gap-2">
              <Tab label="Guitarra" active={instrument === "guitar"} disabled={!guitar} onClick={() => setInstrument("guitar")} />
              <Tab label="Bajo" active={instrument === "bass"} disabled={!bass} onClick={() => setInstrument("bass")} />
              <Tab label="Teclado" active={instrument === "keyboard"} disabled={!keyboard} onClick={() => setInstrument("keyboard")} />
            </div>

            {instrument === "guitar" && guitar && <FretDiagram frets={guitar.frets} />}
            {instrument === "bass" && bass && <FretDiagram frets={bass.frets} />}
            {instrument === "keyboard" && keyboard && <PianoDiagram activeKeys={keyboard.activeKeys} />}
          </>
        )}
      </div>
    </div>
  );
}

function Tab({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
        active ? "bg-accent text-mist" : "bg-white/10 text-lilac-light"
      } ${disabled ? "opacity-30" : ""}`}
    >
      {label}
    </button>
  );
}

function FretDiagram({ frets }: { frets: FretDiagramData["frets"] }) {
  const stringGap = 20;
  const width = stringGap * (frets.length - 1);
  const height = 120;
  const fretGap = height / 4;

  const fretsUsed = frets.filter((f) => f > 0);
  const baseFret = fretsUsed.length ? Math.min(...fretsUsed) : 1;

  return (
    <svg viewBox={`-10 -14 ${width + 24} ${height + 20}`} className="mx-auto h-44 w-full max-w-[180px]">
      {frets.map((_, s) => (
        <line
          key={`string-${s}`}
          x1={s * stringGap}
          y1={0}
          x2={s * stringGap}
          y2={height}
          stroke="#9a9a9d"
          strokeWidth={1}
        />
      ))}
      {[0, 1, 2, 3, 4].map((f) => (
        <line
          key={`fret-${f}`}
          x1={0}
          y1={f * fretGap}
          x2={width}
          y2={f * fretGap}
          stroke="#9a9a9d"
          strokeWidth={f === 0 && baseFret === 1 ? 3 : 1}
        />
      ))}
      {baseFret > 1 && (
        <text x={width + 6} y={fretGap * 0.7} fontSize={10} fill="#9a9a9d">
          {baseFret}
        </text>
      )}
      {frets.map((f, i) => {
        const x = i * stringGap;
        if (f === -1) {
          return (
            <text key={`x-${i}`} x={x} y={-4} fontSize={10} textAnchor="middle" fill="#ff5a3c">
              ×
            </text>
          );
        }
        if (f === 0) {
          return <circle key={`o-${i}`} cx={x} cy={-6} r={3} fill="none" stroke="#9a9a9d" strokeWidth={1} />;
        }
        const rel = f - baseFret + 1;
        return <circle key={`d-${i}`} cx={x} cy={(rel - 0.5) * fretGap} r={5} fill="#ff5a3c" />;
      })}
    </svg>
  );
}

const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
// Semitono de la tecla negra que va justo después de cada tecla blanca (null = no hay negra ahí).
const BLACK_AFTER_WHITE: (number | null)[] = [1, 3, null, 6, 8, 10, null];

function PianoDiagram({ activeKeys }: { activeKeys: KeyboardDiagramData["activeKeys"] }) {
  const whiteWidth = 24;
  const whiteHeight = 90;
  const blackWidth = 14;
  const blackHeight = 55;
  const isActive = (semitone: number) => activeKeys.includes(semitone);

  return (
    <svg
      viewBox={`0 0 ${whiteWidth * WHITE_SEMITONES.length} ${whiteHeight}`}
      className="mx-auto h-32 w-full max-w-[220px]"
    >
      {WHITE_SEMITONES.map((semitone, i) => (
        <rect
          key={`w-${i}`}
          x={i * whiteWidth}
          y={0}
          width={whiteWidth}
          height={whiteHeight}
          fill={isActive(semitone) ? "#ff5a3c" : "#f2f2f0"}
          stroke="#2e2e31"
          strokeWidth={1}
        />
      ))}
      {BLACK_AFTER_WHITE.map((blackSemitone, i) => {
        if (blackSemitone === null) return null;
        const x = (i + 1) * whiteWidth - blackWidth / 2;
        return (
          <rect
            key={`b-${i}`}
            x={x}
            y={0}
            width={blackWidth}
            height={blackHeight}
            fill={isActive(blackSemitone) ? "#ff5a3c" : "#0a0a0b"}
            stroke="#2e2e31"
            strokeWidth={1}
          />
        );
      })}
    </svg>
  );
}
