import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Falta la variable de entorno DATABASE_URL.");
  }
  return drizzle({ client: neon(url), schema });
}

let db: ReturnType<typeof createDb> | undefined;

// Se crea recién la primera vez que se usa, así el build no necesita DATABASE_URL.
export function getDb() {
  db ??= createDb();
  return db;
}
