import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { isOwner } from "@/lib/session";
import {
  BACKUP_MAX_CHARS,
  backupFileName,
  exportBackup,
  parseBackup,
  restoreBackup,
} from "@/lib/backup";

// Solo el dueño descarga o restaura respaldos.
export async function GET() {
  if (!(await isOwner())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    const data = await exportBackup();
    await logAudit({
      action: "backup",
      entity: "song",
      title: `Respaldo descargado (${data.songs.length} canciones, ${data.setlists.length} powers)`,
    });
    return new NextResponse(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${backupFileName()}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("GET /api/admin/backup failed:", err);
    return NextResponse.json({ error: "No pudimos armar el respaldo." }, { status: 500 });
  }
}

/** Restaura un respaldo en modo "fusionar": agrega o pisa por id, nunca borra lo que ya hay. */
export async function POST(request: NextRequest) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (text.length > BACKUP_MAX_CHARS) {
    return NextResponse.json({ error: "El archivo es demasiado grande." }, { status: 413 });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "El archivo no es un JSON válido." }, { status: 400 });
  }
  const parsed = parseBackup(json);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const counts = await restoreBackup(parsed.value);
    await logAudit({
      action: "backup",
      entity: "song",
      title: `Respaldo restaurado (${counts.songs} canciones, ${counts.setlists} powers)`,
    });
    return NextResponse.json(counts);
  } catch (err) {
    console.error("POST /api/admin/backup failed:", err);
    return NextResponse.json({ error: "No se pudo restaurar el respaldo." }, { status: 500 });
  }
}
