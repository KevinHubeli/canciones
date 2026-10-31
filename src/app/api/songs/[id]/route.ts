import { NextRequest, NextResponse } from "next/server";
import { deleteSong, findSongWithSameTitle, getSong, updateSong } from "@/lib/songs";
import { requireAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { normalizePlainChords } from "@/lib/chords";
import { SONG_TAGS } from "@/lib/tags";
import { normalizeTitle } from "@/lib/text";
import { saveVersion } from "@/lib/versions";
import { isUuid, parseBpm, parseNotes } from "@/lib/validation";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) {
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
  if (!isUuid(id)) {
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
    tags: string[];
    body: string;
    bpm: number | null;
    notes: string | null;
  }> = {};
  if (typeof body.title === "string" && body.title.trim()) update.title = body.title.trim();
  if (typeof body.artist === "string") update.artist = body.artist.trim();
  if (typeof body.originalKey === "string" && body.originalKey.trim())
    update.originalKey = body.originalKey.trim();
  if (typeof body.category === "string") update.category = body.category.trim() || null;
  if (Array.isArray(body.tags)) {
    update.tags = body.tags.filter(
      (t): t is string => typeof t === "string" && (SONG_TAGS as readonly string[]).includes(t)
    );
  }
  if (typeof body.body === "string" && body.body.trim()) update.body = normalizePlainChords(body.body);

  if (body.bpm !== undefined) {
    const bpm = parseBpm(body.bpm);
    if (!bpm.ok) return NextResponse.json({ error: bpm.error }, { status: 400 });
    update.bpm = bpm.value;
  }
  if (body.notes !== undefined) {
    const notes = parseNotes(body.notes);
    if (!notes.ok) return NextResponse.json({ error: notes.error }, { status: 400 });
    update.notes = notes.value;
  }

  try {
    const previous = await getSong(id);
    if (!previous) {
      return NextResponse.json({ error: "No encontramos esa canción." }, { status: 404 });
    }

    // Igual que al crear: si el título nuevo ya lo tiene OTRA canción, se avisa
    // (con force: true se guarda igual).
    if (
      update.title !== undefined &&
      body.force !== true &&
      normalizeTitle(update.title) !== normalizeTitle(previous.title)
    ) {
      const existing = await findSongWithSameTitle(update.title, id);
      if (existing) {
        return NextResponse.json(
          { error: `Ya hay una canción con el título "${existing.title}".`, duplicateOf: existing },
          { status: 409 }
        );
      }
    }

    const song = await updateSong(id, update);
    if (!song) {
      return NextResponse.json({ error: "No encontramos esa canción." }, { status: 404 });
    }
    // Historial: se guarda cómo estaba antes, solo si cambió algo del contenido.
    const contentChanged =
      song.title !== previous.title ||
      song.artist !== previous.artist ||
      song.originalKey !== previous.originalKey ||
      song.body !== previous.body;
    if (contentChanged) await saveVersion(previous, "update");
    await logAudit({ action: "update", entity: "song", entityId: song.id, title: song.title });
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
  if (!isUuid(id)) {
    return NextResponse.json({ error: "No encontramos esa canción." }, { status: 404 });
  }

  try {
    const existing = await getSong(id);
    const deleted = await deleteSong(id);
    if (!deleted) {
      return NextResponse.json({ error: "No encontramos esa canción." }, { status: 404 });
    }
    // Va a la papelera; además se guarda su último estado en el historial.
    if (existing) await saveVersion(existing, "delete");
    await logAudit({ action: "delete", entity: "song", entityId: id, title: existing?.title ?? "(sin título)" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/songs/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo eliminar la canción." }, { status: 500 });
  }
}
