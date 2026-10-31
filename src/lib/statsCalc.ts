// Parte pura de las estadísticas: agregaciones sobre arrays, sin tocar la base.

export type StatSong = {
  id: string;
  title: string;
  artist: string;
  originalKey: string;
  tags: string[];
  hasChords: boolean;
};

export type StatSetlist = {
  id: string;
  songIds: string[];
  /** Día en que se usó el power (YYYY-MM-DD): la fecha del culto o, si no hay, la última edición. */
  usedOn: string;
};

export type UsedSong = {
  id: string;
  title: string;
  artist: string;
  uses: number;
  /** YYYY-MM-DD */
  lastUsed: string;
};

export type StaleSong = {
  id: string;
  title: string;
  artist: string;
  /** YYYY-MM-DD, o null si nunca se usó */
  lastUsed: string | null;
  daysAgo: number | null;
};

export type CountItem = { label: string; count: number };

export type Stats = {
  generatedAt: string;
  staleDays: number;
  totals: { songs: number; setlists: number; withoutChords: number };
  topUsed: UsedSong[];
  stale: StaleSong[];
  staleTotal: number;
  neverUsed: number;
  keys: CountItem[];
  tags: CountItem[];
  /** Últimos meses, del más viejo al más nuevo; month = YYYY-MM */
  setlistsByMonth: { month: string; count: number }[];
};

export const TOP_LIMIT = 15;
export const STALE_LIMIT = 100;
export const MONTHS_BACK = 12;
export const NO_TAG_LABEL = "Sin etiqueta";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const baFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Día calendario (YYYY-MM-DD) de un instante, en hora de Argentina. */
export function toBuenosAiresDay(date: Date): string {
  return baFormat.format(date);
}

/**
 * Fecha de uso de un power: la del culto si está cargada, si no el día de la
 * última edición. Recibe la fecha del culto tal cual viene de la base ("YYYY-MM-DD").
 */
export function usageDay(serviceDate: string | null | undefined, updatedAt: Date): string {
  if (serviceDate && DAY_RE.test(serviceDate.slice(0, 10))) return serviceDate.slice(0, 10);
  return toBuenosAiresDay(updatedAt);
}

function dayToUtc(day: string): number {
  const m = DAY_RE.exec(day);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Días enteros entre dos días YYYY-MM-DD (negativo si `day` es futuro). */
export function daysBetween(day: string, today: string): number {
  return Math.round((dayToUtc(today) - dayToUtc(day)) / DAY_MS);
}

function sortCounts(map: Map<string, number>): CountItem[] {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
}

/** Últimos `n` meses (YYYY-MM) terminando en el mes de `today`, del más viejo al más nuevo. */
export function lastMonths(today: string, n: number): string[] {
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${year}-${String(month).padStart(2, "0")}`);
    month--;
    if (month === 0) {
      month = 12;
      year--;
    }
  }
  return out;
}

export function computeStats(
  songs: StatSong[],
  setlists: StatSetlist[],
  opts: { today: string; staleDays: number; now?: Date }
): Stats {
  const { today, staleDays } = opts;
  const byId = new Map(songs.map((s) => [s.id, s]));

  // Por canción: en cuántos powers aparece (una vez por power) y cuándo fue la última.
  const usage = new Map<string, { uses: number; lastUsed: string }>();
  for (const setlist of setlists) {
    for (const id of new Set(setlist.songIds)) {
      if (!byId.has(id)) continue; // canción borrada o en la papelera
      const prev = usage.get(id);
      if (!prev) usage.set(id, { uses: 1, lastUsed: setlist.usedOn });
      else {
        prev.uses++;
        if (setlist.usedOn > prev.lastUsed) prev.lastUsed = setlist.usedOn;
      }
    }
  }

  const topUsed: UsedSong[] = [...usage.entries()]
    .map(([id, u]) => {
      const song = byId.get(id)!;
      return { id, title: song.title, artist: song.artist, ...u };
    })
    .sort(
      (a, b) =>
        b.uses - a.uses ||
        (a.lastUsed < b.lastUsed ? 1 : a.lastUsed > b.lastUsed ? -1 : 0) ||
        a.title.localeCompare(b.title, "es")
    )
    .slice(0, TOP_LIMIT);

  const staleAll: StaleSong[] = [];
  let neverUsed = 0;
  for (const song of songs) {
    const u = usage.get(song.id);
    if (!u) {
      neverUsed++;
      staleAll.push({ id: song.id, title: song.title, artist: song.artist, lastUsed: null, daysAgo: null });
      continue;
    }
    const daysAgo = daysBetween(u.lastUsed, today);
    if (daysAgo > staleDays) {
      staleAll.push({ id: song.id, title: song.title, artist: song.artist, lastUsed: u.lastUsed, daysAgo });
    }
  }
  // Primero las que nunca se usaron, después las que hace más que no se usan.
  staleAll.sort((a, b) => {
    if (a.daysAgo === null && b.daysAgo !== null) return -1;
    if (a.daysAgo !== null && b.daysAgo === null) return 1;
    return (b.daysAgo ?? 0) - (a.daysAgo ?? 0) || a.title.localeCompare(b.title, "es");
  });

  const keyCount = new Map<string, number>();
  const tagCount = new Map<string, number>();
  for (const song of songs) {
    const key = song.originalKey.trim() || "Sin tono";
    keyCount.set(key, (keyCount.get(key) ?? 0) + 1);
    const tags = [...new Set(song.tags)];
    if (tags.length === 0) tagCount.set(NO_TAG_LABEL, (tagCount.get(NO_TAG_LABEL) ?? 0) + 1);
    for (const tag of tags) tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
  }

  const monthCount = new Map(lastMonths(today, MONTHS_BACK).map((m) => [m, 0]));
  for (const setlist of setlists) {
    const month = setlist.usedOn.slice(0, 7);
    if (monthCount.has(month)) monthCount.set(month, monthCount.get(month)! + 1);
  }

  return {
    generatedAt: (opts.now ?? new Date()).toISOString(),
    staleDays,
    totals: {
      songs: songs.length,
      setlists: setlists.length,
      withoutChords: songs.filter((s) => !s.hasChords).length,
    },
    topUsed,
    stale: staleAll.slice(0, STALE_LIMIT),
    staleTotal: staleAll.length,
    neverUsed,
    keys: sortCounts(keyCount),
    tags: sortCounts(tagCount),
    setlistsByMonth: [...monthCount.entries()].map(([month, count]) => ({ month, count })),
  };
}
