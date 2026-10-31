export const SESSION_COOKIE = "cancionero_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
export const MIN_SECRET_LENGTH = 32;
const TOKEN_VERSION = 2;

/**
 * Secreto con el que se firman las sesiones. En producción tiene que tener al
 * menos 32 caracteres; en desarrollo alcanza con que exista.
 */
export function resolveSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Falta la variable de entorno SESSION_SECRET.");
  }
  if (env.NODE_ENV === "production" && secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET es demasiado corto: en producción tiene que tener al menos ${MIN_SECRET_LENGTH} caracteres (por ejemplo, generá uno con "openssl rand -base64 48").`
    );
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
    new TextEncoder().encode(resolveSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Comparación de strings en tiempo constante (el largo no es secreto: las huellas miden siempre lo mismo). */
export function constantTimeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const len = Math.max(ea.length, eb.length);
  for (let i = 0; i < len; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/**
 * Huella corta de una credencial (el hash de la contraseña de un usuario o la
 * ADMIN_PASSWORD del dueño). Va dentro del token: si la credencial cambia, la
 * huella cambia y las sesiones viejas dejan de valer. Es un HMAC con el secreto
 * de sesión, así el token (que se puede leer) no permite adivinar la credencial.
 */
export async function credentialFingerprint(
  kind: "owner" | "user",
  credential: string
): Promise<string> {
  const key = await importKey();
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`fp:${kind}:${credential}`)
  );
  return toBase64Url(mac).slice(0, 16);
}

/** Quién es el dueño de la sesión: el dueño (variables de entorno) o un usuario de la base. */
export type SessionSubject =
  | { kind: "owner"; username: string; password: string }
  | { kind: "user"; username: string; uid: string; passwordHash: string };

export type SessionPayload = {
  v: number;
  k: "owner" | "user";
  u: string;
  uid?: string;
  fp: string;
  exp: number;
};

export async function createSessionToken(
  subject: SessionSubject,
  opts: { now?: number } = {}
): Promise<string> {
  const now = opts.now ?? Date.now();
  const payload: SessionPayload =
    subject.kind === "owner"
      ? {
          v: TOKEN_VERSION,
          k: "owner",
          u: subject.username,
          fp: await credentialFingerprint("owner", subject.password),
          exp: now + SESSION_DURATION_MS,
        }
      : {
          v: TOKEN_VERSION,
          k: "user",
          u: subject.username,
          uid: subject.uid,
          fp: await credentialFingerprint("user", subject.passwordHash),
          exp: now + SESSION_DURATION_MS,
        };
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${toBase64Url(sig)}`;
}

function isValidPayload(p: unknown): p is SessionPayload {
  if (typeof p !== "object" || p === null) return false;
  const o = p as Record<string, unknown>;
  if (o.v !== TOKEN_VERSION) return false; // formato viejo (solo nombre): se descarta
  if (o.k !== "owner" && o.k !== "user") return false;
  if (typeof o.u !== "string" || !o.u) return false;
  if (typeof o.fp !== "string" || !o.fp) return false;
  if (typeof o.exp !== "number") return false;
  if (o.k === "user" && (typeof o.uid !== "string" || !o.uid)) return false;
  return true;
}

/**
 * Verifica firma (en tiempo constante, lo hace crypto.subtle.verify), formato
 * y vencimiento. NO consulta la base ni compara la huella: eso lo hace
 * getAuthenticatedSession. Devuelve el contenido del token o null.
 */
export async function readSessionToken(
  token: string | undefined | null,
  opts: { now?: number } = {}
): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  try {
    const key = await importKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(sigB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;

    const payload: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
    if (!isValidPayload(payload)) return null;
    return (opts.now ?? Date.now()) <= payload.exp ? payload : null;
  } catch (err) {
    // Un secreto mal configurado es un error de despliegue, no un token malo: que se vea.
    if (err instanceof Error && err.message.includes("SESSION_SECRET")) throw err;
    return null;
  }
}

/** Solo firma, formato y vencimiento (lo usa el proxy como primera barrera, sin tocar la base). */
export async function verifySessionToken(
  token: string | undefined | null,
  opts: { now?: number } = {}
): Promise<boolean> {
  return (await readSessionToken(token, opts)) !== null;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DURATION_MS / 1000,
};

async function currentToken(): Promise<string | undefined> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

/** Nombre de usuario de la sesión actual (firma y vencimiento verificados, sin consultar la base). */
export async function getSessionUsername(): Promise<string | null> {
  const payload = await readSessionToken(await currentToken());
  return payload ? payload.u : null;
}

export type AuthenticatedSession = {
  kind: "owner" | "user";
  username: string;
  /** Solo para usuarios de la base. */
  uid?: string;
};

/** Sesión del dueño: el nombre tiene que ser ADMIN_USER y la huella tiene que coincidir con ADMIN_PASSWORD. */
export async function resolveOwnerSession(
  payload: SessionPayload,
  env: Record<string, string | undefined> = process.env
): Promise<AuthenticatedSession | null> {
  const adminUser = env.ADMIN_USER;
  const adminPassword = env.ADMIN_PASSWORD;
  if (payload.k !== "owner" || !adminUser || !adminPassword) return null;
  const expected = await credentialFingerprint("owner", adminPassword);
  const sameFp = constantTimeEqual(payload.fp, expected);
  const sameUser = constantTimeEqual(payload.u, adminUser);
  return sameFp && sameUser ? { kind: "owner", username: adminUser } : null;
}

/**
 * Sesión actual ya comprobada contra su fuente de verdad: el dueño contra las
 * variables de entorno y los demás contra la base (el usuario tiene que existir
 * con ese id y con la misma contraseña que cuando se emitió el token). Si algo
 * falla —incluida la base— devuelve null: un error nunca deja entrar.
 */
export async function getAuthenticatedSession(): Promise<AuthenticatedSession | null> {
  const payload = await readSessionToken(await currentToken());
  if (!payload) return null;

  if (payload.k === "owner") return resolveOwnerSession(payload);

  try {
    const { getUserById } = await import("@/lib/users");
    const user = await getUserById(payload.uid!);
    if (!user) return null;
    const expected = await credentialFingerprint("user", user.passwordHash);
    const sameFp = constantTimeEqual(payload.fp, expected);
    const sameName = constantTimeEqual(payload.u, user.username);
    return sameFp && sameName ? { kind: "user", username: user.username, uid: user.id } : null;
  } catch (err) {
    console.error("No se pudo verificar la sesión contra la base:", err);
    return null;
  }
}

/** El dueño es el usuario de las variables de entorno: el único que administra a los demás. */
export async function isOwner(): Promise<boolean> {
  const payload = await readSessionToken(await currentToken());
  if (!payload) return false;
  return (await resolveOwnerSession(payload)) !== null;
}

export async function requireAdmin(): Promise<boolean> {
  return (await getAuthenticatedSession()) !== null;
}
