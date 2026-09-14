import { NextResponse } from "next/server";
import PptxGenJS from "pptxgenjs";
import { requireAdmin } from "@/lib/session";
import { getSetlist } from "@/lib/setlists";
import { getSong } from "@/lib/songs";
import { parseSongLine } from "@/lib/chords";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Run = { text: string; options: { color: string; breakLine: boolean; bold?: boolean } };

/**
 * Convierte el body ("[Am]Cantaré") en pares de líneas chord/letra, como en
 * las presentaciones originales: el acorde va en su propia línea, ubicado
 * (con espacios) en la columna donde se toca sobre la palabra de abajo.
 */
function buildRuns(body: string): Run[] {
  const runs: Run[] = [];
  for (const raw of body.split("\n")) {
    const { lyrics, chords } = parseSongLine(raw);
    if (chords.length > 0) {
      let chordLine = "";
      for (const c of [...chords].sort((a, b) => a.index - b.index)) {
        const target = Math.max(c.index, chordLine.length + (chordLine.length > 0 ? 1 : 0));
        chordLine += " ".repeat(target - chordLine.length) + c.chord;
      }
      runs.push({ text: chordLine, options: { color: "FF5A3C", breakLine: true, bold: true } });
    }
    runs.push({ text: lyrics || " ", options: { color: "F2F2F0", breakLine: true } });
  }
  return runs;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "No encontramos ese power." }, { status: 404 });
  }

  const setlist = await getSetlist(id);
  if (!setlist) {
    return NextResponse.json({ error: "No encontramos ese power." }, { status: 404 });
  }

  const songs = await Promise.all(setlist.songs.map((s) => getSong(s.id)));

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
  pptx.layout = "WIDE";

  let slideCount = 0;
  for (const song of songs) {
    if (!song) continue;
    slideCount++;
    const runs = buildRuns(song.body);
    // Letra más larga -> fuente más chica, para que entre en la diapositiva.
    const fontSize =
      runs.length > 46 ? 12 : runs.length > 34 ? 15 : runs.length > 24 ? 18 : runs.length > 14 ? 22 : 26;

    const slide = pptx.addSlide();
    slide.background = { color: "0A0A0B" };
    slide.addText(song.title.toUpperCase(), {
      x: 0.5,
      y: 0.3,
      w: 12.3,
      h: 0.7,
      fontSize: 24,
      color: "FF5A3C",
      bold: true,
      fontFace: "Arial",
    });
    slide.addText(runs, {
      x: 0.5,
      y: 1.1,
      w: 12.3,
      h: 6,
      fontSize,
      fontFace: "Courier New",
      align: "left",
      valign: "top",
      lineSpacingMultiple: 1.05,
    });
  }

  if (slideCount === 0) {
    return NextResponse.json({ error: "El power no tiene canciones." }, { status: 400 });
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
