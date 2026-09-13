import { NextRequest, NextResponse } from "next/server";
import { deleteSong, getSong, updateSong } from "@/lib/songs";
import { requireAdmin } from "@/lib/session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "No encontramos esa canción." }, { status: 404 });
  }
  try {
    const song = await getSong(id);
    if (!song) {
      return NextResponse.json({ error: "No encontramos esa canción." }, { status: 404 });
    }
    return NextResponse.json({ song });
  } catch (err) {
    console.error("GET /api/songs/[id] failed:", err);
    return NextResponse.json({ error: "No pudimos cargar la canción." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "No encontramos esa canción." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const update: Partial<{
    title: string;
    artist: string;
    originalKey: string;
    category: string | null;
    body: string;
  }> = {};
  if (typeof body.title === "string" && body.title.trim()) update.title = body.title.trim();
  if (typeof body.artist === "string") update.artist = body.artist.trim();
  if (typeof body.originalKey === "string" && body.originalKey.trim())
    update.originalKey = body.originalKey.trim();
  if (typeof body.category === "string") update.category = body.category.trim() || null;
  if (typeof body.body === "string" && body.body.trim()) update.body = body.body;

  try {
    const song = await updateSong(id, update);
    if (!song) {
      return NextResponse.json({ error: "No encontramos esa canción." }, { status: 404 });
    }
    return NextResponse.json({ song });
  } catch (err) {
    console.error("PATCH /api/songs/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo guardar la canción." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "No encontramos esa canción." }, { status: 404 });
  }

  try {
    const deleted = await deleteSong(id);
    if (!deleted) {
      return NextResponse.json({ error: "No encontramos esa canción." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/songs/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo eliminar la canción." }, { status: 500 });
  }
}
