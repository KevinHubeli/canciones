import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { createSongsBulk } from "@/lib/songs";
import { HolyricsParseError, parseHolyricsExport } from "@/lib/importers/holyrics";

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: { json?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (typeof body.json !== "string" || !body.json.trim()) {
    return NextResponse.json({ error: "Falta el contenido a importar." }, { status: 400 });
  }

  try {
    const { songs, skipped } = parseHolyricsExport(body.json);
    if (songs.length === 0) {
      return NextResponse.json(
        { error: "No encontramos canciones con letra para importar en ese archivo." },
        { status: 400 }
      );
    }
    const inserted = await createSongsBulk(songs);
    return NextResponse.json({ inserted, skipped });
  } catch (err) {
    if (err instanceof HolyricsParseError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("POST /api/songs/import-holyrics failed:", err);
    return NextResponse.json(
      { error: "No pudimos importar el archivo." },
      { status: 500 }
    );
  }
}
