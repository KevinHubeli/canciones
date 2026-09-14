import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { deleteSetlist, getSetlist, updateSetlist } from "@/lib/setlists";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Ver un power puntual es público (por link, sin listar): así cualquier
  // músico puede abrirlo en su celular sin necesitar la clave de admin.
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "No encontramos ese power." }, { status: 404 });
  }
  try {
    const setlist = await getSetlist(id);
    if (!setlist) {
      return NextResponse.json({ error: "No encontramos ese power." }, { status: 404 });
    }
    return NextResponse.json({ setlist });
  } catch (err) {
    console.error("GET /api/setlists/[id] failed:", err);
    return NextResponse.json({ error: "No pudimos cargar el power." }, { status: 500 });
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
    return NextResponse.json({ error: "No encontramos ese power." }, { status: 404 });
  }

  let body: { title?: unknown; songIds?: unknown; transpose?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const update: Partial<{ title: string; songIds: string[]; transpose: Record<string, number> }> = {};
  if (typeof body.title === "string" && body.title.trim()) update.title = body.title.trim();
  if (Array.isArray(body.songIds)) {
    update.songIds = body.songIds.filter((id): id is string => typeof id === "string");
  }
  if (body.transpose && typeof body.transpose === "object") {
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(body.transpose as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) out[key] = Math.round(value);
    }
    update.transpose = out;
  }

  try {
    const setlist = await updateSetlist(id, update);
    if (!setlist) {
      return NextResponse.json({ error: "No encontramos ese power." }, { status: 404 });
    }
    return NextResponse.json({ setlist });
  } catch (err) {
    console.error("PATCH /api/setlists/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo guardar el power." }, { status: 500 });
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
    return NextResponse.json({ error: "No encontramos ese power." }, { status: 404 });
  }
  try {
    const deleted = await deleteSetlist(id);
    if (!deleted) {
      return NextResponse.json({ error: "No encontramos ese power." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/setlists/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo eliminar el power." }, { status: 500 });
  }
}
