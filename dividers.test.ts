import { decodeDividers, encodeDividers, mergeEntries, sanitizeDividers, splitEntries, type SetlistDivider } from "./src/lib/dividers";
import { normalizePlainChords, parseSongLine, displayChord } from "./src/lib/chords";
import { findJunkLines, removeJunkLines } from "./src/lib/junk";

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

// ---- Intros en texto plano ----
{
  const up = (line: string, semitones: number) => {
    const n = normalizePlainChords(line);
    return parseSongLine(n).chords.map((c) => displayChord(c.chord, semitones, "en")).join(" ");
  };
  check("Intro: Am F C G", up("Intro:  Am  F   C    G", 2) === "Bm G D A", up("Intro:  Am  F   C    G", 2));
  check("Intro con guiones", up("Intro: G-Dm-C-G", 2) === "A Em D A");
  check("Intro con ' // ' y sin dos puntos", up("Intro // Gm7 - F - Ebm7 - F //", 2) === "Am7 G Fm7 G", up("Intro // Gm7 - F - Ebm7 - F //", 2));
  check("INTRO con (4x) y 7mas", up("INTRO(4x): Bm - A6 - F#m7 - G", 2) === "C#m B6 G#m7 A");
  check("Puente con bajo (C/E)", up("PUENTE: C/E – Bb – F - C", 2) === "D/F# C G D", up("PUENTE: C/E – Bb – F - C", 2));
  check("Intro con barras sueltas", up("INTRO:  G / D/ E /C", 2) === "A E F# D");
  check("Intro pegada: D////A////E////Bm////", up("INTRO : D////A////E////Bm////", 2) === "E B F# C#m");
  check("Intro en latino mayúsculas", up("INTRO: LA – SOL – (FA – Rem ) - MI", 2) === "B A G Em F#", up("INTRO: LA – SOL – (FA – Rem ) - MI", 2));
  check("Intro latino con # y b", up("Intro: SOL#- RE#(Mib)- LA#(SIb)- DOm", 2) === "A# F F C C Dm", up("Intro: SOL#- RE#(Mib)- LA#(SIb)- DOm", 2));
  const marker = normalizePlainChords("Intro: Am - G (4 veces)");
  check("la marca (4 veces) se conserva", marker.includes("(4 veces)") && marker.includes("[Am]"), marker);
  for (const text of ["INTRO", "Puente 1 (X2):", "Solo Dios es digno", "Final feliz", "Coro de ángeles", "Intro con trompetas", "Solo Bateria", "INTRO CON TROMPETA"]) {
    check(`no toca "${text}"`, normalizePlainChords(text) === text, normalizePlainChords(text));
  }
  const again = normalizePlainChords(normalizePlainChords("Intro: Am - F"));
  check("es idempotente", again === normalizePlainChords("Intro: Am - F"));
  check("ya con corchetes: sigue igual", normalizePlainChords("INTRO: [D] [Bm]") === "INTRO: [D] [Bm]");
}

// ---- Basura de páginas web ----
{
  const dirty = ["", " Diagramas de Acordes ", "Mostrar / Ocultar ", "Guitarra ", "Piano ", "Ukulele ", "Charango ", "   D", "///QUIERO LLENAR", "G", "TU TRONO DE ALABANZA"].join("\n");
  const found = findJunkLines(dirty);
  check("detecta las 6 líneas de menú", found.length === 6, JSON.stringify(found.map((f) => f.text)));
  const clean = removeJunkLines(dirty);
  check("al quitarlas queda la canción", clean.startsWith("   D\n///QUIERO LLENAR") && !/Guitarra|Ukulele|Diagramas/.test(clean), JSON.stringify(clean.slice(0, 40)));
  check("después de limpiar ya no hay basura", findJunkLines(clean).length === 0);
  check("detecta links y créditos", findJunkLines("Letra\nhttps://www.cifraclub.com/x\nwww.lacuerda.net\n© 2020 Todos los derechos").length === 3);
  check("no toca una canción normal", findJunkLines("[Am]Cantaré de tu [F]amor\nBajo tu cuidado estoy\nSolo tú eres digno").length === 0);
  check("una línea con acordes nunca es basura", findJunkLines("[Am]Guitarra").length === 0);
  check("'Bajo' solo en una línea sí se marca (lo decide la persona)", findJunkLines("Bajo").length === 1);
  check("sin basura devuelve lo mismo", removeJunkLines("Hola\n\nMundo") === "Hola\n\nMundo");
}

// ---- Guiones y barras entre acordes ----
{
  const n = normalizePlainChords("Bm      G      ////A - Bm - G////\nAL QUE ES DIGNO\nAm - F\nhola mundo").split("\n");
  check("acordes con //// y guiones: todos entre corchetes", n[0] === "[Bm] [G] ////[A] - [Bm] - [G]////", n[0]);
  check("esa línea no se mezcla con la letra", n[1] === "AL QUE ES DIGNO");
  check("Am - F sobre una letra: se une a la letra", n[2] === "[Am]hola [F]mundo", n[2]);
}

// ---- Bordes de dividers.ts ----
{
  const out = sanitizeDividers(
    [
      { name: "ALABANZA", position: NaN },
      { name: "OFRENDA", position: Infinity },
      { name: "FINAL", position: -Infinity },
      { name: "ADORACIÓN", position: -3 },
      { name: "FINAL", position: 2.5 },
    ],
    4
  );
  check(
    "sanitize: NaN e Infinity se descartan, negativos van a 0, 2.5 redondea",
    same(out, [
      { name: "ADORACIÓN", position: 0 },
      { name: "FINAL", position: 3 },
    ]),
    JSON.stringify(out)
  );
  check(
    "sanitize: songCount NaN o negativo => todo en 0",
    same(sanitizeDividers([{ name: "FINAL", position: 5 }], NaN), [{ name: "FINAL", position: 0 }]) &&
      same(sanitizeDividers([{ name: "FINAL", position: 5 }], -2), [{ name: "FINAL", position: 0 }])
  );
  check(
    "sanitize: songCount Infinity (PATCH sin songIds) no acota arriba",
    sanitizeDividers([{ name: "FINAL", position: 40 }], Infinity)[0].position === 40
  );
  const rep = sanitizeDividers(
    [
      { name: "OFRENDA", position: 1 },
      { name: "OFRENDA", position: 1 },
      { name: "OFRENDA", position: 2 },
      { name: "ALABANZA", position: 0 },
      { name: "OFRENDA", position: 2 },
    ],
    3
  );
  check(
    "sanitize: dobles idénticos y seguidos se juntan; el resto se conserva en orden",
    same(rep.map((d) => `${d.name}.${d.position}`), ["OFRENDA.1", "OFRENDA.2", "ALABANZA.0", "OFRENDA.2"]),
    JSON.stringify(rep)
  );
  const input = [{ name: "FINAL", position: 99 }];
  sanitizeDividers(input, 2);
  check("sanitize: no modifica el array de entrada", input[0].position === 99);
  check(
    "sanitize: sin canciones => todo posición 0",
    sanitizeDividers([{ name: "FINAL", position: 3 }, { name: "ALABANZA", position: 1 }], 0).every((d) => d.position === 0)
  );
}
{
  // mergeEntries ya no pierde divisores con posición fuera de rango
  const e = mergeEntries(["a", "b"], [
    { name: "FINAL", position: 9 },
    { name: "ALABANZA", position: -4 },
    { name: "OFRENDA", position: NaN },
  ]);
  const labels = e.map((x) => (x.kind === "divider" ? `#${x.name}` : x.song));
  check("merge: posición fuera de rango o NaN se acota, no se pierde", same(labels, ["#ALABANZA", "a", "b", "#FINAL", "#OFRENDA"]), labels.join(","));
  check(
    "merge: divisores desordenados salen ordenados por posición (estable)",
    same(
      mergeEntries(["a", "b", "c"], [
        { name: "FINAL", position: 3 },
        { name: "OFRENDA", position: 1 },
        { name: "ALABANZA", position: 1 },
        { name: "ADORACIÓN", position: 0 },
      ]).map((x) => (x.kind === "divider" ? `#${x.name}` : x.song)),
      ["#ADORACIÓN", "a", "#OFRENDA", "#ALABANZA", "b", "c", "#FINAL"]
    )
  );
  const twice = mergeEntries([] as string[], [
    { name: "ALABANZA", position: 0 },
    { name: "ALABANZA", position: 0 },
  ]);
  check("merge: nombres repetidos se conservan (la limpieza es del sanitize)", twice.length === 2);
}
{
  const ds: SetlistDivider[] = [
    { name: "ALABANZA", position: 0 },
    { name: "ADORACIÓN", position: 2 },
  ];
  check("encode/decode son inversas", same(decodeDividers(encodeDividers(ds), 5), ds));
  check("decode: undefined y vacío => []", decodeDividers(undefined, 3).length === 0 && decodeDividers("", 3).length === 0);
  check("decode: posición vacía no se vuelve 0", decodeDividers("ALABANZA.", 3).length === 0);
  check("decode: sin punto o con basura se descarta", decodeDividers("ALABANZA,FINAL.x,OFRENDA.1", 3).map((d) => d.name).join() === "OFRENDA");
  check("decode: posición mayor se acota", decodeDividers("FINAL.99", 3)[0].position === 3);
}

console.log(`\nRESULTADO: ${passed} OK, ${failures} FAIL`);
process.exit(failures > 0 ? 1 : 0);
