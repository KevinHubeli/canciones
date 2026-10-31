import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getStats, parseStaleDays } from "@/lib/stats";

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const staleDays = parseStaleDays(request.nextUrl.searchParams.get("days"));
    return NextResponse.json({ stats: await getStats(staleDays) });
  } catch (err) {
    console.error("GET /api/admin/stats failed:", err);
    return NextResponse.json({ error: "No pudimos calcular las estadísticas." }, { status: 500 });
  }
}
