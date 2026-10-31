import type { NextRequest } from "next/server";

// Límite de intentos fallidos de login. Vive en la base (tabla login_attempts)
// porque en serverless cada instancia tiene su propia memoria y un contador
// local casi no frena a nadie. Si la base falla se cae a un contador en memoria
// (menos efectivo, pero nunca deja pasar por un error).

export const WINDOW_MS = 10 * 60 * 1000; // 10 minutos
export const MAX_IP_ATTEMPTS = 5;
export const MAX_USER_ATTEMPTS = 8;
// Cuántos intentos se leen como máximo por clave: alcanza para saber cuándo se levanta el bloqueo.
const MAX_ROWS = 50;
const PRUNE_PROBABILITY = 0.1;

// ---------------------------------------------------------------------------
// IP del cliente
// ---------------------------------------------------------------------------

const MAX_IP_LENGTH = 64;

/** Último elemento no vacío de una lista separada por comas. */
function lastHop(value: string | null | undefined): string | null {
  if (!value) return null;
  const hops = value.split(",").map((h) => h.trim()).filter(Boolean);
  const last = hops[hops.length - 1];
  return last && last.length <= MAX_IP_LENGTH ? last : null;
}

/**
 * IP del cliente a partir de los headers.
 *
 * En Vercel el borde pisa x-forwarded-for / x-real-ip / x-vercel-forwarded-for
 * con la IP real de quien se conecta (no reenvía los valores que manda el
 * cliente), así que esos headers son de fiar. Fuera de Vercel (otro hosting,
 * `next start` detrás de un proxy) el cliente puede mandar su propio
 * x-forwarded-for: el primer elemento es el que más fácil se falsifica, por eso
 * se usa el ÚLTIMO, que es el que agregó el proxy más cercano. x-real-ip solo
 * se toma en Vercel o como último recurso.
 */
export function ipFromHeaders(
  get: (name: string) => string | null | undefined,
  onVercel: boolean
): string {
  if (onVercel) {
    return (
      lastHop(get("x-vercel-forwarded-for")) ??
      lastHop(get("x-real-ip")) ??
      lastHop(get("x-forwarded-for")) ??
      "unknown"
    );
  }
  return lastHop(get("x-forwarded-for")) ?? lastHop(get("x-real-ip")) ?? "unknown";
}

export function clientIp(request: NextRequest): string {
  return ipFromHeaders((name) => request.headers.get(name), Boolean(process.env.VERCEL));
}

// ---------------------------------------------------------------------------
// Almacenes
// ---------------------------------------------------------------------------

/** Dónde se guardan los intentos fallidos. Se puede inyectar uno falso en los tests. */
export interface AttemptStore {
  /** Momentos (ms) de los intentos de `key` posteriores a `since`, del más viejo al más nuevo. */
  recent(key: string, since: number): Promise<number[]>;
  add(key: string, at: number): Promise<void>;
  clear(keys: string[]): Promise<void>;
  /** Borra todo lo anterior a `before`. */
  prune(before: number): Promise<void>;
}

export function createMemoryStore(): AttemptStore {
  const attempts = new Map<string, number[]>();
  return {
    async recent(key, since) {
      return (attempts.get(key) ?? []).filter((t) => t > since);
    },
    async add(key, at) {
      attempts.set(key, [...(attempts.get(key) ?? []), at]);
    },
    async clear(keys) {
      for (const k of keys) attempts.delete(k);
    },
    async prune(before) {
      for (const [k, times] of attempts) {
        const kept = times.filter((t) => t >= before);
        if (kept.length) attempts.set(k, kept);
        else attempts.delete(k);
      }
    },
  };
}

export function createDbStore(): AttemptStore {
  // Imports perezosos: así la lógica del límite se puede probar sin base ni drizzle.
  return {
    async recent(key, since) {
      const [{ and, asc, eq, gt }, { getDb }, { loginAttempts }] = await Promise.all([
        import("drizzle-orm"),
        import("@/db"),
        import("@/db/schema"),
      ]);
      const rows = await getDb()
        .select({ at: loginAttempts.at })
        .from(loginAttempts)
        .where(and(eq(loginAttempts.key, key), gt(loginAttempts.at, new Date(since))))
        .orderBy(asc(loginAttempts.at))
        .limit(MAX_ROWS);
      return rows.map((r) => r.at.getTime());
    },
    async add(key, at) {
      const [{ getDb }, { loginAttempts }] = await Promise.all([
        import("@/db"),
        import("@/db/schema"),
      ]);
      await getDb().insert(loginAttempts).values({ key, at: new Date(at) });
    },
    async clear(keys) {
      if (keys.length === 0) return;
      const [{ inArray }, { getDb }, { loginAttempts }] = await Promise.all([
        import("drizzle-orm"),
        import("@/db"),
        import("@/db/schema"),
      ]);
      await getDb().delete(loginAttempts).where(inArray(loginAttempts.key, keys));
    },
    async prune(before) {
      const [{ lt }, { getDb }, { loginAttempts }] = await Promise.all([
        import("drizzle-orm"),
        import("@/db"),
        import("@/db/schema"),
      ]);
      await getDb().delete(loginAttempts).where(lt(loginAttempts.at, new Date(before)));
    },
  };
}

/**
 * Usa `primary` y, si falla, `fallback` (avisando en el log). Nunca tira error:
 * un problema con la base no puede ni trabar el login ni dejar entrar a nadie.
 */
export function withFallback(primary: AttemptStore, fallback: AttemptStore): AttemptStore {
  async function run<T>(op: string, main: () => Promise<T>, alt: () => Promise<T>): Promise<T> {
    try {
      return await main();
    } catch (err) {
      console.error(`Rate limit: falló la base (${op}), se usa el contador en memoria:`, err);
      return alt();
    }
  }
  return {
    recent: async (key, since) => {
      // Se suman los intentos que hayan quedado solo en memoria por una falla anterior.
      const local = await fallback.recent(key, since);
      const remote = await run("recent", () => primary.recent(key, since), async () => []);
      return [...remote, ...local].sort((a, b) => a - b);
    },
    add: (key, at) =>
      run(
        "add",
        () => primary.add(key, at),
        () => fallback.add(key, at)
      ),
    clear: async (keys) => {
      await fallback.clear(keys);
      await run("clear", () => primary.clear(keys), async () => undefined);
    },
    prune: async (before) => {
      await fallback.prune(before);
      await run("prune", () => primary.prune(before), async () => undefined);
    },
  };
}

// ---------------------------------------------------------------------------
// Límite
// ---------------------------------------------------------------------------

export type LimitCheck = {
  limited: boolean;
  /** Segundos hasta que se levanta el bloqueo (0 si no está bloqueado). */
  retryAfterSeconds: number;
};

export type LimiterOptions = {
  windowMs?: number;
  maxIp?: number;
  maxUser?: number;
  now?: () => number;
  /** Devuelve un número entre 0 y 1; si es menor que 0.1 se limpian las filas viejas. */
  random?: () => number;
};

export function ipKey(ip: string): string {
  return `ip:${ip}`;
}

export function userKey(username: string): string {
  return `user:${username.trim().toLowerCase().slice(0, 64)}`;
}

export function createLoginLimiter(store: AttemptStore, options: LimiterOptions = {}) {
  const windowMs = options.windowMs ?? WINDOW_MS;
  const maxIp = options.maxIp ?? MAX_IP_ATTEMPTS;
  const maxUser = options.maxUser ?? MAX_USER_ATTEMPTS;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;

  // Con `count` fallos en la ventana y un tope `max`, el bloqueo se levanta
  // cuando vence el fallo número (count - max + 1) contando desde el más viejo.
  function retryAfterMs(times: number[], max: number): number {
    if (times.length < max) return 0;
    const unblocksAt = times[times.length - max] + windowMs;
    return Math.max(0, unblocksAt - now());
  }

  return {
    /**
     * ¿Esta IP o este usuario ya gastaron sus intentos? `username` puede ser
     * null si no vino, e `ip` puede ser null para limitar solo por usuario.
     */
    async check(ip: string | null, username: string | null): Promise<LimitCheck> {
      const since = now() - windowMs;
      const [ipTimes, userTimes] = await Promise.all([
        ip ? store.recent(ipKey(ip), since) : Promise.resolve([] as number[]),
        username ? store.recent(userKey(username), since) : Promise.resolve([] as number[]),
      ]);
      const wait = Math.max(retryAfterMs(ipTimes, maxIp), retryAfterMs(userTimes, maxUser));
      const limited = ipTimes.length >= maxIp || userTimes.length >= maxUser;
      return { limited, retryAfterSeconds: limited ? Math.max(1, Math.ceil(wait / 1000)) : 0 };
    },

    async registerFailure(ip: string | null, username: string | null): Promise<void> {
      const at = now();
      if (ip) await store.add(ipKey(ip), at);
      if (username) await store.add(userKey(username), at);
      // Limpieza oportunista: no hace falta un cron para que la tabla no crezca sin límite.
      if (random() < PRUNE_PROBABILITY) await store.prune(at - windowMs);
    },

    async clear(ip: string | null, username: string | null): Promise<void> {
      const keys: string[] = [];
      if (ip) keys.push(ipKey(ip));
      if (username) keys.push(userKey(username));
      await store.clear(keys);
    },
  };
}

let defaultLimiter: ReturnType<typeof createLoginLimiter> | null = null;

/** Límite real: base de datos con caída a memoria. */
export function getLoginLimiter() {
  defaultLimiter ??= createLoginLimiter(withFallback(createDbStore(), createMemoryStore()));
  return defaultLimiter;
}
