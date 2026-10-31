import { collapseSame, diffLines, hasChanges } from "./src/lib/lineDiff";
import { computeStats, daysBetween, lastMonths, usageDay, type StatSong } from "./src/lib/statsCalc";
import { summarizeBackup } from "./src/lib/backupFile";
import { daysSince, timeAgo } from "./src/lib/timeAgo";

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
const render = (d: { kind: string; text?: string }[]) =>
  d.map((l) => ({ same: " ", added: "+", removed: "-", gap: "~" })[l.kind as "same"] + (l.text ?? "")).join("|");

// ---- diffLines ----
{
  check("diff: textos iguales", render(diffLines("a\nb", "a\nb")) === " a| b");
  check("diff: textos iguales sin cambios", !hasChanges(diffLines("a\nb", "a\nb")));
  check("diff: línea agregada al medio", render(diffLines("a\nc", "a\nb\nc")) === " a|+b| c");
  check("diff: línea quitada", render(diffLines("a\nb\nc", "a\nc")) === " a|-b| c");
  check("diff: línea cambiada = quitada + agregada", render(diffLines("a\n[Am]x\nc", "a\n[C]x\nc")) === " a|-[Am]x|+[C]x| c");
  check("diff: desde vacío", render(diffLines("", "a\nb")) === "+a|+b");
  check("diff: hacia vacío", render(diffLines("a\nb", "")) === "-a|-b");
  check("diff: ambos vacíos", diffLines("", "").length === 0);
  check("diff: CRLF se trata como LF", !hasChanges(diffLines("a\r\nb", "a\nb")));
  const d = diffLines("1\n2\n3\n4\n5", "1\n3\n4\nX\n5");
  check("diff: LCS mixto", render(d) === " 1|-2| 3| 4|+X| 5", render(d));
  // Reconstruir: same+added == to ; same+removed == from
  const from = "uno\ndos\ntres\ncuatro\ncinco\nseis";
  const to = "uno\nDOS\ntres\ncinco\nseis\nsiete";
  const dd = diffLines(from, to);
  check(
    "diff: same+added reconstruye el destino",
    dd.filter((l) => l.kind !== "removed").map((l) => l.text).join("\n") === to
  );
  check(
    "diff: same+removed reconstruye el origen",
    dd.filter((l) => l.kind !== "added").map((l) => l.text).join("\n") === from
  );
  // Texto grande: no se cuelga
  const big1 = Array.from({ length: 3000 }, (_, i) => `l${i}`).join("\n");
  const big2 = Array.from({ length: 3000 }, (_, i) => `m${i}`).join("\n");
  const bd = diffLines(big1, big2);
  check("diff: texto enorme muy distinto devuelve todo cambiado", bd.length === 6000 && bd.every((l) => l.kind !== "same"));
}

// ---- collapseSame ----
{
  const lines = diffLines(
    ["a", "b", "c", "d", "e", "f", "g", "h"].join("\n"),
    ["a", "b", "c", "d", "E", "f", "g", "h"].join("\n")
  );
  const out = collapseSame(lines, 1);
  check("collapse: deja contexto y esconde el resto", render(out) === "~| d|-e|+E| f|~", render(out));
  check(
    "collapse: cuenta las líneas escondidas",
    same(out[0], { kind: "gap", hidden: 3 }) && same(out[out.length - 1], { kind: "gap", hidden: 2 }),
    JSON.stringify(out)
  );
  check("collapse: sin cambios todo queda escondido", same(collapseSame(diffLines("a\nb", "a\nb"), 2), [{ kind: "gap", hidden: 2 }]));
  check("collapse: vacío", collapseSame([], 2).length === 0);
}

// ---- statsCalc ----
const mk = (id: string, over: Partial<StatSong> = {}): StatSong => ({
  id,
  title: `Canción ${id}`,
  artist: "X",
  originalKey: "G",
  tags: [],
  hasChords: true,
  ...over,
});
{
  check("lastMonths: cruza el año", same(lastMonths("2026-02-10", 4), ["2025-11", "2025-12", "2026-01", "2026-02"]));
  check("daysBetween", daysBetween("2026-10-01", "2026-10-31") === 30 && daysBetween("2026-11-05", "2026-10-31") === -5);
  check("usageDay: usa serviceDate", usageDay("2026-03-15", new Date("2026-04-01T12:00:00Z")) === "2026-03-15");
  check("usageDay: sin serviceDate usa updatedAt en hora de Buenos Aires", usageDay(null, new Date("2026-04-01T01:30:00Z")) === "2026-03-31");
}
{
  const songs = [
    mk("a", { title: "Alfa", tags: ["Alabanza"], originalKey: "G" }),
    mk("b", { title: "Beta", tags: ["Alabanza", "Ofrenda"], originalKey: "G", hasChords: false }),
    mk("c", { title: "Gama", tags: [], originalKey: "D" }),
    mk("d", { title: "Delta", tags: ["Adoración"], originalKey: "A" }),
  ];
  const setlists = [
    { id: "1", songIds: ["a", "b", "a"], usedOn: "2026-10-25" }, // 'a' repetida en el mismo power: cuenta 1
    { id: "2", songIds: ["a", "ghost"], usedOn: "2026-08-02" }, // 'ghost' no existe: se ignora
    { id: "3", songIds: ["b"], usedOn: "2025-09-10" },
    { id: "4", songIds: ["d"], usedOn: "2026-07-01" },
  ];
  const s = computeStats(songs, setlists, { today: "2026-10-31", staleDays: 60 });
  check("stats: totales", s.totals.songs === 4 && s.totals.setlists === 4 && s.totals.withoutChords === 1, JSON.stringify(s.totals));
  check("stats: top usadas ordenado", same(s.topUsed.map((t) => [t.id, t.uses, t.lastUsed]), [["a", 2, "2026-10-25"], ["b", 2, "2026-10-25"], ["d", 1, "2026-07-01"]]), JSON.stringify(s.topUsed));
  check("stats: 'c' nunca usada cuenta", s.neverUsed === 1);
  // 60 días: d (2026-07-01 = 122 días) y c (nunca). a y b se usaron hace 6 días.
  check("stats: stale 60 días (nunca primero)", same(s.stale.map((t) => t.id), ["c", "d"]), JSON.stringify(s.stale));
  check("stats: stale muestra días", s.stale[1].daysAgo === 122 && s.stale[0].lastUsed === null);
  const s2 = computeStats(songs, setlists, { today: "2026-10-31", staleDays: 150 });
  check("stats: stale 150 días excluye d", same(s2.stale.map((t) => t.id), ["c"]));
  const s3 = computeStats(songs, setlists, { today: "2026-10-31", staleDays: 5 });
  check("stats: stale 5 días incluye a y b", s3.staleTotal === 4);
  check("stats: tonos", same(s.keys, [{ label: "G", count: 2 }, { label: "A", count: 1 }, { label: "D", count: 1 }]), JSON.stringify(s.keys));
  check(
    "stats: tags (incluye Sin etiqueta)",
    same(s.tags, [
      { label: "Alabanza", count: 2 },
      { label: "Adoración", count: 1 },
      { label: "Ofrenda", count: 1 },
      { label: "Sin etiqueta", count: 1 },
    ]),
    JSON.stringify(s.tags)
  );
  check("stats: 12 meses, el último es el actual", s.setlistsByMonth.length === 12 && s.setlistsByMonth[11].month === "2026-10");
  const byMonth = Object.fromEntries(s.setlistsByMonth.map((m) => [m.month, m.count]));
  check("stats: powers por mes", byMonth["2026-10"] === 1 && byMonth["2026-08"] === 1 && byMonth["2026-07"] === 1 && !("2025-09" in byMonth));
}
{
  const empty = computeStats([], [], { today: "2026-10-31", staleDays: 60 });
  check("stats: base vacía no rompe", empty.totals.songs === 0 && empty.topUsed.length === 0 && empty.stale.length === 0);
  const many = Array.from({ length: 30 }, (_, i) => mk(`s${i}`));
  const sl = many.map((s, i) => ({ id: `p${i}`, songIds: [s.id], usedOn: "2026-10-01" }));
  check("stats: top limitado a 15", computeStats(many, sl, { today: "2026-10-31", staleDays: 60 }).topUsed.length === 15);
}

// ---- summarizeBackup ----
{
  const ok = summarizeBackup(JSON.stringify({ songs: [{}, {}], setlists: [{}], versions: [{}, {}, {}] }));
  check("backup: resumen", ok.ok && ok.songs === 2 && ok.setlists === 1 && ok.versions === 3);
  const noVersions = summarizeBackup(JSON.stringify({ songs: [], setlists: [{}] }));
  check("backup: sin versiones", noVersions.ok && noVersions.versions === 0 && noVersions.songs === 0);
  check("backup: JSON roto", !summarizeBackup("{nope").ok);
  check("backup: array no es respaldo", !summarizeBackup("[]").ok);
  check("backup: null", !summarizeBackup("null").ok);
  check("backup: sin songs ni setlists", !summarizeBackup(JSON.stringify({ foo: 1 })).ok);
  check("backup: songs no es array", !summarizeBackup(JSON.stringify({ songs: "x", setlists: [] })).ok);
}

// ---- timeAgo ----
{
  const now = Date.UTC(2026, 9, 31, 12, 0, 0);
  const ago = (ms: number) => timeAgo(now - ms, now);
  const H = 3600_000;
  const D = 24 * H;
  check("timeAgo: un momento", ago(5_000) === "hace un momento");
  check("timeAgo: minutos", ago(5 * 60_000) === "hace 5 minutos" && ago(60_000) === "hace 1 minuto");
  check("timeAgo: horas", ago(3 * H) === "hace 3 horas");
  check("timeAgo: días", ago(2 * D) === "hace 2 días" && ago(1 * D) === "hace 1 día");
  check("timeAgo: semanas", ago(21 * D) === "hace 3 semanas");
  check("timeAgo: meses", ago(95 * D) === "hace 3 meses");
  check("timeAgo: años", ago(800 * D) === "hace 2 años");
  check("timeAgo: futuro no da negativos", ago(-5 * D) === "hace un momento");
  check("daysSince", daysSince(now - 12 * D - H, now) === 12);
}

console.log(`RESULTADO: ${passed} OK, ${failures} FAIL`);
process.exit(failures > 0 ? 1 : 0);
