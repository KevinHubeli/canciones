import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { findDuplicateGroups } from "@/lib/songs";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    return NextResponse.json({ groups: await findDuplicateGroups() });
  } catch (err) {
    console.error("GET /api/songs/duplicates failed:", err);
    return NextResponse.json({ error: "No pudimos buscar duplicadas." }, { status: 500 });
  }
}
