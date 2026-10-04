import { mergeEntries, sanitizeDividers, splitEntries, type SetlistDivider } from "./src/lib/dividers";
import { normalizePlainChords, parseSongLine, displayChord } from "./src/lib/chords";

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

// ---- mergeEntries / splitEntries ----
{
  const songs = ["a", "b", "c"];
  const dividers: SetlistDivider[] = [
    { name: "ALABANZA", position: 0 },
    { name: "OFRENDA", position: 2 },
    { name: "FINAL", position: 3 },
  ];
  const entries = mergeEntries(songs, dividers);
  const labels = entries.map((e) => (e.kind === "divider" ? `#${e.name}` : e.song));
  check("merge: orden correcto", same(labels, ["#ALABANZA", "a", "b", "#OFRENDA", "c", "#FINAL"]), labels.join(","));
  const back = splitEntries(entries);
  check("split(merge(x)) == x", same(back.songs, songs) && same(back.dividers, dividers));
}
{
  const entries = mergeEntries(["a"], [
    { name: "FINAL", position: 1 },
    { name: "OFRENDA", position: 1 },
  ]);
  const labels = entries.map((e) => (e.kind === "divider" ? `#${e.name}` : e.song));
  check("merge: varios divisores en la misma posición respetan el orden", same(labels, ["a", "#FINAL", "#OFRENDA"]));
}
{
  const entries = mergeEntries([] as string[], [{ name: "ALABANZA", position: 0 }]);
  check("merge: power sin canciones pero con divisor", entries.length === 1 && entries[0].kind === "divider");
  check("merge: sin divisores", same(mergeEntries(["x", "y"], []).map((e) => e.kind), ["song", "song"]));
}

// ---- sanitizeDividers ----
{
  const out = sanitizeDividers(
    [
      { name: "ALABANZA", position: 0 },
      { name: "INVENTADO", position: 1 },
      { name: "FINAL", position: 99 },
      { name: "OFRENDA", position: -5 },
      { name: "OFRENDA", position: "2" },
      null,
      "x",
      { name: "ADORACIÓN", position: 1.4 },
    ],
    3
  );
  check(
    "sanitize: descarta inválidos y acota posiciones",
    same(out, [
      { name: "ALABANZA", position: 0 },
      { name: "FINAL", position: 3 },
      { name: "OFRENDA", position: 0 },
      { name: "ADORACIÓN", position: 1 },
    ]),
    JSON.stringify(out)
  );
  check("sanitize: no-array => []", same(sanitizeDividers("hola", 3), []) && same(sanitizeDividers(undefined, 3), []));
}

// ---- normalizePlainChords + transposición ----
{
  const n = normalizePlainChords("La        Mi\nEres Tú la única razón\n\nDo#m7      Re\nadoración");
  const lines = n.split("\n");
  const toKey = (l: string) => parseSongLine(l).chords.map((c) => displayChord(c.chord, 3, "en"));
  check("plano latino: La/Mi suben 3 => C/G", same(toKey(lines[0]), ["C", "G"]), JSON.stringify(toKey(lines[0])));
  check("plano latino: Do#m7/Re => Em7/F", same(toKey(lines[2]), ["Em7", "F"]), JSON.stringify(toKey(lines[2])));
  check("letra intacta", parseSongLine(lines[0]).lyrics.startsWith("Eres Tú"));
}
{
  const already = "[Am]Cantaré [F]hoy\nSegunda línea";
  check("ya con corchetes: no cambia", normalizePlainChords(already) === already);
  const lyricsOnly = "Mi Dios es grande\nSi tú quieres\nLa gloria es tuya";
  check("letra normal (aunque empiece con Mi/Si/La): no se toca", normalizePlainChords(lyricsOnly) === lyricsOnly);
  check("vacío", normalizePlainChords("") === "");
  const longTail = "C\nsola";
  check("acorde + letra corta", normalizePlainChords(longTail) === "[C]sola", normalizePlainChords(longTail));
  const slash = normalizePlainChords("D/F#  Bsus4  Em7(b5)\nlalala lalala lalala");
  check("acordes con bajo, sus y paréntesis se reconocen", (slash.match(/\[/g) ?? []).length === 3, slash);
}

// ---- Marcas de repetición ----
{
  const n = normalizePlainChords("///Am ///\nDa un paso al frente\n(x4) G\nX2\n//");
  const lines = n.split("\n");
  check("///Am /// => acorde entre corchetes", lines[0] === "///[Am] ///", lines[0]);
  check("no se mezcla con la letra de abajo", lines[1] === "Da un paso al frente");
  check("(x4) G", lines[2] === "(x4) [G]", lines[2]);
  check("marcas solas no son acordes", lines[3] === "X2" && lines[4] === "//");
  check("transpone igual", parseSongLine(lines[0]).chords.map((c) => displayChord(c.chord, 2, "en")).join() === "Bm");
}

console.log(`\nRESULTADO: ${passed} OK, ${failures} FAIL`);
process.exit(failures > 0 ? 1 : 0);
