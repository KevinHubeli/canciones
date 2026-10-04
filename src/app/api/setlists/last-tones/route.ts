import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getLastTones } from "@/lib/setlists";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const exclude = request.nextUrl.searchParams.get("exclude");
  try {
    const tones = await getLastTones(exclude && UUID_RE.test(exclude) ? exclude : undefined);
    return NextResponse.json({ tones });
  } catch (err) {
    console.error("GET /api/setlists/last-tones failed:", err);
    return NextResponse.json({ error: "No pudimos cargar los tonos." }, { status: 500 });
  }
}
