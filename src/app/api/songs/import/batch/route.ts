import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { importFromUrl } from "@/lib/importers";
import { ImportError, type ImportedSong } from "@/lib/importers/shared";
import { findSongWithSameTitle } from "@/lib/songs";

export const maxDuration = 60;

const MAX_URLS = 10;
const PAUSE_MS = 300;

type BatchResult = {
  url: string;
  ok: boolean;
  song?: ImportedSong;
  /** Ya hay una canción con ese título: el cliente decide si la carga igual. */
  duplicateOf?: { id: string; title: string };
  error?: string;
};

/**
 * Importa varias URLs (máx. 10) una detrás de otra, con la misma validación
 * que /api/songs/import. No guarda nada: devuelve las canciones leídas para
 * que el cliente las cargue (y avise de duplicados).
 */
export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: { urls?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (!Array.isArray(body.urls) || body.urls.length === 0) {
    return NextResponse.json({ error: "Faltan las URLs a importar." }, { status: 400 });
  }
  if (body.urls.length > MAX_URLS) {
    return NextResponse.json(
      { error: `Se pueden importar hasta ${MAX_URLS} URLs por vez.` },
      { status: 400 }
    );
  }
  if (body.urls.some((u) => typeof u !== "string" || u.length > 500)) {
    return NextResponse.json({ error: "Alguna URL no es válida." }, { status: 400 });
  }

  const urls = (body.urls as string[]).map((u) => u.trim()).filter(Boolean);
  const results: BatchResult[] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (urls.indexOf(url) !== i) {
      results.push({ url, ok: false, error: "Esa URL está repetida." });
      continue;
    }
    try {
      const song = await importFromUrl(url);
      let duplicateOf: { id: string; title: string } | undefined;
      try {
        duplicateOf = (await findSongWithSameTitle(song.title)) ?? undefined;
      } catch {
        // El aviso de duplicados es un extra: si falla igual se devuelve la canción.
      }
      results.push({ url, ok: true, song, duplicateOf });
    } catch (err) {
      if (!(err instanceof ImportError)) console.error("POST /api/songs/import/batch failed:", err);
      results.push({
        url,
        ok: false,
        error: err instanceof ImportError ? err.message : "No pudimos leer esa página.",
      });
    }
    // Pausa chica entre pedidos para no saturar a los sitios.
    if (i < urls.length - 1) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }

  return NextResponse.json({ results });
}
