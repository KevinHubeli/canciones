"use client";

import { useId, useState } from "react";
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
  MonitorOff,
  MonitorSmartphone,
} from "lucide-react";
import type { ChordNotation } from "@/lib/chords";
import { MAX_CAPO } from "@/lib/viewerPrefs";

export type WakeState = "on" | "off";

type Props = {
  menuOpen: boolean;
  onToggleMenu: () => void;
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
  /** Velocidad del desfile: posición en la lista de velocidades. */
  autoScrollSpeedIndex: number;
  autoScrollSpeedCount: number;
  onChangeAutoScrollSpeedIndex: (index: number) => void;
  diagramMode: boolean;
  onToggleDiagramMode: () => void;
  semitones: number;
  onChangeSemitones: (semitones: number) => void;
  keyLabel: string;
  /** Traste de la cejilla (0 = sin cejilla). */
  capo: number;
  onChangeCapo: (capo: number) => void;
  /** "Capo 3 · tocá en G" */
  capoSummary: string;
  /** Traste sugerido para que los acordes queden fáciles. */
  suggestedCapo: number;
  notation: ChordNotation;
  onToggleNotation: () => void;
  textSizeIndex: number;
  textSizeCount: number;
  fontSizePx: number;
  onChangeTextSizeIndex: (index: number) => void;
  showAutoScroll?: boolean;
  /** Si el celular mantiene la pantalla encendida (Wake Lock). */
  wakeState: WakeState;
};

type PanelId = "tone" | "text" | "speed" | null;

export default function FabMenu({
  menuOpen,
  onToggleMenu,
  autoScroll,
  onToggleAutoScroll,
  autoScrollSpeedIndex,
  autoScrollSpeedCount,
  onChangeAutoScrollSpeedIndex,
  diagramMode,
  onToggleDiagramMode,
  semitones,
  onChangeSemitones,
  keyLabel,
  capo,
  onChangeCapo,
  capoSummary,
  suggestedCapo,
  notation,
  onToggleNotation,
  textSizeIndex,
  textSizeCount,
  fontSizePx,
  onChangeTextSizeIndex,
  showAutoScroll = true,
  wakeState,
}: Props) {
  const [panel, setPanel] = useState<PanelId>(null);
  const menuId = useId();
  const visiblePanel = menuOpen ? panel : null;

  function closeMenu() {
    setPanel(null);
    if (menuOpen) onToggleMenu();
  }

  function togglePanel(id: Exclude<PanelId, null>) {
    setPanel(panel === id ? null : id);
  }

  return (
    <div
      role="group"
      aria-label="Controles del visor"
      className="fixed bottom-24 right-4 z-40 flex flex-col items-end gap-3"
      onKeyDown={(e) => {
        // Escape cierra primero el panel abierto y después el menú.
        if (e.key !== "Escape" || !menuOpen) return;
        e.stopPropagation();
        if (panel) setPanel(null);
        else closeMenu();
      }}
    >
      {menuOpen && (
        <div
          id={menuId}
          className="flex max-h-[calc(100dvh-11rem)] flex-col items-end gap-3 overflow-y-auto overscroll-contain p-1"
        >
          {visiblePanel === "tone" && (
            <Panel title={`Tono: ${keyLabel}`} onClose={() => setPanel(null)}>
              <div className="flex items-center justify-center gap-4">
                <RoundButton
                  onClick={() => onChangeSemitones(Math.max(-11, semitones - 1))}
                  label="Bajar semitono"
                  disabled={semitones <= -11}
                >
                  <Minus size={18} />
                </RoundButton>
                <span
                  className="w-10 text-center font-mono text-lg text-chord-gold"
                  aria-live="polite"
                  aria-label={`Semitonos: ${semitones}`}
                >
                  {semitones > 0 ? `+${semitones}` : semitones}
                </span>
                <RoundButton
                  onClick={() => onChangeSemitones(Math.min(11, semitones + 1))}
                  label="Subir semitono"
                  disabled={semitones >= 11}
                >
                  <Plus size={18} />
                </RoundButton>
              </div>

              <div className="mt-3 border-t border-plum pt-3">
                <span className="mb-2 block text-xs uppercase tracking-wide text-lilac-light">
                  Capo (cejilla)
                </span>
                <div className="flex items-center justify-center gap-4">
                  <RoundButton
                    onClick={() => onChangeCapo(Math.max(0, capo - 1))}
                    label="Bajar un traste de cejilla"
                    disabled={capo <= 0}
                  >
                    <Minus size={18} />
                  </RoundButton>
                  <span
                    className="w-10 text-center font-mono text-lg text-chord-gold"
                    aria-label={capo === 0 ? "Sin cejilla" : `Cejilla en el traste ${capo}`}
                  >
                    {capo}
                  </span>
                  <RoundButton
                    onClick={() => onChangeCapo(Math.min(MAX_CAPO, capo + 1))}
                    label="Subir un traste de cejilla"
                    disabled={capo >= MAX_CAPO}
                  >
                    <Plus size={18} />
                  </RoundButton>
                </div>
                <p className="mt-2 text-center text-xs text-mist" aria-live="polite">
                  {capoSummary}
                </p>
                <button
                  type="button"
                  onClick={() => onChangeCapo(suggestedCapo)}
                  disabled={suggestedCapo === capo}
                  className="mt-2 w-full rounded-full bg-plum py-1.5 text-xs font-medium text-mist disabled:opacity-40"
                >
                  {suggestedCapo === capo
                    ? "Es la cejilla sugerida"
                    : suggestedCapo === 0
                      ? "Sugerida: sin cejilla"
                      : `Sugerida: traste ${suggestedCapo}`}
                </button>
              </div>
            </Panel>
          )}

          {visiblePanel === "text" && (
            <Panel title="Tamaño del texto" onClose={() => setPanel(null)}>
              <div className="flex items-center justify-center gap-4">
                <RoundButton
                  onClick={() => onChangeTextSizeIndex(Math.max(0, textSizeIndex - 1))}
                  label="Achicar letra"
                  disabled={textSizeIndex <= 0}
                >
                  <span className="text-sm font-bold">A−</span>
                </RoundButton>
                <span className="w-12 text-center font-mono text-sm text-chord-gold" aria-live="polite">
                  {fontSizePx}px
                </span>
                <RoundButton
                  onClick={() =>
                    onChangeTextSizeIndex(Math.min(textSizeCount - 1, textSizeIndex + 1))
                  }
                  label="Agrandar letra"
                  disabled={textSizeIndex >= textSizeCount - 1}
                >
                  <span className="text-sm font-bold">A+</span>
                </RoundButton>
              </div>
            </Panel>
          )}

          {visiblePanel === "speed" && (
            <Panel title="Velocidad del desfile" onClose={() => setPanel(null)}>
              <div className="flex items-center justify-center gap-4">
                <RoundButton
                  onClick={() => onChangeAutoScrollSpeedIndex(Math.max(0, autoScrollSpeedIndex - 1))}
                  label="Desfile más lento"
                  disabled={autoScrollSpeedIndex <= 0}
                >
                  <Minus size={18} />
                </RoundButton>
                <span className="w-12 text-center font-mono text-sm text-chord-gold" aria-live="polite">
                  {autoScrollSpeedIndex + 1}/{autoScrollSpeedCount}
                </span>
                <RoundButton
                  onClick={() =>
                    onChangeAutoScrollSpeedIndex(
                      Math.min(autoScrollSpeedCount - 1, autoScrollSpeedIndex + 1)
                    )
                  }
                  label="Desfile más rápido"
                  disabled={autoScrollSpeedIndex >= autoScrollSpeedCount - 1}
                >
                  <Plus size={18} />
                </RoundButton>
              </div>
            </Panel>
          )}

          <div className="flex flex-col items-end gap-2.5">
            {showAutoScroll && (
              <FabButton
                label="Desfile Automático"
                onClick={() => {
                  // Al prenderlo se abre la velocidad: se toca una vez y ya se puede ajustar.
                  setPanel(autoScroll ? (panel === "speed" ? null : panel) : "speed");
                  onToggleAutoScroll();
                }}
                active={autoScroll}
                icon={<ListMusic size={20} />}
              />
            )}
            <FabButton
              label="Diagramas de Acordes"
              onClick={onToggleDiagramMode}
              active={diagramMode}
              icon={<Guitar size={20} />}
            />
            <FabButton
              label="Cambio de Tono"
              onClick={() => togglePanel("tone")}
              active={panel === "tone"}
              expanded={panel === "tone"}
              icon={<ArrowLeftRight size={20} />}
            />
            <FabButton
              label={notation === "en" ? "Cifrado Inglés" : "Cifrado Latino"}
              onClick={onToggleNotation}
              icon={<Languages size={20} />}
            />
            <FabButton
              label="Formato del Texto"
              onClick={() => togglePanel("text")}
              active={panel === "text"}
              expanded={panel === "text"}
              icon={<CaseSensitive size={20} />}
            />
            <p
              role="status"
              className="flex items-center gap-1.5 rounded-full bg-night/80 px-3 py-1 text-[11px] text-lilac-light"
            >
              {wakeState === "on" ? (
                <>
                  <MonitorSmartphone size={13} aria-hidden />
                  Pantalla siempre encendida
                </>
              ) : (
                <>
                  <MonitorOff size={13} aria-hidden />
                  La pantalla puede apagarse
                </>
              )}
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (menuOpen) setPanel(null);
          onToggleMenu();
        }}
        aria-label={menuOpen ? "Ocultar menú" : "Mostrar menú"}
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-night shadow-[0_10px_25px_-8px_rgba(0,0,0,0.5)]"
      >
        <Eye
          size={22}
          aria-hidden
          className={`absolute transition-all duration-300 ease-out ${
            menuOpen ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"
          }`}
        />
        <EyeOff
          size={22}
          aria-hidden
          className={`absolute transition-all duration-300 ease-out ${
            menuOpen ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0"
          }`}
        />
      </button>
    </div>
  );
}

function FabButton({
  label,
  onClick,
  icon,
  active,
  expanded,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  active?: boolean;
  /** Para los botones que abren un panel: indica si está abierto (en vez de "activado"). */
  expanded?: boolean;
}) {
  const opensPanel = expanded !== undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={opensPanel ? undefined : active}
      aria-expanded={opensPanel ? expanded : undefined}
      className={`flex h-12 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium shadow-lg transition-colors ${
        active ? "bg-accent text-night" : "bg-night/90 text-lilac-light"
      }`}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function RoundButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-plum text-mist active:scale-95 disabled:opacity-40 disabled:active:scale-100"
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
    <div role="group" aria-label={title} className="w-60 rounded-2xl bg-night/95 p-3 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-lilac-light">{title}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={`Cerrar panel: ${title}`}
            className="flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none text-lilac-light"
          >
            <span aria-hidden>×</span>
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
