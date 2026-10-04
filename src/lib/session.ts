import { cookies } from "next/headers";

export const SESSION_COOKIE = "cancionero_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Falta la variable de entorno SESSION_SECRET.");
  }
  return secret;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const withPad = padded + "===".slice((padded.length + 3) % 4);
  const str = atob(withPad);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSessionToken(username: string): Promise<string> {
  const payload = JSON.stringify({
    u: username,
    exp: Date.now() + SESSION_DURATION_MS,
  });
  const payloadB64 = toBase64Url(new TextEncoder().encode(payload));
  const key = await importKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64)
  );
  return `${payloadB64}.${toBase64Url(sig)}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return false;

  const key = await importKey();
  try {
    // crypto.subtle.verify compara la firma en tiempo constante.
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(sigB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return false;

    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payloadB64))
    );
    return typeof payload.exp === "number" && Date.now() <= payload.exp;
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DURATION_MS / 1000,
};

/** Usuario de la sesión actual (con la firma y la fecha de vencimiento ya verificadas), o null. */
async function readSessionUsername(token: string | undefined | null): Promise<string | null> {
  if (!(await verifySessionToken(token))) return null;
  try {
    const payloadB64 = token!.split(".")[0];
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
    return typeof payload.u === "string" ? payload.u : null;
  } catch {
    return null;
  }
}

export async function getSessionUsername(): Promise<string | null> {
  const store = await cookies();
  return readSessionUsername(store.get(SESSION_COOKIE)?.value);
}

/** El dueño es el usuario de las variables de entorno: el único que administra a los demás. */
export async function isOwner(): Promise<boolean> {
  const username = await getSessionUsername();
  return username !== null && username === process.env.ADMIN_USER;
}

export async function requireAdmin(): Promise<boolean> {
  const username = await getSessionUsername();
  if (!username) return false;
  if (username === process.env.ADMIN_USER) return true;
  // Un usuario borrado pierde el acceso aunque su cookie siga vigente.
  const { userExists } = await import("@/lib/users");
  return userExists(username);
}
