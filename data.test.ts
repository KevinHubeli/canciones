import { PgDialect } from "drizzle-orm/pg-core";
import { CHORD_PATTERN, NO_CHORDS_SQL } from "./src/lib/songs";
import { removeSongsFromSetlistData } from "./src/lib/setlistData";
import { parseBackup } from "./src/lib/backup";
import {
  isUuid,
  isValidDateString,
  parseBpm,
  parseIntParam,
  parseNotes,
  parseServiceDate,
} from "./src/lib/validation";

let failures = 0;
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failures++;
    console.log(`  FAIL: ${name}${detail ? " — " + detail : ""}`);
  }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- Filtro "Sin acordes": el patrón tiene que llegar intacto a Postgres ----
{
  const q = new PgDialect().sqlToQuery(NO_CHORDS_SQL);
  check("sin acordes: el SQL usa !~ con un parámetro", q.sql.endsWith("!~ $1"), q.sql);
  check("sin acordes: el patrón llega como \\[[^\\]]+\\]", q.params[0] === "\\[[^\\]]+\\]", String(q.params[0]));
  check("sin acordes: el patrón no quedó escrito en el SQL", !q.sql.includes("[^"), q.sql);
  const re = new RegExp(CHORD_PATTERN);
  check("patrón: matchea [Am]", re.test("Te [Am]alabo"));
  check("patrón: no matchea texto sin acordes", !re.test("Te alabo [] señor"));
}

// ---- Sanitizadores ----
{
  const o = { fallback: 24, min: 1, max: 500 };
  check("limit 2.5 => 2", parseIntParam("2.5", o) === 2);
  check("limit Infinity => fallback", parseIntParam("Infinity", o) === 24);
  check("limit abc => fallback", parseIntParam("abc", o) === 24);
  check("limit null => fallback", parseIntParam(null, o) === 24);
  check("limit vacío => fallback", parseIntParam("", o) === 24);
  check("limit 0 => min", parseIntParam("0", o) === 1);
  check("limit 9999 => max", parseIntParam("9999", o) === 500);
  const off = { fallback: 0, min: 0, max: 1_000_000 };
  check("offset 1.5 => 1", parseIntParam("1.5", off) === 1);
  check("offset -3 => 0", parseIntParam("-3", off) === 0);
  check("offset Infinity => 0", parseIntParam("Infinity", off) === 0);

  check("bpm null", same(parseBpm(null), { ok: true, value: null }));
  check("bpm 120", same(parseBpm(120), { ok: true, value: 120 }));
  check("bpm '90'", same(parseBpm("90"), { ok: true, value: 90 }));
  check("bpm 30 y 300 valen", parseBpm(30).ok && parseBpm(300).ok);
  check("bpm 29 y 301 no", !parseBpm(29).ok && !parseBpm(301).ok);
  check("bpm 100.5 no", !parseBpm(100.5).ok);
  check("bpm NaN / texto no", !parseBpm(NaN).ok && !parseBpm("rápido").ok && !parseBpm(true).ok);

  check("notes null", same(parseNotes(null), { ok: true, value: null }));
  check("notes vacío => null", same(parseNotes("   "), { ok: true, value: null }));
  check("notes recorta", same(parseNotes(" hola "), { ok: true, value: "hola" }));
  check("notes 2000 ok", parseNotes("a".repeat(2000)).ok);
  check("notes 2001 no", !parseNotes("a".repeat(2001)).ok);
  check("notes número no", !parseNotes(5).ok);

  check("fecha válida", same(parseServiceDate("2026-10-31"), { ok: true, value: "2026-10-31" }));
  check("fecha null", same(parseServiceDate(null), { ok: true, value: null }));
  check("fecha bisiesta", isValidDateString("2028-02-29") && !isValidDateString("2027-02-29"));
  check("fecha 2026-02-30 no", !parseServiceDate("2026-02-30").ok);
  check("fecha 31/10/2026 no", !parseServiceDate("31/10/2026").ok);
  check("fecha con hora no", !parseServiceDate("2026-10-31T10:00:00Z").ok);
  check("fecha número no", !parseServiceDate(20261031).ok);

  check("uuid válido", isUuid("0b9f4c3e-8a77-4d4a-9a0b-2f0f3f3c1a11"));
  check("uuid inválido", !isUuid("hola") && !isUuid(null) && !isUuid(5));
}

// ---- Borrado definitivo de una canción en un power ----
{
  const [a, b, c, d] = ["a", "b", "c", "d"].map((x) => `${x.repeat(8)}-aaaa-4aaa-8aaa-${x.repeat(12)}`);
  const row = {
    songIds: [a, b, c, d],
    transpose: { [a]: 1, [b]: 2, [c]: -1 },
    dividers: [
      { name: "ALABANZA", position: 0 },
      { name: "ADORACIÓN", position: 2 },
      { name: "FINAL", position: 4 },
    ],
  };
  const out = removeSongsFromSetlistData(row, [a, c]);
  check("purge: quita los ids", same(out.songIds, [b, d]));
  check("purge: quita los tonos", same(out.transpose, { [b]: 2 }));
  check(
    "purge: corre los divisores",
    same(out.dividers, [
      { name: "ALABANZA", position: 0 },
      { name: "ADORACIÓN", position: 1 },
      { name: "FINAL", position: 2 },
    ]),
    JSON.stringify(out.dividers)
  );
  const none = removeSongsFromSetlistData(row, ["no-existe"]);
  check("purge: sin coincidencias no cambia nada", same(none.songIds, row.songIds) && same(none.dividers, row.dividers));
  check("purge: transpose inválido no rompe", same(removeSongsFromSetlistData({ ...row, transpose: null }, [a]).transpose, {}));
}

// ---- Validación del respaldo ----
{
  const id1 = "11111111-1111-4111-8111-111111111111";
  const id2 = "22222222-2222-4222-8222-222222222222";
  const id3 = "33333333-3333-4333-8333-333333333333";
  const ts = "2026-10-31T12:00:00.000Z";
  const song = (id: string) => ({
    id,
    title: "Cuan grande es Él",
    artist: "Himno",
    originalKey: "G",
    category: null,
    tags: ["Alabanza"],
    body: "[G]Señor mi Dios",
    bpm: 72,
    notes: "entra el piano",
    deletedAt: null,
    createdAt: ts,
    updatedAt: ts,
  });
  const setlist = {
    id: id3,
    title: "Domingo",
    songIds: [id1, id2],
    transpose: { [id1]: 2 },
    dividers: [{ name: "ALABANZA", position: 0 }],
    serviceDate: "2026-11-01",
    notes: null,
    createdAt: ts,
    updatedAt: ts,
  };
  const version = {
    id: id3,
    songId: id1,
    title: "x",
    artist: "",
    originalKey: "G",
    body: "b",
    savedBy: "kevin",
    savedAt: ts,
    reason: "update",
  };
  const base = () => ({
    app: "cancionero",
    version: 1,
    exportedAt: ts,
    songs: [song(id1), song(id2)],
    setlists: [setlist],
    versions: [version],
  });

  const ok = parseBackup(base());
  check("respaldo válido", ok.ok);
  if (ok.ok) {
    check("respaldo: cuenta", ok.value.songs.length === 2 && ok.value.setlists.length === 1 && ok.value.versions.length === 1);
    check("respaldo: sobrevive al JSON", parseBackup(JSON.parse(JSON.stringify(ok.value))).ok);
  }
  const legacy = { ...base(), songVersions: [version], versions: undefined };
  check("respaldo: acepta songVersions", parseBackup(legacy).ok);
  check("respaldo: versiones opcionales", parseBackup({ ...base(), versions: undefined }).ok);

  check("respaldo: no objeto", !parseBackup(null).ok && !parseBackup([]).ok && !parseBackup("x").ok);
  check("respaldo: otra app", !parseBackup({ ...base(), app: "otra" }).ok);
  check("respaldo: otra versión", !parseBackup({ ...base(), version: 2 }).ok);
  check("respaldo: sin canciones", !parseBackup({ ...base(), songs: undefined }).ok);
  check("respaldo: id no uuid", !parseBackup({ ...base(), songs: [{ ...song(id1), id: "123" }] }).ok);
  check("respaldo: ids repetidos", !parseBackup({ ...base(), songs: [song(id1), song(id1)] }).ok);
  check("respaldo: título vacío", !parseBackup({ ...base(), songs: [{ ...song(id1), title: " " }] }).ok);
  check("respaldo: tipo incorrecto", !parseBackup({ ...base(), songs: [{ ...song(id1), body: 5 }] }).ok);
  check("respaldo: bpm fuera de rango", !parseBackup({ ...base(), songs: [{ ...song(id1), bpm: 999 }] }).ok);
  check("respaldo: fecha inválida", !parseBackup({ ...base(), songs: [{ ...song(id1), updatedAt: "ayer" }] }).ok);
  check("respaldo: deletedAt inválido", !parseBackup({ ...base(), songs: [{ ...song(id1), deletedAt: "ayer" }] }).ok);
  check("respaldo: deletedAt válido", parseBackup({ ...base(), songs: [{ ...song(id1), deletedAt: ts }] }).ok);
  check("respaldo: tags no texto", !parseBackup({ ...base(), songs: [{ ...song(id1), tags: [1] }] }).ok);
  check("respaldo: power con id de canción inválido", !parseBackup({ ...base(), setlists: [{ ...setlist, songIds: ["x"] }] }).ok);
  check("respaldo: power con canciones repetidas", !parseBackup({ ...base(), setlists: [{ ...setlist, songIds: [id1, id1] }] }).ok);
  check("respaldo: divisor fuera de rango", !parseBackup({ ...base(), setlists: [{ ...setlist, dividers: [{ name: "ALABANZA", position: 9 }] }] }).ok);
  check("respaldo: divisor con nombre raro", !parseBackup({ ...base(), setlists: [{ ...setlist, dividers: [{ name: "XXX", position: 0 }] }] }).ok);
  check("respaldo: tono no entero", !parseBackup({ ...base(), setlists: [{ ...setlist, transpose: { [id1]: 1.5 } }] }).ok);
  check("respaldo: fecha de culto inválida", !parseBackup({ ...base(), setlists: [{ ...setlist, serviceDate: "2026-02-30" }] }).ok);
  check("respaldo: versión con motivo raro", !parseBackup({ ...base(), versions: [{ ...version, reason: "hack" }] }).ok);
  check("respaldo: versión con songId inválido", !parseBackup({ ...base(), versions: [{ ...version, songId: "z" }] }).ok);
}

console.log(`\nRESULTADO: ${passed} OK, ${failures} FAIL`);
if (failures > 0) process.exit(1);
