// Runner de los tests e2e: verifica las guardas de seguridad, corre cada archivo en orden y resume.
//
//   E2E_ALLOW_WRITES=1 node e2e/run.mjs            # todo (HTTP + navegador), barrido al final
//   E2E_ALLOW_WRITES=1 node e2e/run.mjs --http     # solo los de HTTP (no necesita Playwright)
//   E2E_ALLOW_WRITES=1 node e2e/run.mjs --ui       # solo los de navegador
//   E2E_ALLOW_WRITES=1 node e2e/run.mjs http-test4 # solo los que contengan ese texto en el nombre
//   node e2e/run.mjs --list                        # muestra el orden y sale (no escribe nada)
//
// Cada archivo también se puede correr por separado (node e2e/http-test4.mjs): las mismas guardas
// valen en todos, porque viven en e2e/lib.mjs.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { safetyProblem } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// El orden importa: el de límite de intentos (http-test6) va casi al final, y el barrido último.
const TESTS = [
  { file: "sweep.mjs", kind: "sweep", when: "before", label: "barrido inicial" },
  { file: "http-test.mjs", kind: "http", label: "auth, búsqueda, canciones y powers" },
  { file: "http-test2.mjs", kind: "http", label: "usuarios, duplicadas, último tono, vista previa" },
  { file: "http-test3.mjs", kind: "http", label: "historial, copiar power, divisores al presentar" },
  { file: "http-test4.mjs", kind: "http", label: "papelera, versiones, sin acordes, limit/offset" },
  { file: "http-test5.mjs", kind: "http", label: "cambio de contraseña y respaldo" },
  { file: "ui-test.mjs", kind: "ui", label: "armador de powers y visor" },
  { file: "ui2-test.mjs", kind: "ui", label: "tema, búsqueda, tamaño de letra" },
  { file: "ui3-test.mjs", kind: "ui", label: "duplicadas, usuarios, último tono, vista previa" },
  { file: "intro-test.mjs", kind: "ui", label: "intro en texto plano cambia de tono" },
  { file: "ui4-test.mjs", kind: "ui", label: "basura al pegar, copiar power, divisores, historial" },
  { file: "http-test6.mjs", kind: "http", label: "límite de intentos de login (429)" },
  { file: "sweep.mjs", kind: "sweep", when: "after", label: "barrido final" },
];

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith("--"));
const flag = (f) => args.includes(f);

if (flag("--help") || flag("-h")) {
  console.log(
    "Uso: E2E_ALLOW_WRITES=1 node e2e/run.mjs [--http] [--ui] [--no-sweep] [--list] [filtro...]\n" +
      "Variables: E2E_URL (default http://localhost:3100), E2E_USER, E2E_PASS, E2E_ALLOW_REMOTE=1, E2E_TIMEOUT_MS."
  );
  process.exit(0);
}

let selected = TESTS.filter((t) => {
  if (t.kind === "sweep") return !flag("--no-sweep");
  if (flag("--http") && !flag("--ui") && t.kind !== "http") return false;
  if (flag("--ui") && !flag("--http") && t.kind !== "ui") return false;
  if (process.env.E2E_SKIP_UI === "1" && t.kind === "ui") return false;
  if (only.length && !only.some((o) => t.file.includes(o))) return false;
  return true;
});
// El barrido solo tiene sentido si corre algo más.
if (!selected.some((t) => t.kind !== "sweep")) selected = [];

if (flag("--list")) {
  for (const t of TESTS) console.log(`${t.file.padEnd(16)} ${t.kind.padEnd(6)} ${t.label}`);
  process.exit(0);
}

// ---- Guardas (a) y (b): sin esto no se corre nada ----
const problem = safetyProblem();
if (problem) {
  console.error("\n[e2e] No se corre.\n" + problem + "\n");
  process.exit(2);
}
if (!selected.length) {
  console.error("[e2e] Ningún test coincide con el filtro. Probá con --list.");
  process.exit(2);
}

const BASE = process.env.E2E_URL ?? "http://localhost:3100";
const TIMEOUT = Number(process.env.E2E_TIMEOUT_MS) || 5 * 60 * 1000;
console.log(`[e2e] Servidor: ${BASE}`);
console.log("[e2e] Estos tests escriben y borran datos (prefijo ZZ_e2e_) en la base que usa ese servidor.\n");

function runOne(t) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [join(here, t.file)], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => {
      out += `\n  FAIL: se pasó del tiempo máximo (${TIMEOUT / 1000}s)\n`;
      child.kill();
    }, TIMEOUT);
    child.stdout.on("data", (d) => {
      out += d;
      process.stdout.write(d);
    });
    child.stderr.on("data", (d) => {
      out += d;
      process.stderr.write(d);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const m = out.match(/(\d+) OK, (\d+) FAIL(?:, (\d+) salteados)?/);
      resolve({
        ...t,
        code,
        ok: m ? Number(m[1]) : 0,
        fail: m ? Number(m[2]) : code === 0 ? 0 : 1,
        skipped: m && m[3] ? Number(m[3]) : 0,
        failures: out.split("\n").filter((l) => /^\s*(FAIL|ERROR)/.test(l)),
        secs: ((Date.now() - started) / 1000).toFixed(1),
        crashed: !m,
      });
    });
  });
}

const results = [];
for (const t of selected) {
  console.log(`\n=== ${t.file} — ${t.label} ===`);
  const res = await runOne(t);
  results.push(res);
  // Si el servidor no está o no deja entrar, no tiene sentido seguir con el resto.
  if (/No se pudo hablar con|No se pudo entrar como dueño/.test(res.failures.join("\n"))) {
    console.error("\n[e2e] Se corta: el servidor no responde o las credenciales no coinciden.");
    break;
  }
}

console.log("\n================ RESUMEN ================");
let totalOk = 0, totalFail = 0, totalSkip = 0;
for (const r of results) {
  totalOk += r.ok;
  totalFail += r.fail;
  totalSkip += r.skipped;
  const state = r.code === 0 && r.fail === 0 ? "OK  " : "FAIL";
  console.log(`${state} ${r.file.padEnd(16)} ${String(r.ok).padStart(3)} ok, ${r.fail} fail${r.skipped ? `, ${r.skipped} salteados` : ""}  (${r.secs}s)${r.crashed ? "  [no terminó]" : ""}`);
}
console.log(`\nTotal: ${totalOk} OK, ${totalFail} FAIL${totalSkip ? `, ${totalSkip} salteados` : ""}`);

const failing = results.filter((r) => r.failures.length);
if (failing.length) {
  console.log("\nQué falló (si es un contrato nuevo de la API, revisá e2e/README.md):");
  for (const r of failing) {
    console.log(`\n  ${r.file}`);
    for (const l of r.failures.slice(0, 15)) console.log("   " + l.trim());
    if (r.failures.length > 15) console.log(`   ... y ${r.failures.length - 15} más`);
  }
}
process.exit(results.some((r) => r.code !== 0 || r.fail > 0) ? 1 : 0);
