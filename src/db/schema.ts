import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SetlistRow = typeof setlists.$inferSelect;
