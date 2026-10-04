import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adminUsers } from "@/db/schema";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const KEY_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 8;
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

export type AdminUser = { id: string; username: string; createdAt: string };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Nombres en minúsculas, sin espacios: así "Ana" y "ana" son el mismo usuario. */
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function validateNewUser(username: string, password: string): string | null {
  if (!USERNAME_RE.test(username)) {
    return "El usuario tiene que tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  return null;
}

// Hash de relleno: si el usuario no existe igual se hace el cálculo, así no se
// puede adivinar qué usuarios existen midiendo cuánto tarda la respuesta.
let dummyHash: Promise<string> | null = null;

export async function verifyUser(username: string, password: string): Promise<boolean> {
  const [row] = await getDb()
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.username, normalizeUsername(username)));
  if (!row) {
    dummyHash ??= hashPassword("relleno-sin-usuario");
    await checkPassword(password, await dummyHash);
    return false;
  }
  return checkPassword(password, row.passwordHash);
}

export async function userExists(username: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.username, normalizeUsername(username)));
  return Boolean(row);
}

export async function listUsers(): Promise<AdminUser[]> {
  const rows = await getDb().select().from(adminUsers).orderBy(asc(adminUsers.username));
  return rows.map((r) => ({ id: r.id, username: r.username, createdAt: r.createdAt.toISOString() }));
}

/** Devuelve null si ese nombre ya está en uso. */
export async function createUser(username: string, password: string): Promise<AdminUser | null> {
  const [row] = await getDb()
    .insert(adminUsers)
    .values({ username, passwordHash: await hashPassword(password) })
    .onConflictDoNothing({ target: adminUsers.username })
    .returning();
  return row ? { id: row.id, username: row.username, createdAt: row.createdAt.toISOString() } : null;
}

/** Devuelve el nombre del usuario borrado, o null si no existía. */
export async function deleteUser(id: string): Promise<string | null> {
  const [row] = await getDb().delete(adminUsers).where(eq(adminUsers.id, id)).returning();
  return row ? row.username : null;
}
