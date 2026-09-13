import { NextRequest, NextResponse } from "next/server";
import { createSong, listSongs } from "@/lib/songs";
import { requireAdmin } from "@/lib/session";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim() || undefined;
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(params.get("limit")) || DEFAULT_LIMIT)
  );
  const offset = Math.max(0, Number(params.get("offset")) || 0);

  try {
    const result = await listSongs({ q, limit, offset });
    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/songs failed:", err);
    return NextResponse.json(
      { error: "No se pudieron cargar las canciones." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: {
    title?: unknown;
    artist?: unknown;
    originalKey?: unknown;
    category?: unknown;
    body?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "Falta el título." }, { status: 400 });
  }
  if (typeof body.body !== "string" || !body.body.trim()) {
    return NextResponse.json({ error: "Falta la letra." }, { status: 400 });
  }

  try {
    const song = await createSong({
      title: body.title.trim(),
      artist: typeof body.artist === "string" ? body.artist.trim() : "",
      originalKey:
        typeof body.originalKey === "string" && body.originalKey.trim()
          ? body.originalKey.trim()
          : "C",
      category:
        typeof body.category === "string" && body.category.trim()
          ? body.category.trim()
          : null,
      body: body.body,
    });
    return NextResponse.json({ song });
  } catch (err) {
    console.error("POST /api/songs failed:", err);
    return NextResponse.json(
      { error: "No se pudo guardar la canción." },
      { status: 500 }
    );
  }
}
