import { NextResponse } from "next/server";
import PptxGenJS from "pptxgenjs";
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
      let chordLine: string;
      if (!lyrics.trim()) {
        // Línea solo de acordes (ej. intro): sin letra abajo para alinear,
        // así que no hace falta conservar los espacios anchos del original.
        chordLine = chords.map((c) => c.chord).join(" ");
      } else {
        chordLine = "";
        for (const c of [...chords].sort((a, b) => a.index - b.index)) {
          const target = Math.max(c.index, chordLine.length + (chordLine.length > 0 ? 1 : 0));
          chordLine += " ".repeat(target - chordLine.length) + c.chord;
        }
      }
      runs.push({ text: chordLine, options: { color: "FF5A3C", breakLine: true, bold: true } });
    }
    runs.push({ text: lyrics || " ", options: { color: "F2F2F0", breakLine: true } });
  }
  return runs;
}

const BOX_WIDTH_IN = 12.3;
const BOX_HEIGHT_IN = 6;
const LINE_HEIGHT_FACTOR = 1.3; // alto de línea real (con interlineado) relativo al tamaño de fuente
const CHAR_WIDTH_FACTOR = 0.62; // ancho aproximado de un carácter en Courier New

/** Baja la fuente hasta que el texto (con el ancho que ocupa cada línea) entre en la caja. */
function fitFontSize(runs: Run[]): number {
  const boxWidthPt = BOX_WIDTH_IN * 72;
  const boxHeightPt = BOX_HEIGHT_IN * 72;

  for (let fontSize = 26; fontSize >= 9; fontSize--) {
    const charWidthPt = fontSize * CHAR_WIDTH_FACTOR;
    let totalLines = 0;
    for (const r of runs) {
      const lineWidthPt = r.text.length * charWidthPt;
      totalLines += Math.max(1, Math.ceil(lineWidthPt / boxWidthPt));
    }
    const neededHeightPt = totalLines * fontSize * LINE_HEIGHT_FACTOR;
    if (neededHeightPt <= boxHeightPt) return fontSize;
  }
  return 9;
}

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

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
  pptx.layout = "WIDE";

  let slideCount = 0;
  for (const song of songs) {
    if (!song) continue;
    slideCount++;
    const runs = buildRuns(song.body);
    // Se calcula el tamaño más grande que realmente entra en la caja
    // (contando el ancho de cada línea, no solo la cantidad de líneas).
    const fontSize = fitFontSize(runs);

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
      w: BOX_WIDTH_IN,
      h: BOX_HEIGHT_IN,
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
