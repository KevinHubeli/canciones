import { NextResponse } from "next/server";
import PptxGenJS from "pptxgenjs";
import { getSetlist } from "@/lib/setlists";
import { getSong } from "@/lib/songs";
import {
  COL_GAP_IN,
  COL_HEIGHT_IN,
  COL_TOP_IN,
  COL_WIDTH_IN,
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

  type SlideData = {
    title: string;
    columns: Run[][];
    index: number;
    count: number;
    fontSize: number;
  };
  const slidesData: SlideData[] = [];

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    if (!song) continue;
    const semitones = setlist.songs[i]?.semitones ?? 0;
    const { fontSize, pages } = paginateSong(song.body, semitones);
    for (const page of pages) {
      slidesData.push({ title: song.title, fontSize, ...page });
    }
  }

  if (slidesData.length === 0) {
    return NextResponse.json({ error: "El power no tiene canciones." }, { status: 400 });
  }

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: SLIDE_WIDTH_IN, height: SLIDE_HEIGHT_IN });
  pptx.layout = "WIDE";

  for (const d of slidesData) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
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
