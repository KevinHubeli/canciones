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
// Tope para que nadie mande un texto enorme y haga trabajar al scrypt de más.
export const MAX_PASSWORD_LENGTH = 128;
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

export type AdminUser = { id: string; username: string; createdAt: string };
/** Lo que hace falta para armar la sesión de un usuario de la base. Nunca se manda al cliente. */
export type AuthUser = { id: string; username: string; passwordHash: string };

// Contraseñas demasiado comunes para aceptarlas en usuarios nuevos o en un cambio.
const TRIVIAL_PASSWORDS = new Set([
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "12341234",
  "87654321",
  "11111111",
  "00000000",
  "password",
  "password1",
  "password123",
  "passw0rd",
  "qwerty",
  "qwerty123",
  "qwertyui",
  "qwertyuiop",
  "abc12345",
  "abcd1234",
  "abcdefgh",
  "iloveyou",
  "admin123",
  "administrador",
  "contrasena",
  "contrasena1",
  "contrasenia",
  "cancionero",
  "canciones",
  "bienvenido",
  "bienvenida",
  "jesus123",
  "dios1234",
]);

function isSequential(s: string): boolean {
  if (s.length < 4) return false;
  const step = s.charCodeAt(1) - s.charCodeAt(0);
  if (Math.abs(step) !== 1) return false;
  for (let i = 1; i < s.length; i++) {
    if (s.charCodeAt(i) - s.charCodeAt(i - 1) !== step) return false;
  }
  return true;
}

/** Devuelve el motivo si la contraseña es demasiado fácil de adivinar, o null si está bien. */
export function weakPasswordReason(password: string, username = ""): string | null {
  const lower = password
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const user = username.trim().toLowerCase();
  if (TRIVIAL_PASSWORDS.has(lower)) return "Esa contraseña es muy común.";
  if (user && (lower === user || lower.replace(/[0-9]+$/, "") === user)) {
    return "La contraseña no puede ser igual al usuario.";
  }
  if (/^(.)\1+$/.test(lower)) return "La contraseña no puede repetir siempre el mismo carácter.";
  if (isSequential(lower)) return "La contraseña no puede ser una secuencia (como 12345678 o abcdefgh).";
  return null;
}

/**
 * Regla para contraseñas NUEVAS (alta de usuario, cambio y reseteo). No se usa
 * al iniciar sesión: los usuarios que ya existen con una contraseña vieja siguen entrando.
 */
export function validatePassword(password: string, username = ""): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `La contraseña no puede pasar de ${MAX_PASSWORD_LENGTH} caracteres.`;
  }
  const weak = weakPasswordReason(password, username);
  return weak ? `${weak} Elegí otra.` : null;
}

/** Texto corto con la regla, para mostrar como ayuda en los formularios. */
export const PASSWORD_RULE_TEXT = `Mínimo ${MIN_PASSWORD_LENGTH} caracteres, sin ser algo obvio como 12345678 o "password".`;

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
  return validatePassword(password, username);
}

// Hash de relleno: si el usuario no existe igual se hace el cálculo, así no se
// puede adivinar qué usuarios existen midiendo cuánto tarda la respuesta.
let dummyHash: Promise<string> | null = null;

/** Devuelve el usuario si el nombre y la contraseña son correctos, o null. */
export async function verifyUser(username: string, password: string): Promise<AuthUser | null> {
  const [row] = await getDb()
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.username, normalizeUsername(username)));
  if (!row) {
    dummyHash ??= hashPassword("relleno-sin-usuario");
    await checkPassword(password, await dummyHash);
    return null;
  }
  const ok = await checkPassword(password, row.passwordHash);
  return ok ? { id: row.id, username: row.username, passwordHash: row.passwordHash } : null;
}

/** Datos de sesión de un usuario por id (para comprobar que el token siga vigente). */
export async function getUserById(id: string): Promise<AuthUser | null> {
  const [row] = await getDb().select().from(adminUsers).where(eq(adminUsers.id, id));
  return row ? { id: row.id, username: row.username, passwordHash: row.passwordHash } : null;
}

/** Cambia la contraseña. Devuelve el usuario con el hash nuevo, o null si no existe. */
export async function setUserPassword(id: string, newPassword: string): Promise<AuthUser | null> {
  const passwordHash = await hashPassword(newPassword);
  const [row] = await getDb()
    .update(adminUsers)
    .set({ passwordHash })
    .where(eq(adminUsers.id, id))
    .returning();
  return row ? { id: row.id, username: row.username, passwordHash: row.passwordHash } : null;
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
