import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { importFromCifraClub } from "@/lib/importers/cifraclub";
import { importFromLaCuerda } from "@/lib/importers/lacuerda";
import { ImportError } from "@/lib/importers/shared";

// Coincidencia estricta: "lacuerda.net.evil.com" o "evil.com/lacuerda.net" no pasan.
function isHostOf(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

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

  let host: string;
  try {
    host = new URL(body.url).hostname;
  } catch {
    return NextResponse.json({ error: "Esa URL no es válida." }, { status: 400 });
  }

  try {
    if (isHostOf(host, "cifraclub.com") || isHostOf(host, "cifraclub.com.br")) {
      const song = await importFromCifraClub(body.url);
      return NextResponse.json(song);
    }
    if (isHostOf(host, "lacuerda.net")) {
      const song = await importFromLaCuerda(body.url);
      return NextResponse.json(song);
    }
    return NextResponse.json(
      { error: "Solo se puede importar desde Cifra Club o LaCuerda." },
      { status: 400 }
    );
  } catch (err) {
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
