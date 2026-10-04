import { NextResponse } from "next/server";
import PptxGenJS from "pptxgenjs";
import { getSetlist } from "@/lib/setlists";
import { getSong } from "@/lib/songs";
import { mergeEntries } from "@/lib/dividers";
import {
  COL_GAP_IN,
  COL_HEIGHT_IN,
  COL_TOP_IN,
  COL_WIDTH_IN,
  CHORD_COLOR,
  MARGIN_X_IN,
  SLIDE_HEIGHT_IN,
  SLIDE_WIDTH_IN,
  paginateSong,
  type Run,
} from "@/lib/pptx-layout";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Igual que ver el power: público por link, sin necesitar la clave de admin.
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "No encontramos ese power." }, { status: 404 });
  }

  const setlist = await getSetlist(id);
  if (!setlist) {
    return NextResponse.json({ error: "No encontramos ese power." }, { status: 404 });
  }

  const songs = await Promise.all(setlist.songs.map((s) => getSong(s.id)));

  type SlideData =
    | { kind: "divider"; name: string }
    | SongSlideData;
  type SongSlideData = {
    kind: "song";
    title: string;
    columns: Run[][];
    index: number;
    count: number;
    fontSize: number;
  };
  const slidesData: SlideData[] = [];

  // Cada divisor es una diapositiva propia, en el lugar donde quedó entre canciones.
  const entries = mergeEntries(
    setlist.songs.map((s, i) => ({ semitones: s.semitones, song: songs[i] })),
    setlist.dividers
  );
  for (const entry of entries) {
    if (entry.kind === "divider") {
      slidesData.push({ kind: "divider", name: entry.name });
      continue;
    }
    const { song, semitones } = entry.song;
    if (!song) continue;
    const { fontSize, pages } = paginateSong(song.body, semitones);
    for (const page of pages) {
      slidesData.push({ kind: "song", title: song.title, fontSize, ...page });
    }
  }

  if (!slidesData.some((d) => d.kind === "song")) {
    return NextResponse.json({ error: "El power no tiene canciones." }, { status: 400 });
  }

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: SLIDE_WIDTH_IN, height: SLIDE_HEIGHT_IN });
  pptx.layout = "WIDE";

  for (const d of slidesData) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    if (d.kind === "divider") {
      slide.addText(d.name, {
        x: 0,
        y: SLIDE_HEIGHT_IN / 2 - 0.9,
        w: SLIDE_WIDTH_IN,
        h: 1.4,
        fontSize: 66,
        bold: true,
        color: "111111",
        align: "center",
        valign: "middle",
        fontFace: "Arial",
        charSpacing: 6,
      });
      slide.addShape(pptx.ShapeType.rect, {
        x: SLIDE_WIDTH_IN / 2 - 1.2,
        y: SLIDE_HEIGHT_IN / 2 + 0.7,
        w: 2.4,
        h: 0.06,
        fill: { color: CHORD_COLOR },
        line: { color: CHORD_COLOR, width: 0 },
      });
      continue;
    }
    slide.addText(d.title.toUpperCase(), {
      x: MARGIN_X_IN,
      y: 0.25,
      w: SLIDE_WIDTH_IN - MARGIN_X_IN * 2 - 1,
      h: 0.5,
      fontSize: 18,
      color: "111111",
      bold: true,
      fontFace: "Arial",
    });
    if (d.count > 1) {
      slide.addText(`${d.index + 1}/${d.count}`, {
        x: SLIDE_WIDTH_IN - MARGIN_X_IN - 1,
        y: 0.25,
        w: 1,
        h: 0.5,
        fontSize: 14,
        color: "8C8680",
        align: "right",
        fontFace: "Arial",
      });
    }
    d.columns.forEach((colRuns, colIdx) => {
      if (colRuns.length === 0) return;
      slide.addText(colRuns, {
        x: MARGIN_X_IN + colIdx * (COL_WIDTH_IN + COL_GAP_IN),
        y: COL_TOP_IN,
        w: COL_WIDTH_IN,
        h: COL_HEIGHT_IN,
        fontSize: d.fontSize,
        fontFace: "Courier New",
        align: "left",
        valign: "top",
        lineSpacingMultiple: 1.0,
      });
    });
  }

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  const filename = `${setlist.title.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "power"}.pptx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
