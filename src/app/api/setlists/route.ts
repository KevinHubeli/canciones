import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { createSetlist, listSetlists } from "@/lib/setlists";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const setlists = await listSetlists();
    return NextResponse.json({ setlists });
  } catch (err) {
    console.error("GET /api/setlists failed:", err);
    return NextResponse.json({ error: "No pudimos cargar los powers." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  let body: { title?: unknown; songIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "Falta el nombre del power." }, { status: 400 });
  }
  const songIds = Array.isArray(body.songIds)
    ? body.songIds.filter((id): id is string => typeof id === "string")
    : [];

  try {
    const setlist = await createSetlist({ title: body.title.trim(), songIds });
    return NextResponse.json({ setlist });
  } catch (err) {
    console.error("POST /api/setlists failed:", err);
    return NextResponse.json({ error: "No se pudo guardar el power." }, { status: 500 });
  }
}
