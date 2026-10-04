import {
  buildRuns,
  paginateSong,
  wrappedLineCountAt,
  linesPerColumnAt,
  MAX_PAGES_PER_SONG,
  CHORD_COLOR,
} from "./src/lib/pptx-layout";

let failures = 0;
let passed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failures++;
    console.log(`  FAIL: ${name}${detail ? " — " + detail : ""}`);
  }
}

function runCase(name: string, body: string, semitones = 0, expectPagesOverLimit = false) {
  console.log(`\n=== ${name} ===`);
  let layout;
  try {
    layout = paginateSong(body, semitones);
  } catch (e) {
    failures++;
    console.log(`  FAIL: threw an exception — ${(e as Error).message}`);
    return;
  }
  const { fontSize, pages } = layout;
  const linesPerColumn = linesPerColumnAt(fontSize);

  // Las líneas en blanco al borde de una columna se descartan a propósito.
  const totalRunsExpected = buildRuns(body, semitones).filter((r) => r.text.trim()).length;
  const totalRunsGot = pages.reduce(
    (sum, p) => sum + p.columns.reduce((s, c) => s + c.filter((r) => r.text.trim()).length, 0),
    0
  );
  check("no runs lost/duplicated", totalRunsGot === totalRunsExpected, `expected ${totalRunsExpected}, got ${totalRunsGot}`);
  check("at least one page", pages.length >= 1);
  if (expectPagesOverLimit) {
    check(
      "caso de estrés: excede el límite solo porque ni el piso de fuente alcanza (esperado)",
      pages.length > MAX_PAGES_PER_SONG && fontSize === 12
    );
  } else {
    check("respeta el máximo de hojas por canción", pages.length <= MAX_PAGES_PER_SONG, `pages=${pages.length}`);
  }

  pages.forEach((page, pi) => {
    check(`page ${pi}: index matches`, page.index === pi);
    check(`page ${pi}: count matches total pages`, page.count === pages.length);
    check(`page ${pi}: at most 2 columns`, page.columns.length <= 2, `got ${page.columns.length}`);
    check(`page ${pi}: at least 1 non-empty column`, !body.trim() || page.columns.some((c) => c.length > 0));

    page.columns.forEach((col, ci) => {
      const last = col[col.length - 1];
      check(
        `page ${pi} col ${ci}: no termina en un acorde suelto`,
        col.length < 2 || last.options.color !== CHORD_COLOR,
        `última línea: "${last?.text}"`
      );
      check(
        `page ${pi} col ${ci}: no empieza ni termina en blanco`,
        col.length === 0 || (!!col[0].text.trim() && !!last.text.trim())
      );
      const totalLines = col.reduce((s, r) => s + wrappedLineCountAt(r.text, fontSize), 0);
      const overflow = totalLines > linesPerColumn;
      const singleRunTooBig = col.length <= 2 && overflow; // un solo bloque (acorde + letra) más alto que la columna
      check(
        `page ${pi} col ${ci}: fits capacity or is a lone oversized run`,
        !overflow || singleRunTooBig,
        `lines=${totalLines} capacity=${linesPerColumn} runsInCol=${col.length}`
      );
    });
  });

  const wrappedRuns = buildRuns(body, semitones).filter((r) => wrappedLineCountAt(r.text, fontSize) > 1).length;
  console.log(
    `  fontSize=${fontSize} pages=${pages.length} totalRuns=${totalRunsGot} linesPerColumn=${linesPerColumn} runsQueEnvuelven=${wrappedRuns}`
  );
}

// ---- Casos sintéticos ----

runCase("vacía", "");
runCase("una sola línea sin acorde", "Amén");
runCase("una sola línea con acorde", "[Am]Amén");

runCase(
  "corta (coro de 4 líneas)",
  "[C]Santo, [F]santo\n[G]Dios [Am]poderoso\n[C]Digno de [F]adoración\n[G]Te alaba mi [C]corazón"
);

runCase(
  "mediana (2 estrofas + coro)",
  [
    "[Am]Cantaré de tu [F]amor\n[C]Por siempre y [G]para siempre\n[Am]En las buenas y en las [F]malas\n[C]Confiaré en tu [G]promesa",
    "[Am]Cuando todo se [F]oscurece\n[C]Tu luz [G]permanece\n[Am]Eres mi [F]refugio\n[C]Mi fuerza y mi [G]canción",
    "Coro\n[F]Grande es tu [C]fidelidad\n[G]Nunca me has [Am]dejado\n[F]Grande es tu [C]fidelidad\n[G]Por siempre [Am]confiaré",
  ].join("\n\n")
);

runCase(
  "larga (varias estrofas repetidas, necesita varias páginas)",
  Array.from({ length: 8 }, (_, i) =>
    `Estrofa ${i + 1}\n[Am]Línea uno de la estrofa número ${i + 1}\n[F]Línea dos con más pa[C]labras para ocupar espacio\n[G]Línea tres cerrando la [Am]idea de esta parte\n[F]Y una cuarta línea [C]final de remate`
  ).join("\n\n")
);

runCase(
  "muy larga (canción tipo maratón, muchas repeticiones — caso de estrés: 25 líneas de ~65 caracteres cada una, más larga que cualquier canción real de la base)",
  Array.from({ length: 25 }, (_, i) =>
    `[Am]Repetición ${i + 1}: mientras yo a[F]labo, Él pe[C]lea mis bata[G]llas por mí`
  ).join("\n\n"),
  0,
  true
);

runCase(
  "extremadamente larga (50 estrofas — caso de estrés fuera de todo uso real, ninguna canción real llega ni de cerca)",
  Array.from({ length: 50 }, (_, i) =>
    `Estrofa ${i + 1}\n[Am]Línea uno de la estrofa número ${i + 1} con bastante texto\n[F]Línea dos con más pa[C]labras para ocupar espacio real\n[G]Línea tres cerrando la [Am]idea de esta parte del todo\n[F]Y una cuarta línea [C]final de remate bien larga también`
  ).join("\n\n"),
  0,
  true
);

runCase(
  "línea muy larga (una sola línea gigante)",
  "[Am]Esta es una línea extremadamente larga que probablemente no entra en una sola línea de la columna sin envolverse varias veces y hay que ver cómo se comporta[F]"
);

runCase(
  "muchos acordes en una sola línea (intro tipo tablatura)",
  "[Am][F][C][G][Am][F][C][G][Am][F][C][G]"
);

runCase(
  "acentos y signos en español",
  "[Am]¿Quién como tú, señor?\n[F]¡Ríos de aguas vivas fluirán!\n[C]Corazón, pasión, oración, canción\n[G]Ñoño baña su niñez con años de jubileo"
);

runCase(
  "líneas en blanco extra (dobles/triples) entre estrofas",
  "[Am]Primera línea\n[F]Segunda línea\n\n\n\n[C]Después de varias líneas en blanco\n[G]Sigue la canción"
);

runCase(
  "blanco al principio y al final",
  "\n\n[Am]Recién empieza acá\n[F]Y termina acá\n\n\n"
);

runCase(
  "transportada +5 semitonos",
  "[Am]Cantaré de tu [F]amor\n[C]Por siempre y [G]para siempre",
  5
);

runCase(
  "muchos acordes juntos en pocos caracteres (como Desierto en Paraíso)",
  "MIS T[Cm]IERRAS SECAS AHORA SON HU[D]ERT[C]OS D[Bb]E JE[A]HOV[G]Á"
);

// ---- Texto plano (acordes arriba, letra abajo) ----
{
  console.log("\n=== texto plano: Te alabaré ===");
  const plain = [
    "E               B",
    "Eres Tú la única razón de mi",
    "C#m7             A",
    "adoración, !oh Jesús!",
    "F#m7                       E",
    "    confié en tí me has ayudado",
    "E                Bsus4",
    "hoy hay gozo en mi corazón",
    "      A            B",
    "con mi canto te alabaré",
    "",
    "F#     C#  D#m7        B",
    "te alabaré mi buen Jesús",
  ].join("\n");
  const runs = buildRuns(plain, 0);
  const chordRuns = runs.filter((r) => r.options.color === CHORD_COLOR);
  check("texto plano: los 6 renglones de acordes salen en rojo", chordRuns.length === 6, `got ${chordRuns.length}`);
  const idx = runs.findIndex((r) => r.text.trim() === "con mi canto te alabaré");
  check("texto plano: acorde pegado a su letra", idx > 0 && runs[idx - 1].options.color === CHORD_COLOR);
  check("texto plano: la letra no se pinta de rojo", runs[idx].options.color !== CHORD_COLOR);
  // Dos columnas con pocas líneas: el corte nunca debe dejar un acorde solo al final.
  runCase("texto plano completo", plain);
  runCase("texto plano transportado", plain, 2);
}

console.log(`\n\nRESULTADO: ${passed} OK, ${failures} FAIL`);
process.exit(failures > 0 ? 1 : 0);
