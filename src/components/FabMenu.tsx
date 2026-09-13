"use client";

import { useState } from "react";
import {
  EyeOff,
  ListMusic,
  Guitar,
  ArrowLeftRight,
  Languages,
  CaseSensitive,
  Minus,
  Plus,
  Eye,
} from "lucide-react";
import type { ChordNotation } from "@/lib/chords";

type Props = {
  menuOpen: boolean;
  onToggleMenu: () => void;
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
  scrollSpeed: number;
  onChangeScrollSpeed: (speed: number) => void;
  diagramMode: boolean;
  onToggleDiagramMode: () => void;
  semitones: number;
  onChangeSemitones: (semitones: number) => void;
  keyLabel: string;
  notation: ChordNotation;
  onToggleNotation: () => void;
  textSizeIndex: number;
  onChangeTextSizeIndex: (index: number) => void;
};

type PanelId = "tone" | "text" | null;

export default function FabMenu({
  menuOpen,
  onToggleMenu,
  autoScroll,
  onToggleAutoScroll,
  scrollSpeed,
  onChangeScrollSpeed,
  diagramMode,
  onToggleDiagramMode,
  semitones,
  onChangeSemitones,
  keyLabel,
  notation,
  onToggleNotation,
  textSizeIndex,
  onChangeTextSizeIndex,
}: Props) {
  const [panel, setPanel] = useState<PanelId>(null);

  if (!menuOpen) {
    return (
      <button
        onClick={onToggleMenu}
        aria-label="Mostrar menú"
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-mist shadow-[0_10px_25px_-8px_rgba(240,130,74,0.7)]"
      >
        <Eye size={22} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 right-4 z-40 flex flex-col items-end gap-3">
      {panel === "tone" && (
        <Panel title={`Tono: ${keyLabel}`} onClose={() => setPanel(null)}>
          <div className="flex items-center justify-center gap-4">
            <RoundButton onClick={() => onChangeSemitones(Math.max(-11, semitones - 1))} label="Bajar semitono">
              <Minus size={18} />
            </RoundButton>
            <span className="w-10 text-center font-mono text-lg text-chord-gold">
              {semitones > 0 ? `+${semitones}` : semitones}
            </span>
            <RoundButton onClick={() => onChangeSemitones(Math.min(11, semitones + 1))} label="Subir semitono">
              <Plus size={18} />
            </RoundButton>
          </div>
        </Panel>
      )}

      {panel === "text" && (
        <Panel title="Tamaño del texto" onClose={() => setPanel(null)}>
          <div className="flex items-center justify-center gap-4">
            <RoundButton
              onClick={() => onChangeTextSizeIndex(Math.max(0, textSizeIndex - 1))}
              label="Achicar letra"
            >
              <span className="text-sm font-bold">A−</span>
            </RoundButton>
            <RoundButton
              onClick={() => onChangeTextSizeIndex(Math.min(2, textSizeIndex + 1))}
              label="Agrandar letra"
            >
              <span className="text-sm font-bold">A+</span>
            </RoundButton>
          </div>
        </Panel>
      )}

      {autoScroll && (
        <Panel title="Velocidad" onClose={undefined}>
          <div className="flex items-center justify-center gap-4">
            <RoundButton onClick={() => onChangeScrollSpeed(Math.max(1, scrollSpeed - 1))} label="Más lento">
              <Minus size={18} />
            </RoundButton>
            <span className="w-6 text-center font-mono text-lg text-chord-gold">{scrollSpeed}</span>
            <RoundButton onClick={() => onChangeScrollSpeed(Math.min(8, scrollSpeed + 1))} label="Más rápido">
              <Plus size={18} />
            </RoundButton>
          </div>
        </Panel>
      )}

      <div className="flex flex-col items-end gap-2.5">
        <FabButton label="Mostrar/Ocultar Menú" onClick={onToggleMenu} icon={<EyeOff size={20} />} />
        <FabButton
          label="Desfile Automático"
          onClick={onToggleAutoScroll}
          active={autoScroll}
          icon={<ListMusic size={20} />}
        />
        <FabButton
          label="Diagramas de Acordes"
          onClick={onToggleDiagramMode}
          active={diagramMode}
          icon={<Guitar size={20} />}
        />
        <FabButton
          label="Cambio de Tono"
          onClick={() => setPanel(panel === "tone" ? null : "tone")}
          active={panel === "tone"}
          icon={<ArrowLeftRight size={20} />}
        />
        <FabButton
          label={notation === "en" ? "Cifrado Inglés" : "Cifrado Latino"}
          onClick={onToggleNotation}
          icon={<Languages size={20} />}
        />
        <FabButton
          label="Formato del Texto"
          onClick={() => setPanel(panel === "text" ? null : "text")}
          active={panel === "text"}
          icon={<CaseSensitive size={20} />}
        />
      </div>
    </div>
  );
}

function FabButton({
  label,
  onClick,
  icon,
  active,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-12 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium shadow-lg transition-colors ${
        active ? "bg-accent text-mist" : "bg-night/90 text-lilac-light"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function RoundButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-mist active:scale-95"
    >
      {children}
    </button>
  );
}

function Panel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="w-56 rounded-2xl bg-night/95 p-3 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-lilac-light">{title}</span>
        {onClose && (
          <button onClick={onClose} className="text-lilac-light">
            ×
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
