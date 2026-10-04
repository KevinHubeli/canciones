import type { NextRequest } from "next/server";

const WINDOW_MS = 10 * 60 * 1000; // 10 minutos
const MAX_ATTEMPTS = 5;

// En memoria, por instancia: es best-effort, no distribuido entre regiones/instancias.
const attempts = new Map<string, number[]>();

export function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function isRateLimited(ip: string): boolean {
  const recent = (attempts.get(ip) ?? []).filter(
    (t) => Date.now() - t < WINDOW_MS
  );
  attempts.set(ip, recent);
  return recent.length >= MAX_ATTEMPTS;
}

// Evita que el mapa crezca sin límite con IPs que no vuelven más.
function pruneExpired(): void {
  if (attempts.size < 500) return;
  const now = Date.now();
  for (const [ip, times] of attempts) {
    if (times.every((t) => now - t >= WINDOW_MS)) attempts.delete(ip);
  }
}

export function registerFailedAttempt(ip: string): void {
  pruneExpired();
  const recent = (attempts.get(ip) ?? []).filter(
    (t) => Date.now() - t < WINDOW_MS
  );
  recent.push(Date.now());
  attempts.set(ip, recent);
}

export function clearAttempts(ip: string): void {
  attempts.delete(ip);
}
