import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";
import { getSessionUsername } from "@/lib/session";

export type AuditAction = "create" | "update" | "delete" | "duplicate" | "chords";
export type AuditEntity = "song" | "setlist" | "user";

export type AuditEntry = {
  id: string;
  at: string;
  username: string;
  action: AuditAction;
  entity: AuditEntity;
  entityTitle: string;
};

/**
 * Anota un cambio hecho por la persona que tiene la sesión abierta. Nunca
 * rompe el pedido: si no se puede anotar, se avisa en el log del servidor y
 * el cambio igual queda hecho.
 */
export async function logAudit(entry: {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  title: string;
}): Promise<void> {
  try {
    const username = (await getSessionUsername()) ?? "desconocido";
    await getDb().insert(auditLog).values({
      username,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      entityTitle: entry.title,
    });
  } catch (err) {
    console.error("No se pudo anotar en el historial:", err);
  }
}

export async function listAudit(limit: number): Promise<AuditEntry[]> {
  const rows = await getDb().select().from(auditLog).orderBy(desc(auditLog.at)).limit(limit);
  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    username: r.username,
    action: r.action as AuditAction,
    entity: r.entity as AuditEntity,
    entityTitle: r.entityTitle,
  }));
}
