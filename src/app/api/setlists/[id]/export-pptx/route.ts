import { NextResponse } from "next/server";
import PptxGenJS from "pptxgenjs";
import { requireAdmin } from "@/lib/session";
import { getSetlist } from "@/lib/setlists";
import { getSong } from "@/lib/songs";
import { parseSongLine } from "@/lib/chords";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Letra sola (sin [Acordes]), para proyectar. */
function lyricsOnly(body: string): string {
  return body
    .split("\n")
    .map((line) => parseSongLine(line).lyrics)
    .join("\n")
    .trim();
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
    const lyrics = lyricsOnly(song.body);
    const lineCount = lyrics.split("\n").length;
    // Letra más larga -> fuente más chica, para que entre en la diapositiva.
    const fontSize = lineCount > 22 ? 20 : lineCount > 14 ? 26 : 32;

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
    slide.addText(lyrics, {
      x: 0.5,
      y: 1.1,
      w: 12.3,
      h: 6,
      fontSize,
      color: "F2F2F0",
      fontFace: "Arial",
      align: "center",
      valign: "middle",
      lineSpacingMultiple: 1.15,
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
