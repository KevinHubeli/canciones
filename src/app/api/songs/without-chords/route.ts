import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { listSongsWithoutChords } from "@/lib/songs";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const songs = await listSongsWithoutChords();
    return NextResponse.json({ songs });
  } catch (err) {
    console.error("GET /api/songs/without-chords failed:", err);
    return NextResponse.json({ error: "No pudimos cargar la lista." }, { status: 500 });
  }
}
