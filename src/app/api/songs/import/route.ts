import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { importFromUrl } from "@/lib/importers";
import { ImportError, NetworkImportError } from "@/lib/importers/shared";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (typeof body.url !== "string" || !body.url.trim()) {
    return NextResponse.json({ error: "Falta la URL a importar." }, { status: 400 });
  }
  if (body.url.length > 500) {
    return NextResponse.json({ error: "Esa URL no es válida." }, { status: 400 });
  }

  try {
    const song = await importFromUrl(body.url);
    return NextResponse.json(song);
  } catch (err) {
    // No pudimos conectarnos (red, timeout, error del sitio): se puede reintentar.
    if (err instanceof NetworkImportError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    if (err instanceof ImportError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("POST /api/songs/import failed:", err);
    return NextResponse.json(
      { error: "No pudimos leer esa página. Cargala manualmente." },
      { status: 400 }
    );
  }
}
