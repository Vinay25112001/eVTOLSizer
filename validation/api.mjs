/* =====================================================================
   ENGINE API GATE — the package researchers call is the engine the app runs
   =====================================================================
   Checks the Node API (src/api.js, imported by its package name exactly as
   a user would) and the `evtol-size` command against the app's own path,
   and that docs/API.md documents every export. A documented API that has
   drifted from the code is worse than none: it is the one a script trusts.
   ===================================================================== */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { runSizing } from "../src/engine.js";
import { engineInputs, resolveInputs } from "../src/lib/designfile.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("ENGINE API GATE");
console.log("=".repeat(72));

const pkg = JSON.parse(read("package.json"));
let api = null;
try { api = await import(pkg.name); } catch (e) { check("the package imports by its own name", false, e.message); }
if (api) {
  check("the package imports by its own name", true, pkg.name);

  /* ── same numbers as the app ─────────────────────────────────────── */
  const cases = [{}, { configType: "tiltrotor", payload: 450, range: 120 },
                 { configType: "multicopter", payload: 200, range: 35, reserveBasis: "distance", reserveDistanceKm: 10 }];
  let same = true;
  for (const c of cases) {
    const a = api.size(c).result, b = runSizing(engineInputs(resolveInputs(c)));
    if (a.MTOW !== b.MTOW || a.Etot !== b.Etot) same = false;
  }
  check("size() returns the app's result for the same inputs", same);
  const r = api.size({ configType: "hybridPusher" });
  check("size() returns warnings and the domain with the numbers",
        Array.isArray(r.warnings) && r.warnings.length > 0 && r.domain && r.domain.insideValidation === false);
  check("sizeMany() sizes each case", api.sizeMany(cases).length === cases.length);
  const bad = api.size({ payload: 900, range: 250, ewf: 0.66, weightModel: "fraction" });
  check("a design that does not close reports converged: false", bad.converged === false);

  /* ── design files ─────────────────────────────────────────────────── */
  const rec = api.designRecord({ payload: 300 }, { name: "api" });
  check("records made through the API carry the package version", rec.engine.version === pkg.version && rec.engine.mode === "node-api",
        JSON.stringify(rec.engine));
  check("reopen() reproduces a record", api.reopen(JSON.stringify(rec)).continuity.status === "identical");
  check("engineVersion() reports the package and format versions",
        api.engineVersion().version === pkg.version && api.engineVersion().designFormatVersion >= 1);

  /* ── the documentation lists every export ─────────────────────────── */
  const doc = read("docs/API.md");
  const undocumented = Object.keys(api).filter(k => !new RegExp("`" + k + "[`(]").test(doc));
  check("docs/API.md documents every export", undocumented.length === 0, undocumented.join(", ") || `${Object.keys(api).length} exports`);
}

/* ── the command ─────────────────────────────────────────────────────── */
const cli = (args, input) => spawnSync(process.execPath, [join(ROOT, "bin", "evtol-size.mjs"), ...args],
  { input, encoding: "utf8", cwd: ROOT });
{
  const v = cli(["--version"]);
  check("evtol-size --version names the package version", v.status === 0 && v.stdout.includes(pkg.version), v.stdout.trim());
  check("a clean design exits 0", cli(["-"], "{}").status === 0);
  check("a design that does not close exits 1",
        cli(["-"], JSON.stringify({ payload: 900, range: 250, ewf: 0.66, weightModel: "fraction" })).status === 1);
  check("unreadable input exits 2", cli(["-"], "not json").status === 2 && cli(["no-such-file.json"]).status === 2);
  const many = cli(["-", "--json"], JSON.stringify([{}, { configType: "sideBySide" }]));
  const lines = many.stdout.trim().split("\n").map(l => JSON.parse(l));
  check("an array gives one JSON line per case, each with its warnings",
        lines.length === 2 && lines.every(l => Array.isArray(l.warnings) && l.result && l.domain));
  if (api) {
    const dir = mkdtempSync(join(tmpdir(), "evtol-api-"));
    const f = join(dir, "d.evtol.json");
    writeFileSync(f, JSON.stringify(api.designRecord({ payload: 250 })));
    const ro = cli([f, "--reopen"]);
    check("--reopen reproduces a saved design file and exits 0", ro.status === 0 && /^identical/.test(ro.stdout), ro.stdout.trim());
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ── the browser bundle never pulls in the Node-only entry point ─────── */
{
  const hits = [];
  const walk = (d) => {
    for (const e of readdirSync(join(ROOT, d))) {
      const rel = `${d}/${e}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.(js|jsx)$/.test(e) && rel !== "src/api.js" && /from\s+["'][./]*api(\.js)?["']/.test(read(rel))) hits.push(rel);
    }
  };
  walk("src");
  check("no app module imports src/api.js (it uses node:fs)", hits.length === 0, hits.join(", "));
  check("package.json exports the API and the command",
        pkg.exports?.["."] === "./src/api.js" && pkg.bin?.["evtol-size"] === "bin/evtol-size.mjs");
}

console.log("");
console.log(fail ? `ENGINE API GATE FAILED: ${fail} check(s)` : `ENGINE API GATE PASSED (${pass} checks)`);
process.exit(fail ? 1 : 0);
