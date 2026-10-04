import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { getSetlist } from "@/lib/setlists";
import { buildSlides, type Slide } from "@/lib/pptx-slides";
import {
  CHORD_COLOR,
  COL_GAP_IN,
  COL_HEIGHT_IN,
  COL_TOP_IN,
  COL_WIDTH_IN,
  MARGIN_X_IN,
  SLIDE_HEIGHT_IN,
  SLIDE_WIDTH_IN,
} from "@/lib/pptx-layout";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Todo se dibuja en proporciones de la diapositiva (pulgadas y puntos del
// PowerPoint), así la vista previa escala igual en un celular y en una compu.
const pctX = (inches: number) => `${(inches / SLIDE_WIDTH_IN) * 100}%`;
const pctY = (inches: number) => `${(inches / SLIDE_HEIGHT_IN) * 100}%`;
const SLIDE_WIDTH_PT = SLIDE_WIDTH_IN * 72;
const cqw = (pt: number) => `${(pt / SLIDE_WIDTH_PT) * 100}cqw`;

function SlideView({ slide }: { slide: Slide }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border border-plum/60 bg-white shadow-lg"
      style={{ aspectRatio: `${SLIDE_WIDTH_IN} / ${SLIDE_HEIGHT_IN}`, containerType: "inline-size" }}
    >
      {slide.kind === "divider" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-bold text-[#111]"
            style={{ fontSize: cqw(66), letterSpacing: "0.09em", fontFamily: "Arial, sans-serif" }}
          >
            {slide.name}
          </span>
          <span
            style={{
              marginTop: cqw(18),
              width: pctX(2.4),
              height: cqw(4),
              background: `#${CHORD_COLOR}`,
            }}
          />
        </div>
      ) : (
        <>
          <span
            className="absolute font-bold text-[#111]"
            style={{
              left: pctX(MARGIN_X_IN),
              top: pctY(0.25),
              fontSize: cqw(18),
              fontFamily: "Arial, sans-serif",
              lineHeight: "1.2",
            }}
          >
            {slide.title.toUpperCase()}
          </span>
          {slide.count > 1 && (
            <span
              className="absolute text-right text-[#8C8680]"
              style={{
                right: pctX(MARGIN_X_IN),
                top: pctY(0.25),
                fontSize: cqw(14),
                fontFamily: "Arial, sans-serif",
                lineHeight: "1.2",
              }}
            >
              {slide.index + 1}/{slide.count}
            </span>
          )}
          {slide.columns.map((runs, colIdx) => (
            <div
              key={colIdx}
              className="absolute overflow-hidden"
              style={{
                left: pctX(MARGIN_X_IN + colIdx * (COL_WIDTH_IN + COL_GAP_IN)),
                top: pctY(COL_TOP_IN),
                width: pctX(COL_WIDTH_IN),
                height: pctY(COL_HEIGHT_IN),
                fontSize: cqw(slide.fontSize),
                fontFamily: '"Courier New", Courier, monospace',
                lineHeight: "1.2",
              }}
            >
              {runs.map((run, i) => (
                <div
                  key={i}
                  style={{
                    whiteSpace: "pre-wrap",
                    color: `#${run.options.color}`,
                    fontWeight: run.options.bold ? 700 : 400,
                    minHeight: "1.2em",
                  }}
                >
                  {run.text}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default async function PowerPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const setlist = await getSetlist(id).catch(() => null);
  if (!setlist) notFound();

  const slides = await buildSlides(setlist);
  const hasSongs = slides.some((s) => s.kind === "song");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col pt-12">
      <div className="mb-6 flex items-center justify-between gap-3 px-5">
        <div className="min-w-0">
          <Link
            href={`/powers/${setlist.id}`}
            className="mb-1 inline-flex items-center gap-1 text-xs uppercase tracking-[0.2em] text-lilac-light"
          >
            <ArrowLeft size={14} />
            Volver al power
          </Link>
          <h1 className="truncate font-display text-2xl text-mist">{setlist.title}</h1>
          <p className="text-sm text-lilac-light">
            Vista previa · {slides.length} {slides.length === 1 ? "diapositiva" : "diapositivas"}
          </p>
        </div>
        {hasSongs && (
          <a
            href={`/api/setlists/${setlist.id}/export-pptx`}
            className="flex shrink-0 items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-night"
          >
            <Download size={16} />
            Descargar
          </a>
        )}
      </div>

      {!hasSongs ? (
        <p className="px-5 text-sm text-lilac-light">Este power no tiene canciones todavía.</p>
      ) : (
        <>
          <p className="mb-4 px-5 text-xs text-lilac-light">
            Así se arma el PowerPoint. El corte de líneas puede variar levemente según el
            programa con el que lo abras.
          </p>
          <ol className="flex flex-col gap-5 px-5 pb-10">
            {slides.map((slide, i) => (
              <li key={i}>
                <span className="mb-1 block text-xs text-lilac-light">
                  {i + 1} de {slides.length}
                </span>
                <SlideView slide={slide} />
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
