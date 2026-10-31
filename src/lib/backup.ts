import { getTableColumns, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { setlists, songs, songVersions } from "@/db/schema";
import { DIVIDER_NAMES, type SetlistDivider } from "@/lib/dividers";
import {
  isIsoDateTime,
  isUuid,
  parseBpm,
  parseNotes,
  parseServiceDate,
  type Parsed,
} from "@/lib/validation";

export const BACKUP_APP = "cancionero";
export const BACKUP_VERSION = 1;
/** Tamaño máximo (en caracteres) del JSON de un respaldo que se acepta al restaurar. */
export const BACKUP_MAX_CHARS = 30 * 1024 * 1024;

const MAX_SONGS = 20_000;
const MAX_SETLISTS = 5_000;
const MAX_VERSIONS = 200_000;
const VERSION_REASONS = ["update", "delete", "chords", "restore", "revert"];

export type BackupSong = {
  id: string;
  title: string;
  artist: string;
  originalKey: string;
  category: string | null;
  tags: string[];
  body: string;
  bpm: number | null;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BackupSetlist = {
  id: string;
  title: string;
  songIds: string[];
  transpose: Record<string, number>;
  dividers: SetlistDivider[];
  serviceDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BackupVersion = {
  id: string;
  songId: string;
  title: string;
  artist: string;
  originalKey: string;
  body: string;
  savedBy: string;
  savedAt: string;
  reason: string;
};

export type BackupFile = {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  songs: BackupSong[];
  setlists: BackupSetlist[];
  versions: BackupVersion[];
};

export function backupFileName(date: Date = new Date()): string {
  return `cancionero-respaldo-${date.toISOString().slice(0, 10)}.json`;
}

/** Todo el contenido (incluidas las canciones de la papelera). No incluye usuarios ni contraseñas. */
export async function exportBackup(): Promise<BackupFile> {
  const db = getDb();
  const [songRows, setlistRows, versionRows] = await Promise.all([
    db.select().from(songs),
    db.select().from(setlists),
    db.select().from(songVersions),
  ]);
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    songs: songRows.map((r) => ({
      id: r.id,
      title: r.title,
      artist: r.artist,
      originalKey: r.originalKey,
      category: r.category,
      tags: r.tags,
      body: r.body,
      bpm: r.bpm,
      notes: r.notes,
      deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    setlists: setlistRows.map((r) => ({
      id: r.id,
      title: r.title,
      songIds: r.songIds,
      transpose: (r.transpose && typeof r.transpose === "object" ? r.transpose : {}) as Record<string, number>,
      dividers: (Array.isArray(r.dividers) ? r.dividers : []) as SetlistDivider[],
      serviceDate: r.serviceDate,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    versions: versionRows.map((r) => ({
      id: r.id,
      songId: r.songId,
      title: r.title,
      artist: r.artist,
      originalKey: r.originalKey,
      body: r.body,
      savedBy: r.savedBy,
      savedAt: r.savedAt.toISOString(),
      reason: r.reason,
    })),
  };
}

// ---- Validación ----

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** Texto de largo acotado. */
function str(o: Obj, key: string, max: number, opts: { allowEmpty?: boolean } = {}): string | null {
  const v = o[key];
  if (typeof v !== "string" || v.length > max) return null;
  if (!opts.allowEmpty && !v.trim()) return null;
  return v;
}

function fail(what: string, index: number, detail: string): Parsed<never> {
  return { ok: false, error: `${what} #${index + 1}: ${detail}` };
}

function parseSong(raw: unknown, i: number): Parsed<BackupSong> {
  if (!isObj(raw)) return fail("Canción", i, "no es un objeto.");
  if (!isUuid(raw.id)) return fail("Canción", i, "el id no es un uuid.");
  const title = str(raw, "title", 500);
  if (title === null) return fail("Canción", i, "falta el título.");
  const artist = str(raw, "artist", 500, { allowEmpty: true });
  if (artist === null) return fail("Canción", i, "el artista no es válido.");
  const originalKey = str(raw, "originalKey", 50);
  if (originalKey === null) return fail("Canción", i, "el tono no es válido.");
  const body = str(raw, "body", 500_000, { allowEmpty: true });
  if (body === null) return fail("Canción", i, "la letra no es válida.");

  let category: string | null = null;
  if (raw.category !== null && raw.category !== undefined) {
    if (typeof raw.category !== "string" || raw.category.length > 200) {
      return fail("Canción", i, "la categoría no es válida.");
    }
    category = raw.category;
  }
  const tags = raw.tags ?? [];
  if (
    !Array.isArray(tags) ||
    tags.length > 50 ||
    !tags.every((t) => typeof t === "string" && t.length <= 100)
  ) {
    return fail("Canción", i, "las etiquetas no son válidas.");
  }
  const bpm = parseBpm(raw.bpm);
  if (!bpm.ok) return fail("Canción", i, "el tempo no es válido.");
  const notes = parseNotes(raw.notes);
  if (!notes.ok) return fail("Canción", i, "las notas no son válidas.");

  const deletedAt = raw.deletedAt ?? null;
  if (deletedAt !== null && !isIsoDateTime(deletedAt)) {
    return fail("Canción", i, "la fecha de borrado no es válida.");
  }
  if (!isIsoDateTime(raw.createdAt) || !isIsoDateTime(raw.updatedAt)) {
    return fail("Canción", i, "las fechas de creación y edición no son válidas.");
  }
  return {
    ok: true,
    value: {
      id: raw.id,
      title,
      artist,
      originalKey,
      category,
      tags: tags as string[],
      body,
      bpm: bpm.value,
      notes: notes.value,
      deletedAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    },
  };
}

function parseSetlist(raw: unknown, i: number): Parsed<BackupSetlist> {
  if (!isObj(raw)) return fail("Power", i, "no es un objeto.");
  if (!isUuid(raw.id)) return fail("Power", i, "el id no es un uuid.");
  const title = str(raw, "title", 500);
  if (title === null) return fail("Power", i, "falta el nombre.");

  const songIds = raw.songIds ?? [];
  if (!Array.isArray(songIds) || songIds.length > 1000 || !songIds.every(isUuid)) {
    return fail("Power", i, "la lista de canciones no es válida.");
  }
  if (new Set(songIds).size !== songIds.length) {
    return fail("Power", i, "la lista de canciones tiene repetidas.");
  }

  const transposeRaw = raw.transpose ?? {};
  if (!isObj(transposeRaw)) return fail("Power", i, "los tonos no son válidos.");
  const transpose: Record<string, number> = {};
  for (const [key, value] of Object.entries(transposeRaw)) {
    if (!isUuid(key) || typeof value !== "number" || !Number.isInteger(value) || Math.abs(value) > 24) {
      return fail("Power", i, "los tonos no son válidos.");
    }
    transpose[key] = value;
  }

  const dividersRaw = raw.dividers ?? [];
  if (!Array.isArray(dividersRaw) || dividersRaw.length > 100) {
    return fail("Power", i, "los divisores no son válidos.");
  }
  const dividers: SetlistDivider[] = [];
  for (const d of dividersRaw) {
    if (
      !isObj(d) ||
      !(DIVIDER_NAMES as readonly unknown[]).includes(d.name) ||
      typeof d.position !== "number" ||
      !Number.isInteger(d.position) ||
      d.position < 0 ||
      d.position > songIds.length
    ) {
      return fail("Power", i, "los divisores no son válidos.");
    }
    dividers.push({ name: d.name as SetlistDivider["name"], position: d.position });
  }

  const serviceDate = parseServiceDate(raw.serviceDate);
  if (!serviceDate.ok) return fail("Power", i, "la fecha del culto no es válida.");
  const notes = parseNotes(raw.notes);
  if (!notes.ok) return fail("Power", i, "las notas no son válidas.");
  if (!isIsoDateTime(raw.createdAt) || !isIsoDateTime(raw.updatedAt)) {
    return fail("Power", i, "las fechas de creación y edición no son válidas.");
  }
  return {
    ok: true,
    value: {
      id: raw.id,
      title,
      songIds: songIds as string[],
      transpose,
      dividers,
      serviceDate: serviceDate.value,
      notes: notes.value,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    },
  };
}

function parseVersion(raw: unknown, i: number): Parsed<BackupVersion> {
  if (!isObj(raw)) return fail("Versión", i, "no es un objeto.");
  if (!isUuid(raw.id) || !isUuid(raw.songId)) return fail("Versión", i, "los ids no son uuid.");
  const title = str(raw, "title", 500);
  const artist = str(raw, "artist", 500, { allowEmpty: true });
  const originalKey = str(raw, "originalKey", 50);
  const body = str(raw, "body", 500_000, { allowEmpty: true });
  const savedBy = str(raw, "savedBy", 200);
  if (title === null || artist === null || originalKey === null || body === null || savedBy === null) {
    return fail("Versión", i, "faltan datos o no son válidos.");
  }
  if (typeof raw.reason !== "string" || !VERSION_REASONS.includes(raw.reason)) {
    return fail("Versión", i, "el motivo no es válido.");
  }
  if (!isIsoDateTime(raw.savedAt)) return fail("Versión", i, "la fecha no es válida.");
  return {
    ok: true,
    value: {
      id: raw.id,
      songId: raw.songId,
      title,
      artist,
      originalKey,
      body,
      savedBy,
      savedAt: raw.savedAt,
      reason: raw.reason,
    },
  };
}

function parseList<T extends { id: string }>(
  input: unknown,
  max: number,
  label: string,
  parseOne: (raw: unknown, i: number) => Parsed<T>
): Parsed<T[]> {
  if (!Array.isArray(input)) return { ok: false, error: `Falta la lista de ${label}.` };
  if (input.length > max) return { ok: false, error: `Demasiadas ${label} en el archivo.` };
  const out: T[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < input.length; i++) {
    const parsed = parseOne(input[i], i);
    if (!parsed.ok) return parsed;
    if (seen.has(parsed.value.id)) {
      return { ok: false, error: `Hay ${label} con el mismo id repetido en el archivo.` };
    }
    seen.add(parsed.value.id);
    out.push(parsed.value);
  }
  return { ok: true, value: out };
}

/** Valida estrictamente un respaldo ya parseado de JSON. */
export function parseBackup(input: unknown): Parsed<BackupFile> {
  if (!isObj(input) || input.app !== BACKUP_APP) {
    return { ok: false, error: "Este archivo no parece un respaldo del cancionero." };
  }
  if (input.version !== BACKUP_VERSION) {
    return { ok: false, error: "Este respaldo es de una versión que no reconocemos." };
  }
  const songsOut = parseList(input.songs, MAX_SONGS, "canciones", parseSong);
  if (!songsOut.ok) return songsOut;
  const setlistsOut = parseList(input.setlists, MAX_SETLISTS, "powers", parseSetlist);
  if (!setlistsOut.ok) return setlistsOut;
  const versionsOut = parseList(
    input.versions ?? input.songVersions ?? [],
    MAX_VERSIONS,
    "versiones",
    parseVersion
  );
  if (!versionsOut.ok) return versionsOut;
  return {
    ok: true,
    value: {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: isIsoDateTime(input.exportedAt) ? input.exportedAt : new Date().toISOString(),
      songs: songsOut.value,
      setlists: setlistsOut.value,
      versions: versionsOut.value,
    },
  };
}

// ---- Restauración ----

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** `SET col = excluded.col` para todas las columnas menos las indicadas. */
function excludedSet(columns: Record<string, PgColumn>, skip: string[]) {
  const set: Record<string, ReturnType<typeof sql.raw>> = {};
  for (const [key, col] of Object.entries(columns)) {
    if (skip.includes(key)) continue;
    set[key] = sql.raw(`excluded."${col.name}"`);
  }
  return set;
}

/**
 * Restaura en modo "fusionar": inserta lo que falta y pisa lo que tenga el mismo
 * id; nunca borra nada. Todo va en un solo batch, que Neon ejecuta como una
 * transacción (o se aplica todo o no se aplica nada).
 */
export async function restoreBackup(
  data: BackupFile
): Promise<{ songs: number; setlists: number; versions: number }> {
  const db = getDb();
  const statements = [];

  for (const part of chunk(data.songs, 100)) {
    statements.push(
      db
        .insert(songs)
        .values(
          part.map((s) => ({
            ...s,
            deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
            createdAt: new Date(s.createdAt),
            updatedAt: new Date(s.updatedAt),
          }))
        )
        .onConflictDoUpdate({
          target: songs.id,
          set: excludedSet(getTableColumns(songs), ["id"]),
        })
    );
  }
  for (const part of chunk(data.setlists, 100)) {
    statements.push(
      db
        .insert(setlists)
        .values(
          part.map((s) => ({
            ...s,
            createdAt: new Date(s.createdAt),
            updatedAt: new Date(s.updatedAt),
          }))
        )
        .onConflictDoUpdate({
          target: setlists.id,
          set: excludedSet(getTableColumns(setlists), ["id"]),
        })
    );
  }
  // Las versiones son inmutables: si ya están, se dejan como están.
  for (const part of chunk(data.versions, 200)) {
    statements.push(
      db
        .insert(songVersions)
        .values(part.map((v) => ({ ...v, savedAt: new Date(v.savedAt) })))
        .onConflictDoNothing({ target: songVersions.id })
    );
  }

  if (statements.length > 0) {
    await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
  }
  return { songs: data.songs.length, setlists: data.setlists.length, versions: data.versions.length };
}
