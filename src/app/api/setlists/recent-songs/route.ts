import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getRecentlyUsedSongs } from "@/lib/setlists";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const songs = await getRecentlyUsedSongs();
    return NextResponse.json({ songs });
  } catch (err) {
    console.error("GET /api/setlists/recent-songs failed:", err);
    return NextResponse.json({ error: "No pudimos cargar el historial." }, { status: 500 });
  }
}
