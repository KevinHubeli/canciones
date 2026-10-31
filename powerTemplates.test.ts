import { DIVIDER_NAMES, mergeEntries, splitEntries, type SetlistEntry } from "./src/lib/dividers";
import {
  POWER_TEMPLATES,
  applyTemplate,
  daysAgoText,
  getTemplate,
  insertInSection,
  templateDividers,
} from "./src/lib/powerTemplates";

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
const label = (e: SetlistEntry<string>) => (e.kind === "divider" ? `#${e.name}` : e.song);

// ---- Las plantillas en sí ----
{
  check("hay al menos Domingo y Jueves íntimo", !!getTemplate("domingo") && !!getTemplate("jueves-intimo"));
  check("getTemplate de algo inexistente => undefined", getTemplate("nada") === undefined);
  const ids = POWER_TEMPLATES.map((t) => t.id);
  check("ids únicos", new Set(ids).size === ids.length);
  for (const t of POWER_TEMPLATES) {
    check(`${t.id}: solo nombres de divisor válidos`, t.sections.every((s) => (DIVIDER_NAMES as readonly string[]).includes(s.name)));
    check(`${t.id}: pesos positivos`, t.sections.every((s) => s.weight > 0));
    const order = t.sections.map((s) => DIVIDER_NAMES.indexOf(s.name));
    check(`${t.id}: respeta el orden ALABANZA..FINAL`, order.every((v, i) => i === 0 || v > order[i - 1]), order.join());
    check(`${t.id}: termina en FINAL`, t.sections[t.sections.length - 1].name === "FINAL");
  }
}

// ---- templateDividers ----
{
  const domingo = getTemplate("domingo")!;
  const empty = templateDividers(domingo, 0);
  check(
    "sin canciones: todos en 0, en orden",
    empty.length === 5 && empty.every((d) => d.position === 0) && same(empty.map((d) => d.name), domingo.sections.map((s) => s.name))
  );
  const eleven = templateDividers(domingo, 11);
  check(
    "11 canciones: primera sección arranca en 0 y las posiciones no bajan",
    eleven[0].position === 0 && eleven.every((d, i) => i === 0 || d.position >= eleven[i - 1].position),
    JSON.stringify(eleven)
  );
  check("11 canciones: nunca se pasa de la cantidad", eleven.every((d) => d.position <= 11));
  check("11 canciones: reparto proporcional (4,3,1,2,1)", same(eleven.map((d) => d.position), [0, 4, 7, 8, 10]), JSON.stringify(eleven.map((d) => d.position)));
  const three = templateDividers(domingo, 3);
  check("3 canciones: posiciones en rango y ordenadas", three.every((d, i) => d.position >= 0 && d.position <= 3 && (i === 0 || d.position >= three[i - 1].position)));
  check("NaN o negativo => como 0", templateDividers(domingo, NaN).every((d) => d.position === 0) && templateDividers(domingo, -4).every((d) => d.position === 0));
  check("decimales se truncan", same(templateDividers(domingo, 11.9), eleven));
  const odd = templateDividers(
    { id: "x", label: "x", description: "", sections: [{ name: "ALABANZA", weight: 0 }, { name: "FINAL", weight: NaN }] },
    4
  );
  check("pesos inválidos cuentan como 1", same(odd.map((d) => d.position), [0, 2]), JSON.stringify(odd));
  check("plantilla sin secciones => []", templateDividers({ id: "x", label: "x", description: "", sections: [] }, 5).length === 0);
}

// ---- applyTemplate ----
{
  const domingo = getTemplate("domingo")!;
  const songs = ["a", "b", "c", "d", "e", "f"];
  const start: SetlistEntry<string>[] = mergeEntries(songs, [{ name: "FINAL", position: 2 }]);
  const applied = applyTemplate(start, domingo);
  const back = splitEntries(applied);
  check("apply: las canciones quedan iguales y en el mismo orden", same(back.songs, songs));
  check("apply: reemplaza los divisores anteriores", back.dividers.length === 5 && same(back.dividers.map((d) => d.name), domingo.sections.map((s) => s.name)));
  check("apply: arranca con el primer divisor", applied[0].kind === "divider" && (applied[0] as { name: string }).name === "ALABANZA");
  const emptyApplied = applyTemplate<string>([], getTemplate("jueves-intimo")!);
  check("apply: power vacío => solo divisores en orden", same(emptyApplied.map(label), ["#ALABANZA", "#ADORACIÓN", "#MINISTRACIÓN", "#FINAL"]), emptyApplied.map(label).join());
  check("apply: es idempotente", same(applyTemplate(applied, domingo), applied));
}

// ---- insertInSection ----
{
  const e = mergeEntries(["a", "b", "c"], [
    { name: "ALABANZA", position: 0 },
    { name: "OFRENDA", position: 2 },
    { name: "FINAL", position: 3 },
  ]);
  const song = (s: string): SetlistEntry<string> => ({ kind: "song", song: s });
  // [#ALABANZA, a, b, #OFRENDA, c, #FINAL]
  check("insert: al final de la primera sección", same(insertInSection(e, 0, song("x")).map(label), ["#ALABANZA", "a", "b", "x", "#OFRENDA", "c", "#FINAL"]));
  check("insert: en la sección del medio", same(insertInSection(e, 3, song("x")).map(label), ["#ALABANZA", "a", "b", "#OFRENDA", "c", "x", "#FINAL"]));
  check("insert: en la última sección va al final", same(insertInSection(e, 5, song("x")).map(label), ["#ALABANZA", "a", "b", "#OFRENDA", "c", "#FINAL", "x"]));
  check("insert: null => al final", insertInSection(e, null, song("x")).map(label).pop() === "x");
  check(
    "insert: índice que no es divisor o fuera de rango => al final",
    insertInSection(e, 1, song("x")).map(label).pop() === "x" &&
      insertInSection(e, 99, song("x")).map(label).pop() === "x" &&
      insertInSection(e, -1, song("x")).map(label).pop() === "x"
  );
  check(
    "insert: sección vacía (dos divisores seguidos)",
    same(
      insertInSection(mergeEntries([] as string[], [{ name: "ALABANZA", position: 0 }, { name: "FINAL", position: 0 }]), 0, song("x")).map(label),
      ["#ALABANZA", "x", "#FINAL"]
    )
  );
  check("insert: no muta la lista original", e.length === 6);
}

// ---- daysAgoText ----
{
  const now = Date.UTC(2026, 9, 31, 12, 0, 0);
  const ago = (d: number) => new Date(now - d * 86_400_000).toISOString();
  check("hoy", daysAgoText(ago(0), now) === "hoy");
  check("fecha futura => hoy", daysAgoText(ago(-3), now) === "hoy");
  check("ayer", daysAgoText(ago(1), now) === "ayer");
  check("hace 5 días", daysAgoText(ago(5), now) === "hace 5 días");
  check("hace 3 semanas", daysAgoText(ago(21), now) === "hace 3 semanas", daysAgoText(ago(21), now));
  check("hace 4 meses", daysAgoText(ago(125), now) === "hace 4 meses", daysAgoText(ago(125), now));
  check("hace un año / 2 años", daysAgoText(ago(400), now) === "hace un año" && daysAgoText(ago(800), now) === "hace 2 años");
  check("fecha inválida => vacío", daysAgoText("nada", now) === "" && daysAgoText(ago(1), NaN) === "");
}

console.log(`\nRESULTADO: ${passed} OK, ${failures} FAIL`);
process.exit(failures > 0 ? 1 : 0);
