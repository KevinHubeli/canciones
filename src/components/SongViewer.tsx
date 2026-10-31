"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Song } from "@/lib/types";
import {
  displayChord,
  normalizePlainChordLines,
  parseSongLine,
  suggestCapo,
  type ChordNotation,
} from "@/lib/chords";
import ChordLine from "@/components/ChordLine";
import FabMenu from "@/components/FabMenu";
import ChordDiagramPopover from "@/components/ChordDiagramPopover";
import { addRecentSong } from "@/lib/recentSongs";
import { type SetlistDivider } from "@/lib/dividers";
import { songHref } from "@/lib/powerView";
import { useStoredString, writeStored } from "@/lib/useStoredString";
import { keepScreenAwake } from "@/lib/wakeLock";
import {
  AUTOSCROLL_SPEEDS_PX_PER_SEC,
  DEFAULT_AUTOSCROLL_SPEED_INDEX,
  DEFAULT_TEXT_SIZE_INDEX,
  TEXT_SIZES_PX,
  autoscrollStep,
  capoSummary as buildCapoSummary,
  clampCapo,
  parseStoredIndex,
  swipeDirection,
} from "@/lib/viewerPrefs";

const TEXT_SIZE_KEY = "cancionero:textSizeIndex";
const AUTOSCROLL_SPEED_KEY = "cancionero:autoscrollSpeedIndex";
// Constante: un [] nuevo en cada render haría que los efectos se rearmen todo el tiempo.
const NO_DIVIDERS: SetlistDivider[] = [];
// Dos toques seguidos a "siguiente" no tienen que saltear una canción.
const NAV_COOLDOWN_MS = 600;

export default function SongViewer({
  song,
  setIds,
  setSemitones: powerSemitones,
  index,
  initialSemitones,
  setDividers = NO_DIVIDERS,
  showDividerIntro = false,
}: {
  song: Song;
  setIds?: string[];
  setSemitones?: number[];
  index?: number;
  initialSemitones?: number;
  setDividers?: SetlistDivider[];
  showDividerIntro?: boolean;
}) {
  const router = useRouter();
  const [semitones, setSemitones] = useState(initialSemitones ?? 0);
  const [notation, setNotation] = useState<ChordNotation>("en");
  // El tamaño de texto y la velocidad del desfile elegidos se guardan en el navegador (ver useStoredString).
  const textSizeIndex = parseStoredIndex(
    useStoredString(TEXT_SIZE_KEY),
    TEXT_SIZES_PX.length,
    DEFAULT_TEXT_SIZE_INDEX
  );
  const setTextSizeIndex = (i: number) => writeStored(TEXT_SIZE_KEY, String(i));
  const speedIndex = parseStoredIndex(
    useStoredString(AUTOSCROLL_SPEED_KEY),
    AUTOSCROLL_SPEEDS_PX_PER_SEC.length,
    DEFAULT_AUTOSCROLL_SPEED_INDEX
  );
  const setSpeedIndex = (i: number) => writeStored(AUTOSCROLL_SPEED_KEY, String(i));
  // Cejilla (capo): los acordes se muestran como se tocan con la cejilla en ese traste.
  const [capo, setCapoRaw] = useState(0);
  const setCapo = (n: number) => setCapoRaw(clampCapo(n));
  const [wakeActive, setWakeActive] = useState(false);
  const lastNavRef = useRef(0);
  // Al avanzar a una canción que abre una sección ("ALABANZA", "OFRENDA"...) se
  // muestra primero una pantalla con el nombre; un toque la cierra.
  const sectionIntro =
    showDividerIntro && index !== undefined
      ? setDividers.filter((d) => d.position === index).map((d) => d.name)
      : [];
  const [introDismissed, setIntroDismissed] = useState(false);
  // Sección en la que está la canción actual (la última que empezó antes).
  const currentSection =
    index !== undefined
      ? setDividers.filter((d) => d.position <= index).map((d) => d.name).at(-1)
      : undefined;
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

  const lines = useMemo(() => normalizePlainChordLines(song.body), [song.body]);
  const fontSizePx = TEXT_SIZES_PX[textSizeIndex];
  const shapeSemitones = semitones - capo;

  // Sugerencia de cejilla: se calcula con los acordes que suenan (ya transpuestos).
  const suggestedCapo = useMemo(() => {
    const sounding = lines.flatMap((l) =>
      parseSongLine(l).chords.map((c) => displayChord(c.chord, semitones, "en", song.originalKey))
    );
    return suggestCapo(sounding);
  }, [lines, semitones, song.originalKey]);
  const shapeKey = displayChord(song.originalKey, shapeSemitones, notation, song.originalKey);
  const capoText = buildCapoSummary(capo, shapeKey);
  const bpm = song.bpm ?? null;
  const notes = song.notes?.trim() || null;

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
    addRecentSong({ id: song.id, title: song.title, artist: song.artist });
  }, [song.id, song.title, song.artist]);

  // Que el celular no se apague en pleno culto (se vuelve a pedir al volver a la pestaña).
  useEffect(() => keepScreenAwake(setWakeActive), []);

  // El desfile automático solo existe en vertical: en columnas queda apagado.
  const autoScrollActive = autoScroll && !isWide;

  useEffect(() => {
    if (!autoScrollActive) return;
    const el = scrollRef.current;
    if (!el) return;
    const speed = AUTOSCROLL_SPEEDS_PX_PER_SEC[speedIndex];
    let pending = 0;
    let last = performance.now();
    let raf = 0;
    // Con requestAnimationFrame y la fracción de píxel acumulada, las velocidades lentas
    // (menos de 1px por cuadro) también avanzan parejo.
    const tick = (now: number) => {
      const step = autoscrollStep(pending, speed, now - last);
      pending = step.pending;
      last = now;
      if (step.move > 0) {
        el.scrollTop += step.move;
        // Llegó al final de la canción: se apaga solo.
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
          setAutoScroll(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoScrollActive, speedIndex]);

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

  // Ir a otra canción del power, ignorando un segundo toque pegado al primero.
  function go(newIndex: number, forward = false) {
    if (!setIds) return;
    const now = Date.now();
    if (now - lastNavRef.current < NAV_COOLDOWN_MS) return;
    lastNavRef.current = now;
    goTo(router, setIds, powerSemitones, newIndex, setDividers, forward);
  }

  // Deslizar para pasar de canción dentro de un power (solo en vertical: en
  // modo columnas el deslizar horizontal ya se usa para recorrer el texto).
  // Un scroll en diagonal, un gesto lento, un pellizco de zoom o deslizar con la
  // pantalla ampliada no cuentan (ver swipeDirection).
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || isWide || !setIds || index === undefined) return;

    const currentIndex = index;
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let maxTouches = 0;
    let tracking = false;

    function onStart(e: TouchEvent) {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        startTime = Date.now();
        maxTouches = 1;
        tracking = true;
      } else {
        // Un segundo dedo (pellizco para hacer zoom): no es un deslizar.
        maxTouches = Math.max(maxTouches, e.touches.length);
      }
    }
    function onEnd(e: TouchEvent) {
      if (!tracking || e.touches.length > 0) return;
      tracking = false;
      const t = e.changedTouches[0];
      const direction = swipeDirection({
        dx: t.clientX - startX,
        dy: t.clientY - startY,
        durationMs: Date.now() - startTime,
        maxTouches,
        pageScale: window.visualViewport?.scale ?? 1,
      });
      if (direction === "next") goRef.current(currentIndex + 1, true);
      else if (direction === "prev") goRef.current(currentIndex - 1);
    }
    function onCancel() {
      tracking = false;
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
    };
  }, [isWide, setIds, index]);

  return (
    <div className="flex h-[100dvh] flex-col">
      <div className="px-5 pb-2 pt-6 animate-fade-in">
        <span className="text-xs uppercase tracking-[0.3em] text-lilac-light">
          {currentSection ? `${currentSection} · ` : ""}
          {song.artist}
        </span>
        <h1 className="font-display text-2xl text-mist">{song.title}</h1>
        <p className="mt-1 text-xs text-lilac-light">
          Tono: {displayChord(song.originalKey, semitones, notation, song.originalKey)}
          {bpm ? ` · ${bpm} BPM` : ""}
          {song.category ? ` · ${song.category}` : ""}
          {diagramMode ? " · Tocá un acorde para ver el diagrama" : ""}
        </p>
        {capo > 0 && <p className="mt-0.5 text-xs font-medium text-chord-gold">{capoText}</p>}
        {notes && (
          <details className="mt-1 text-xs">
            <summary className="cursor-pointer select-none text-lilac-light">Notas de la canción</summary>
            <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-mist/90">{notes}</p>
          </details>
        )}
      </div>

      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 px-5 pb-32 font-mono ${
          isWide ? "overflow-x-auto overflow-y-hidden" : "overflow-y-auto overflow-x-hidden"
        }`}
        style={{
          fontSize: `${fontSizePx}px`,
          // Se puede hacer zoom con los dedos, pero el navegador solo se encarga del scroll
          // vertical: el deslizar horizontal (siguiente/anterior) lo maneja el visor.
          touchAction: isWide ? "pan-x pan-y pinch-zoom" : "pan-y pinch-zoom",
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
            semitones={shapeSemitones}
            notation={notation}
            originalKey={song.originalKey}
            interactive={diagramMode}
            maxCharsPerRow={maxCharsPerRow}
          />
        ))}
      </div>

      <FabMenu
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((v) => !v)}
        autoScroll={autoScrollActive}
        onToggleAutoScroll={() => setAutoScroll((v) => !v)}
        autoScrollSpeedIndex={speedIndex}
        autoScrollSpeedCount={AUTOSCROLL_SPEEDS_PX_PER_SEC.length}
        onChangeAutoScrollSpeedIndex={setSpeedIndex}
        diagramMode={diagramMode}
        onToggleDiagramMode={() => setDiagramMode((v) => !v)}
        semitones={semitones}
        onChangeSemitones={setSemitones}
        keyLabel={displayChord(song.originalKey, semitones, notation, song.originalKey)}
        capo={capo}
        onChangeCapo={setCapo}
        capoSummary={capoText}
        suggestedCapo={suggestedCapo}
        notation={notation}
        onToggleNotation={() => setNotation((n) => (n === "en" ? "latin" : "en"))}
        textSizeIndex={textSizeIndex}
        textSizeCount={TEXT_SIZES_PX.length}
        fontSizePx={fontSizePx}
        onChangeTextSizeIndex={setTextSizeIndex}
        showAutoScroll={!isWide}
        wakeState={wakeActive ? "on" : "off"}
      />

      {sectionIntro.length > 0 && !introDismissed && (
        <button
          type="button"
          onClick={() => setIntroDismissed(true)}
          aria-label={`${sectionIntro.join(", ")}. Tocá para empezar`}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-plum-deep px-6 text-center"
        >
          {sectionIntro.map((name) => (
            <span key={name} className="font-display text-4xl font-bold tracking-[0.2em] text-mist">
              {name}
            </span>
          ))}
          <span className="h-1 w-16 rounded-full bg-accent" />
          <span className="text-sm text-lilac-light">
            {song.title} · tocá para empezar
          </span>
        </button>
      )}

      {activeChord && (
        <ChordDiagramPopover chord={activeChord} onClose={() => setActiveChord(null)} />
      )}

      {setIds && setIds.length > 0 && index !== undefined && (
        <div
          role="group"
          aria-label="Canciones del power"
          className="fixed bottom-24 left-4 z-40 flex items-center gap-2"
        >
          <button
            type="button"
            onClick={() => go(index - 1)}
            disabled={index <= 0}
            aria-label="Canción anterior del power"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-night/90 text-mist shadow-lg disabled:opacity-30"
          >
            <ChevronLeft size={20} aria-hidden />
          </button>
          <span
            aria-label={`Canción ${index + 1} de ${setIds.length}`}
            className="rounded-full bg-night/90 px-3 py-1.5 text-xs text-lilac-light shadow-lg"
          >
            {index + 1}/{setIds.length}
          </span>
          <button
            type="button"
            onClick={() => go(index + 1, true)}
            disabled={index >= setIds.length - 1}
            aria-label="Canción siguiente del power"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-night/90 text-mist shadow-lg disabled:opacity-30"
          >
            <ChevronRight size={20} aria-hidden />
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
  newIndex: number,
  setDividers: SetlistDivider[] = [],
  forward = false
) {
  // Mismo armado de URL que la página del power (así coincide con lo guardado para uso sin conexión).
  // Solo al avanzar se muestra la pantalla de la sección; al volver, no.
  const href = songHref({ ids: setIds, semitones: setSemitones, dividers: setDividers }, newIndex, forward);
  if (href) router.push(href);
}
