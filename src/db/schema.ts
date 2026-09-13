import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const songs = pgTable(
  "songs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    originalKey: text("original_key").notNull(),
    category: text("category"),
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
