import { NextRequest, NextResponse } from "next/server";

// Diagrama de guitarra: 6 posiciones (de la 6ª cuerda/Mi grave a la 1ª/Mi agudo).
// -1 = cuerda no se toca, 0 = al aire, N = traste N.
export type ChordDiagram = { frets: number[] };

const TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h para aciertos
const NEGATIVE_TTL_MS = 60 * 60 * 1000; // 1h para "no encontrado" (no machacar APIs caídas)

type CacheEntry = { diagram: ChordDiagram | null; expires: number };
// Caché en memoria del servidor: mismo acorde pedido por muchas canciones/usuarios no repite la llamada externa.
const cache = new Map<string, CacheEntry>();

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  if (!name) {
    return NextResponse.json({ error: "Falta el nombre del acorde." }, { status: 400 });
  }

  const cached = cache.get(name);
  if (cached && cached.expires > Date.now()) {
    return cached.diagram
      ? NextResponse.json({ diagram: cached.diagram })
      : NextResponse.json(
          { error: "Diagrama no disponible para este acorde." },
          { status: 404 }
        );
  }

  const diagram =
    (await fetchFromUberchord(name).catch(() => null)) ??
    (await fetchFromChordsApi(name).catch(() => null));

  cache.set(name, {
    diagram,
    expires: Date.now() + (diagram ? CACHE_TTL_MS : NEGATIVE_TTL_MS),
  });

  if (!diagram) {
    return NextResponse.json(
      { error: "Diagrama no disponible para este acorde." },
      { status: 404 }
    );
  }
  return NextResponse.json({ diagram });
}

function fretsStringToDiagram(frets: string): ChordDiagram | null {
  const cleaned = frets.trim();
  if (cleaned.length !== 6) return null;
  const parsed = [...cleaned].map((ch) => (/[xX]/.test(ch) ? -1 : Number.parseInt(ch, 10)));
  if (parsed.some((n) => Number.isNaN(n))) return null;
  return { frets: parsed };
}

// https://api.uberchord.com/ — servicio de terceros gratuito, sin garantía de disponibilidad.
async function fetchFromUberchord(name: string): Promise<ChordDiagram | null> {
  const res = await fetch(
    `https://api.uberchord.com/v1/chords?nameStrict=${encodeURIComponent(name)}`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const first = Array.isArray(data) ? data[0] : undefined;
  const frets = first?.positions?.[0]?.frets;
  return typeof frets === "string" ? fretsStringToDiagram(frets) : null;
}

// https://chords.alday.dev/ — segunda opción si Uberchord no tiene el acorde.
async function fetchFromChordsApi(name: string): Promise<ChordDiagram | null> {
  const res = await fetch(
    `https://chords.alday.dev/v1/chords?name=${encodeURIComponent(name)}`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const first = Array.isArray(data) ? data[0] : (data?.chords?.[0] ?? undefined);
  const frets = first?.positions?.[0]?.frets ?? first?.frets;
  return typeof frets === "string" ? fretsStringToDiagram(frets) : null;
}
