import {
  capoChord,
  displayChord,
  layoutChordColumns,
  normalizePlainChordLines,
  normalizePlainChords,
  parseSongLine,
  prefersFlats,
  suggestCapo,
  toEnglishNotation,
  toLatinNotation,
  transposeChord,
  wrapLine,
} from "./src/lib/chords";
import { buildRuns, paginateSong, pptxContentDisposition, pptxFileNames } from "./src/lib/pptx-layout";

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

// ---- transposeChord: sostenidos por defecto, bemoles a pedido ----
{
  check("sin flats: F+3 => G#", transposeChord("F", 3) === "G#");
  check("sin flats: Bb+0 se queda Bb", transposeChord("Bb", 0) === "Bb");
  check("sin flats: Eb+2 => F", transposeChord("Eb", 2) === "F");
  check("sin flats: Bb+1 => B", transposeChord("Bb", 1) === "B");
  check("flats: F+3 => Ab", transposeChord("F", 3, true) === "Ab");
  check("flats: C-2 => Bb", transposeChord("C", -2, true) === "Bb");
  check("flats: G+3 => Bb", transposeChord("G", 3, true) === "Bb");
  check("flats: con calidad (F#m7+3 => Am7)", transposeChord("F#m7", 3, true) === "Am7");
  check("flats: con bajo (D/F#+3 => F/A)", transposeChord("D/F#", 3, true) === "F/A");
  check("flats: bajo bemol (C/E+2 => D/F#), sostenido por defecto", transposeChord("C/E", 2) === "D/F#");
  check("flats: bajo con bemol (C/E+1 => Db/F)", transposeChord("C/E", 1, true) === "Db/F");
  check("flats: Eb entrada, +3 => Gb", transposeChord("Eb", 3, true) === "Gb");
  check("flats: entrada sostenida (A#m+2 => Cm)", transposeChord("A#m", 2, true) === "Cm");
  check("flats: false se comporta como siempre", transposeChord("F", 3, false) === "G#");
  check("flats: no es un acorde => tal cual", transposeChord("Intro", 3, true) === "Intro");
  check("Cb/Fb/E#/B# también se entienden", transposeChord("Cb", 1) === "C" && transposeChord("E#", 1) === "F#");
  // Dar una vuelta de 12 semitonos deja todo igual (con el mismo deletreo)
  for (const root of ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]) {
    check(`vuelta completa ${root}`, transposeChord(root + "m7", 12) === root + "m7");
  }
}

// ---- prefersFlats ----
{
  const cases: [string, number, boolean][] = [
    ["F", 0, true], ["Bb", 0, true], ["Eb", 0, true], ["Ab", 0, true], ["Db", 0, true], ["Gb", 0, true],
    ["C", 0, false], ["G", 0, false], ["D", 0, false], ["A", 0, false], ["E", 0, false], ["B", 0, false], ["F#", 0, false],
    ["Dm", 0, true], ["Gm", 0, true], ["Cm", 0, true], ["Fm", 0, true], ["Bbm", 0, true], ["Ebm", 0, true],
    ["Am", 0, false], ["Em", 0, false], ["Bm", 0, false], ["F#m", 0, false], ["C#m", 0, false], ["G#m", 0, false],
    ["G", 3, true], // Bb
    ["C", 5, true], // F
    ["C", -2, true], // Bb
    ["C", 2, false], // D
    ["Am", 3, true], // Cm
    ["Am", 5, true], // Dm
    ["Am", 2, false], // Bm
    ["F", 2, false], // G
    ["Bb", 2, false], // C
    ["Bb", -2, true], // Ab
    ["C#m", 1, true], // Dm
    ["Sib", 0, true], ["Mib", 0, true], ["Fa", 0, true], ["Re", 0, false], ["Solm", 0, true], ["Lam", 0, false],
    ["Do", 3, true], // Mib
    ["", 0, false], ["Xyz", 3, false],
    ["Dm7", 0, true], ["Amaj7", 0, false], ["Fmaj7", 0, true],
  ];
  for (const [key, semis, expected] of cases) {
    check(`prefersFlats(${key}, ${semis}) = ${expected}`, prefersFlats(key, semis) === expected);
  }
  check("F# respeta cómo está escrito si no se transpone (Gb)", prefersFlats("Gb", 0) === true && prefersFlats("F#", 0) === false);
  check("a los 12 semitonos cuenta como sin transponer", prefersFlats("Bb", 12) === true && prefersFlats("A#", 12) === false);
}

// ---- displayChord con tono original ----
{
  check("sin originalKey: igual que antes (F+3 => G#)", displayChord("F", 3, "en") === "G#");
  check("sin originalKey: latino igual que antes", displayChord("Fa", 3, "latin") === "Sol#");
  check("tono F, +3 => Ab", displayChord("F", 3, "en", "F") === "Ab");
  check("tono G, +3: C => Eb, D => F, G => Bb", ["C", "D", "G"].map((c) => displayChord(c, 3, "en", "G")).join() === "Eb,F,Bb");
  check("tono G, +2 (tono A): C => D, G => A (sin bemoles)", displayChord("C", 2, "en", "G") === "D" && displayChord("G", 2, "en", "G") === "A");
  check("tono Bb sin transponer: Bb se queda Bb", displayChord("Bb", 0, "en", "Bb") === "Bb" && displayChord("Eb", 0, "en", "Bb") === "Eb");
  check("tono Bb, +2: Bb => C, Eb => F, F => G", ["Bb", "Eb", "F"].map((c) => displayChord(c, 2, "en", "Bb")).join() === "C,F,G");
  check("tono Bb, -2 (Ab): Bb => Ab, Eb => Db, F => Eb", ["Bb", "Eb", "F"].map((c) => displayChord(c, -2, "en", "Bb")).join() === "Ab,Db,Eb");
  check("con bajo: D/F# en tono D, +3 (F) => F/A", displayChord("D/F#", 3, "en", "D") === "F/A");
  check("con bajo, tono G +3: C/E => Eb/G", displayChord("C/E", 3, "en", "G") === "Eb/G");
  check("latino: Fa +3 en tono F => Lab", displayChord("Fa", 3, "latin", "F") === "Lab");
  check("latino: Do +3 en tono Sol(G) => Mib", displayChord("Do", 3, "latin", "Sol") === "Mib");
  check("latino de entrada, inglés de salida con bemoles (Sib en tono Sib, +0)", displayChord("Sib", 0, "en", "Sib") === "Bb");
  check("latino con bajo: Re/Fa# en Re, +3 => Fa/La", displayChord("Re/Fa#", 3, "latin", "Re") === "Fa/La");
  check("tono menor Am +3 (Cm): Am => Cm, Dm => Fm, E => G", ["Am", "Dm", "E"].map((c) => displayChord(c, 3, "en", "Am")).join() === "Cm,Fm,G");
  check("originalKey inválido: sostenidos", displayChord("F", 3, "en", "???") === "G#");
}

// ---- toEnglishNotation ----
{
  const cases: [string, string][] = [
    ["Fadd9", "Fadd9"], ["Fadd", "Fadd"], ["Faug", "Faug"], ["Fadd2", "Fadd2"],
    ["Fa", "F"], ["Fa#", "F#"], ["Fam", "Fm"], ["Fa7", "F7"], ["FA", "F"], ["Fam7", "Fm7"], ["Famaj7", "Fmaj7"], ["Fa#m", "F#m"],
    ["Faadd9", "Fadd9"], ["Faaug", "Faug"], ["Fadim", "Fdim"], ["Fasus4", "Fsus4"],
    ["Lasus4", "Asus4"], ["Lasus", "Asus"], ["Lasus2", "Asus2"], ["Lam", "Am"], ["La", "A"], ["LA", "A"], ["Lab", "Ab"], ["La7", "A7"],
    ["Dom", "Cm"], ["Dom7", "Cm7"], ["Dosus4", "Csus4"], ["Do", "C"], ["DO", "C"], ["DOm", "Cm"], ["Do#", "C#"], ["Doaug", "Caug"], ["Dodim", "Cdim"],
    ["Re", "D"], ["Rem", "Dm"], ["Remaj7", "Dmaj7"], ["Resus4", "Dsus4"], ["Reb", "Db"], ["Re7", "D7"],
    ["Mi", "E"], ["Mim", "Em"], ["Mib", "Eb"], ["Misus4", "Esus4"], ["Miadd9", "Eadd9"], ["Mi7", "E7"],
    ["Sol", "G"], ["Sol#", "G#"], ["SOL#", "G#"], ["Solm", "Gm"], ["Sol7", "G7"], ["Solsus4", "Gsus4"],
    ["Si", "B"], ["Sib", "Bb"], ["Sim", "Bm"], ["Si7", "B7"],
    ["Do/Mi", "C/E"], ["Sol/Si", "G/B"], ["Re/Fa#", "D/F#"], ["Lam/Sol", "Am/G"],
    ["Dadd9", "Dadd9"], ["Dsus4", "Dsus4"], ["Dm", "Dm"], ["Em", "Em"], ["Am", "Am"], ["Gadd9", "Gadd9"], ["Eadd9", "Eadd9"],
    ["F6/9", "F6/9"], ["Bm7b5", "Bm7b5"], ["C#m", "C#m"],
  ];
  for (const [input, expected] of cases) {
    const got = toEnglishNotation(input);
    check(`toEnglishNotation(${input}) = ${expected}`, got === expected, got);
  }
  // Ida y vuelta: inglés => latino => inglés deja el acorde como estaba.
  const roots = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];
  const qualities = ["", "m", "7", "m7", "maj7", "sus2", "sus4", "add9", "6", "m6", "9", "dim", "dim7", "aug", "m7b5", "maj9", "5", "7sus4", "6/9", "madd9", "m9", "add", "sus", "add2", "m(add9)"];
  let bad = 0;
  let total = 0;
  for (const r of roots) {
    for (const q of qualities) {
      total++;
      const chord = r + q;
      const back = toEnglishNotation(toLatinNotation(chord));
      if (back !== chord) {
        bad++;
        if (bad <= 5) console.log(`    ida y vuelta falla: ${chord} -> ${toLatinNotation(chord)} -> ${back}`);
      }
    }
  }
  check(`ida y vuelta inglés/latino (${total} acordes)`, bad === 0, `${bad} fallan`);
}

// ---- layoutChordColumns (acordes pegados) y wrapLine ----
{
  const cols = (chords: { index: number; label: string }[]) => layoutChordColumns(chords).map((c) => c.col);
  check("lejos: no se mueven", same(cols([{ index: 0, label: "Am" }, { index: 8, label: "F" }]), [0, 8]));
  check("pegados ([Am][F]): el segundo se corre al final del primero + 1", same(cols([{ index: 0, label: "Am" }, { index: 0, label: "F" }]), [0, 3]));
  check("[C]a[G]b: se separan", same(cols([{ index: 0, label: "C" }, { index: 1, label: "G" }]), [0, 2]));
  check("justo a 1 carácter del final: queda donde estaba", same(cols([{ index: 0, label: "Am" }, { index: 3, label: "F" }]), [0, 3]));
  check("uno a 2 caracteres del final: queda donde estaba", same(cols([{ index: 0, label: "Am" }, { index: 5, label: "F" }]), [0, 5]));
  check("en cadena", same(cols([{ index: 2, label: "Dm7" }, { index: 3, label: "G" }, { index: 3, label: "C/E" }]), [2, 6, 8]));
  check("desordenados: se ordenan por posición", same(cols([{ index: 5, label: "G" }, { index: 0, label: "C" }]), [0, 5]));
  check("sin acordes", same(cols([]), []));
  check("gap 0", same(layoutChordColumns([{ index: 0, label: "Am" }, { index: 1, label: "F" }], 0).map((c) => c.col), [0, 2]));
  const input = [{ index: 0, label: "Am", extra: 1 }, { index: 0, label: "F", extra: 2 }];
  check("conserva los demás campos", layoutChordColumns(input).every((c, i) => c.extra === input[i].extra));

  // Mismo criterio que el PPTX: la columna en pantalla es la posición en la línea de acordes del PPTX.
  const raw = "[Am][F]Hola [C]a[G]b [Dm7]mundo";
  const { chords } = parseSongLine(raw);
  const named = chords.map((c) => ({ index: c.index, label: c.chord }));
  const runs = buildRuns(raw, 0);
  const chordLine = runs[0].text;
  const lay = layoutChordColumns(named);
  check("misma posición que el PPTX", lay.every((c) => chordLine.slice(c.col, c.col + c.label.length) === c.label), `${JSON.stringify(chordLine)} ${JSON.stringify(lay.map((c) => c.col))}`);

  // wrapLine: ningún acorde se pierde y los pegados al final fuerzan el corte
  const wrapped = wrapLine("abcdefghij", [{ index: 8, label: "Am" }, { index: 9, label: "G" }], 10);
  check("wrapLine: pegados al final, la letra que entra no se parte", wrapped.length === 1 && wrapped[0].lyrics === "abcdefghij");
  check("wrapLine: no pierde acordes", wrapped.reduce((n, r) => n + r.chords.length, 0) === 2);
  const noWrap = wrapLine("abcdefghij", [{ index: 0, label: "Am" }], 10);
  check("wrapLine: lo que entra no se parte", noWrap.length === 1);
  const rows = wrapLine("Cantaré de tu amor por siempre y para siempre", [{ index: 0, label: "Am" }, { index: 1, label: "F" }, { index: 30, label: "C" }], 20);
  check("wrapLine: varias filas conservan los 3 acordes", rows.reduce((n, r) => n + r.chords.length, 0) === 3);
  check("wrapLine: cada fila cabe en el ancho (letra)", rows.every((r) => r.lyrics.length <= 20));
  check("wrapLine: el índice es relativo a la fila", rows.every((r) => r.chords.every((c) => c.index >= 0 && c.index <= r.lyrics.length)));
}

// ---- normalizePlainChords: falsos positivos ----
{
  const unchanged = (text: string) => normalizePlainChords(text) === text;
  check('"A" + frase no es acorde', unchanged("A\nTi te canto"));
  check('"E" + frase no es acorde', unchanged("E\nMi alma canta"));
  check('"Mi" + frase no es acorde', unchanged("Mi\nSi tú quieres"));
  check('"Si" + frase no es acorde', unchanged("Si\nhoy me llamas"));
  check('"La" + frase no es acorde', unchanged("La\nluz del mundo"));
  check('"Sol" + frase no es acorde', unchanged("Sol\nque alumbra"));
  check('"Do", "Re", "Fa" sueltos', unchanged("Do\nre mi fa") && unchanged("Re\nTú eres Rey") && unchanged("Fa\nlla lla"));
  check("varias de esas seguidas", unchanged("Mi Dios es grande\nSi tú quieres\nLa gloria es tuya\nA\nTi te canto"));
  check('"A" sola al final', unchanged("Gracias\nA"));

  // Con acordes inequívocos en la canción, una raíz suelta sí es acorde... salvo que siga una frase en minúscula
  const withEvidence = normalizePlainChords("Am   F\nCantaré hoy\n\nA\nTi te canto").split("\n");
  check("con acordes en la canción: A + Letra => [A]Letra", withEvidence[2] === "[A]Ti te canto", withEvidence.join("|"));
  const continuation = normalizePlainChords("Am   F\nCantaré hoy\n\nA\ntodo lo que soy").split("\n");
  check("con acordes en la canción pero la frase sigue en minúscula: no se toca", continuation[2] === "A" && continuation[3] === "todo lo que soy", continuation.join("|"));
  const bracketed = normalizePlainChords("[Am]Cantaré hoy\n\nE\nMi alma canta").split("\n");
  check("con acordes entre corchetes en la canción: E + Letra => acorde", bracketed[2] === "[E]Mi alma canta", bracketed[2]);
  const section = normalizePlainChords("Intro: Am F\nE\nMi alma canta").split("\n");
  check("con una línea Intro: de acordes: E + Letra => acorde", section[1] === "[E]Mi alma canta", section.join("|"));

  // Con sangría es un acorde puesto sobre la letra
  const indented = normalizePlainChords("   A\nTi te canto");
  check("con sangría: es un acorde sobre la letra", indented.includes("[A]") && indented.replace("[A]", "") === "Ti te canto", indented);

  // Lo que ya funcionaba
  check("C + letra corta", normalizePlainChords("C\nsola") === "[C]sola");
  check("G + frase", normalizePlainChords("G\nTe alabo") === "[G]Te alabo");
  check("D + frase en minúscula", normalizePlainChords("D\nhoy canto") === "[D]hoy canto");
  check("Am + frase", normalizePlainChords("Am\nTi te canto") === "[Am]Ti te canto");
  check("F#m7 + frase", normalizePlainChords("F#m7\nTi te canto") === "[F#m7]Ti te canto");
  check("D/F# + frase", normalizePlainChords("D/F#\nTi te canto") === "[D/F#]Ti te canto");
  const two = normalizePlainChords("La        Mi\nEres Tú la única razón");
  check("dos raíces ambiguas (La Mi) siguen siendo acordes", two.includes("[La]") && two.includes("[Mi]"), two);
  const aE = normalizePlainChords("A    E\nTi te canto");
  check("A E (dos tokens) siguen siendo acordes", aE.includes("[A]") && aE.includes("[E]"), aE);
  const lines = normalizePlainChordLines("A\nTi te canto\nG\nTe alabo");
  check("mezcla: una G suelta ya es evidencia de acordes, la A pasa a acorde", same(lines, ["[A]Ti te canto", "[G]Te alabo"]), JSON.stringify(lines));
  check(
    "mezcla sin evidencia: queda como letra",
    same(normalizePlainChordLines("A\nTi te canto\nMi\nSi tú quieres"), ["A", "Ti te canto", "Mi", "Si tú quieres"])
  );
  for (const text of ["A\nTi te canto", "Am   F\nCantaré hoy\n\nA\nTi te canto", "Intro: Am F\nE\nMi alma", "   A\nTi te canto"]) {
    const once = normalizePlainChords(text);
    check(`idempotente: ${JSON.stringify(text.slice(0, 20))}`, normalizePlainChords(once) === once, once);
  }
}

// ---- capoChord / suggestCapo ----
{
  check("capo 2: suena G => se toca F", capoChord("G", 2) === "F");
  check("capo 2: A => G", capoChord("A", 2) === "G");
  check("capo 2: Bm => Am", capoChord("Bm", 2) === "Am");
  check("capo 2: D/F# => C/E", capoChord("D/F#", 2) === "C/E");
  check("capo 3: Bb => G", capoChord("Bb", 3) === "G");
  check("capo 0: igual", capoChord("C#m7", 0) === "C#m7");
  check("capo con bemoles: Eb, capo 1 => D", capoChord("Eb", 1, true) === "D");
  check("capo con bemoles: C, capo 2 => Bb", capoChord("C", 2, true) === "Bb" && capoChord("C", 2) === "A#");
  check("capo con latino: Re, capo 2 => C", capoChord("Re", 2) === "C");
  check("capo 12 vuelve al mismo acorde", capoChord("Am", 12) === "Am");

  check("ya son abiertos: sin cejilla", suggestCapo(["G", "C", "D", "Em"]) === 0);
  check("A D E F#m => capo 2 (G C D Em)", suggestCapo(["A", "D", "E", "F#m"]) === 2);
  check("Bb Eb F Gm => capo 3 (G C D Em)", suggestCapo(["Bb", "Eb", "F", "Gm"]) === 3, String(suggestCapo(["Bb", "Eb", "F", "Gm"])));
  check("F Bb C Dm => capo 3", suggestCapo(["F", "Bb", "C", "Dm"]) === 3, String(suggestCapo(["F", "Bb", "C", "Dm"])));
  check("Bm G D A: tres abiertos sin cejilla; con capo 7 (Em C G D) son cuatro", suggestCapo(["Bm", "G", "D", "A"]) === 7, String(suggestCapo(["Bm", "G", "D", "A"])));
  check("G D A: ya abiertos, el capo no mejora => 0", suggestCapo(["G", "D", "A"]) === 0);
  check("Bm E A F#m => capo 2 (Am D G Em)", suggestCapo(["Bm", "E", "A", "F#m"]) === 2, String(suggestCapo(["Bm", "E", "A", "F#m"])));
  check("sin acordes: 0", suggestCapo([]) === 0);
  check("empate: gana el capo más bajo", suggestCapo(["F#dim"]) === 0);
  check("acepta latino (Si Mi Fa#m = B E F#m => capo 2)", suggestCapo(["Si", "Mi", "Fa#m"]) === 2, String(suggestCapo(["Si", "Mi", "Fa#m"])));
  check("el resultado siempre está entre 0 y 7", ["C#", "F#", "B", "Ab", "Eb"].every((c) => {
    const n = suggestCapo([c, c + "m", c + "7"]);
    return n >= 0 && n <= 7;
  }));
  check("pesa por repetición", suggestCapo(["C", "G", "G", "G", "F#m"]) === 0);
}

// ---- PPTX: tono bemol, nombre de archivo ----
{
  const body = "[G]Hola [C]mundo";
  const sharp = buildRuns(body, 3)[0].text;
  const flat = buildRuns(body, 3, 48, "G")[0].text;
  check("PPTX sin tono original: sostenidos como siempre", sharp.includes("A#") && sharp.includes("D#"), sharp);
  check("PPTX con tono original G +3: Bb y Eb", flat.includes("Bb") && flat.includes("Eb"), flat);
  const layout = paginateSong("[G]Hola [C]mundo\n[D]Todo es tuyo", 3, "G");
  const chordTexts = layout.pages.flatMap((p) => p.columns.flat()).filter((r) => r.options.bold).map((r) => r.text);
  check("paginateSong con tono original", chordTexts.some((t) => t.includes("Bb")), JSON.stringify(chordTexts));
  const defaultLayout = paginateSong("[G]Hola [C]mundo\n[D]Todo es tuyo", 3);
  check("paginateSong sin tono original: sostenidos", defaultLayout.pages.flatMap((p) => p.columns.flat()).some((r) => r.text.includes("A#")));

  const names = pptxFileNames("Adoración Domingo");
  check("nombre ASCII sin tildes", names.ascii === "Adoracion Domingo.pptx", names.ascii);
  check("nombre unicode con tildes", names.unicode === "Adoración Domingo.pptx", names.unicode);
  const header = pptxContentDisposition("Adoración Domingo");
  check("Content-Disposition: filename ASCII", header.includes('filename="Adoracion Domingo.pptx"'), header);
  check("Content-Disposition: filename* RFC 5987", header.includes("filename*=UTF-8''Adoraci%C3%B3n%20Domingo.pptx"), header);
  check("Content-Disposition: solo ASCII imprimible", /^[\x20-\x7e]*$/.test(header), header);
  check("ñ y signos", pptxFileNames("¡Niños! Jóvenes").ascii === "Ninos Jovenes.pptx", pptxFileNames("¡Niños! Jóvenes").ascii);
  check("no quita letras: 'Niños' conserva la ñ en unicode", pptxFileNames("Niños").unicode === "Niños.pptx");
  check("sin nada válido => power", pptxFileNames('///***???').ascii === "power.pptx" && pptxFileNames("").unicode === "power.pptx");
  check("barras y comillas fuera", pptxFileNames('A/B\\C "D"').unicode === "ABC D.pptx", pptxFileNames('A/B\\C "D"').unicode);
  check("saltos de línea fuera (no se puede inyectar un header)", !/[\r\n]/.test(pptxContentDisposition("Hola\r\nSet-Cookie: x=1")));
  check("apóstrofe y paréntesis escapados en filename*", pptxContentDisposition("Dios's (ok)").includes("Dios%27s%20%28ok%29.pptx"), pptxContentDisposition("Dios's (ok)"));
  check("título larguísimo se acota", pptxFileNames("a".repeat(500)).ascii.length <= 105);
}

console.log(`\nRESULTADO: ${passed} OK, ${failures} FAIL`);
process.exit(failures > 0 ? 1 : 0);
