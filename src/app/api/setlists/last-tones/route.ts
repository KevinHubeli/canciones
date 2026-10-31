import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { isUuid } from "@/lib/validation";
import { getLastTones } from "@/lib/setlists";

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const exclude = request.nextUrl.searchParams.get("exclude");
  try {
    const tones = await getLastTones(isUuid(exclude) ? exclude : undefined);
    return NextResponse.json({ tones });
  } catch (err) {
    console.error("GET /api/setlists/last-tones failed:", err);
    return NextResponse.json({ error: "No pudimos cargar los tonos." }, { status: 500 });
  }
}
