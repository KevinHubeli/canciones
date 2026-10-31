import { date, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const songs = pgTable(
  "songs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    originalKey: text("original_key").notNull(),
    category: text("category"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    body: text("body").notNull(),
    // Tempo (pulsos por minuto) y notas libres para el equipo ("entra en el 2º verso").
    bpm: integer("bpm"),
    notes: text("notes"),
    // Papelera: una canción borrada queda acá hasta que se la restaura o se vacía la papelera.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("songs_title_idx").on(table.title)]
);

export type SongRow = typeof songs.$inferSelect;

// Historial de versiones de cada canción: una fila por cambio, con el contenido
// que tenía ANTES del cambio. Sin clave foránea a propósito: sobrevive al borrado.
export const songVersions = pgTable(
  "song_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    songId: uuid("song_id").notNull(),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    originalKey: text("original_key").notNull(),
    body: text("body").notNull(),
    savedBy: text("saved_by").notNull(),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
    // update | delete | chords | restore | revert
    reason: text("reason").notNull(),
  },
  (table) => [index("song_versions_song_idx").on(table.songId, table.savedAt)]
);

export type SongVersionRow = typeof songVersions.$inferSelect;

export const setlists = pgTable("setlists", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  // Orden de canciones del power: array de ids de `songs`, en el orden en que se cantan.
  songIds: uuid("song_ids")
    .array()
    .notNull()
    .default(sql`ARRAY[]::uuid[]`),
  // Semitonos de transposición por canción para este power puntual (no
  // toca el tono original de la canción, solo cómo se ve/exporta acá).
  // Formato: { [songId]: semitones }
  transpose: jsonb("transpose").notNull().default(sql`'{}'::jsonb`),
  // Divisores de sección (ALABANZA, ADORACIÓN...). Formato: [{ name, position }]
  // donde position = cantidad de canciones que van antes del divisor.
  dividers: jsonb("dividers").notNull().default(sql`'[]'::jsonb`),
  // Fecha del culto/reunión para la que se armó (opcional) y notas del power.
  serviceDate: date("service_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SetlistRow = typeof setlists.$inferSelect;

// Usuarios que pueden entrar al admin además del dueño (el de ADMIN_USER / ADMIN_PASSWORD).
export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  // Formato: scrypt:<salt hex>:<hash hex>
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminUserRow = typeof adminUsers.$inferSelect;

// Historial de quién cambió qué (canciones, powers y usuarios).
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    username: text("username").notNull(),
    // create | update | delete | duplicate | chords
    action: text("action").notNull(),
    // song | setlist | user
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    entityTitle: text("entity_title").notNull(),
  },
  (table) => [index("audit_log_at_idx").on(table.at)]
);

export type AuditRow = typeof auditLog.$inferSelect;

// Intentos fallidos de login por IP/usuario: el límite tiene que vivir en la base
// porque en serverless cada instancia tiene su propia memoria.
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // "ip:1.2.3.4" o "user:nombre"
    key: text("key").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("login_attempts_key_at_idx").on(table.key, table.at)]
);
