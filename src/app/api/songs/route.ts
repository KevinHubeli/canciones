import { NextRequest, NextResponse } from "next/server";
import { createSong, findSongWithSameTitle, listSongs } from "@/lib/songs";
import { requireAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { normalizePlainChords } from "@/lib/chords";
import { SONG_TAGS, NO_CHORDS_FILTER } from "@/lib/tags";
import { parseBpm, parseIntParam, parseNotes } from "@/lib/validation";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 500;
const ALL_FILTERS: string[] = [...SONG_TAGS, NO_CHORDS_FILTER];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim() || undefined;
  const tags = params
    .getAll("tag")
    .map((t) => t.trim())
    .filter((t) => ALL_FILTERS.includes(t));
  // Postgres rechaza decimales (y Infinity) como limit/offset: se sanean acá.
  const limit = parseIntParam(params.get("limit"), { fallback: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT });
  const offset = parseIntParam(params.get("offset"), { fallback: 0, min: 0, max: 1_000_000 });

  try {
    const result = await listSongs({ q, tags, limit, offset });
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
    tags?: unknown;
    body?: unknown;
    bpm?: unknown;
    notes?: unknown;
    force?: unknown;
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
  const bpm = parseBpm(body.bpm);
  if (!bpm.ok) return NextResponse.json({ error: bpm.error }, { status: 400 });
  const notes = parseNotes(body.notes);
  if (!notes.ok) return NextResponse.json({ error: notes.error }, { status: 400 });

  try {
    // Evita cargar dos veces la misma canción; con force: true se guarda igual.
    if (body.force !== true) {
      const existing = await findSongWithSameTitle(body.title);
      if (existing) {
        return NextResponse.json(
          { error: `Ya hay una canción con el título "${existing.title}".`, duplicateOf: existing },
          { status: 409 }
        );
      }
    }
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
      tags: Array.isArray(body.tags)
        ? body.tags.filter(
            (t): t is string => typeof t === "string" && (SONG_TAGS as readonly string[]).includes(t)
          )
        : [],
      body: normalizePlainChords(body.body),
      bpm: bpm.value,
      notes: notes.value,
    });
    await logAudit({ action: "create", entity: "song", entityId: song.id, title: song.title });
    return NextResponse.json({ song });
  } catch (err) {
    console.error("POST /api/songs failed:", err);
    return NextResponse.json(
      { error: "No se pudo guardar la canción." },
      { status: 500 }
    );
  }
}
