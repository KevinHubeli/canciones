import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { listVersions } from "@/lib/versions";
import { isUuid } from "@/lib/validation";

export async function GET(
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
    return NextResponse.json({ versions: await listVersions(id) });
  } catch (err) {
    console.error("GET /api/songs/[id]/versions failed:", err);
    return NextResponse.json({ error: "No pudimos cargar el historial." }, { status: 500 });
  }
}
