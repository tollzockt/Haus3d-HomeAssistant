// Alle Browser-Tests: shot.mjs (Gesamtlauf) und shot-<etappe>.mjs.
// NODE_PATH="$(npm root -g)" node tests/browser/run.mjs <ausgabeordner> [filter] [--jobs N]
// --jobs N (oder HAUS3D_JOBS=N) lässt N Dateien gleichzeitig laufen – lohnt sich auf Rechnern mit vielen Kernen.
import { spawn } from "node:child_process";
import { readdirSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const j = args.indexOf("--jobs");
const jobs = Math.max(1, Number(j >= 0 ? args.splice(j, 2)[1] : process.env.HAUS3D_JOBS) || 1);
const out = args[0] ?? join(tmpdir(), "haus3d-shots");
const filter = args[1] ?? "";
mkdirSync(out, { recursive: true });
const files = ["shot.mjs", ...readdirSync(here).filter((f) => /^shot-.+\.mjs$/.test(f)).sort()].filter((f) => f.includes(filter));

/** Eine Testdatei ausführen; Ausgabe gesammelt zurück (höchstens 15 min). */
function runOne(f) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(here, f), out], { env: process.env });
    let text = "";
    child.stdout.on("data", (d) => (text += d));
    child.stderr.on("data", (d) => (text += d));
    const timer = setTimeout(() => child.kill(), 900000);
    child.on("close", (status) => {
      clearTimeout(timer);
      done({ f, status, text });
    });
  });
}

let failed = 0;
let next = 0;
async function worker() {
  while (next < files.length) {
    const { f, status, text } = await runOne(files[next++]);
    // nur die Fehlerliste zeigen (die Ergebnisse stehen in der vollen Ausgabe)
    const m = text.match(/"errors": \[[\s\S]*?\]/g);
    const errs = m ? m[m.length - 1] : "(keine Fehlerliste – Abbruch?)";
    const ok = status === 0 && /"errors": \[\]/.test(errs);
    if (!ok) failed++;
    console.log(`${ok ? "OK  " : "FEHL"} ${f}${ok ? "" : `\n${errs}\n${text.slice(-1500)}`}`);
  }
}
await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, worker));
process.exitCode = failed ? 1 : 0;
