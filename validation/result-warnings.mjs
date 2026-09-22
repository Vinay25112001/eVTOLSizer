/* =====================================================================
   RESULT-WARNINGS GATE — NASA-STD-7009B §4.3.8 on every result
   =====================================================================
   [M&S 32] requires explicit warnings, each with "at least a qualitative
   estimate of the impact", for eight kinds of occurrence; [M&S 33] an
   uncertainty estimate or a clear statement that none is available;
   [M&S 26] a placard when results come from outside the domains of V&V.
   src/lib/warnings.js and src/lib/domain.js build those. This gate checks
   that they fire when they should, stay quiet when they should, and that
   the app and the report both show them.
   ===================================================================== */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runSizing } from "../src/engine.js";
import { DEFAULT_PARAMS } from "../src/lib/defaults.js";
import { engineInputs } from "../src/lib/designfile.js";
import { resultWarnings, uncertaintyStatement, CATEGORIES } from "../src/lib/warnings.js";
import { assessDomain, DOMAIN } from "../src/lib/domain.js";
import { OUTPUTS } from "../src/lib/provenance.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (f) => readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const size = (p) => runSizing(engineInputs(p));
const LAYOUTS = ["liftcruise", "hybrid", "hybridPusher", "tiltrotor", "multicopter", "sideBySide"];

console.log("═".repeat(72));
console.log("RESULT WARNINGS — NASA-STD-7009B [M&S 26], [M&S 32]-[M&S 34]");
console.log("═".repeat(72));

/* ── 1. every item is well-formed ─────────────────────────────────── */
console.log("\n1. Every warning names its category and states its impact");
const cases = [
  ...LAYOUTS.map(c => ({ ...DEFAULT_PARAMS, configType: c })),
  { ...DEFAULT_PARAMS, payload: 900, range: 250 },
  { ...DEFAULT_PARAMS, payload: 900, range: 250, ewf: 0.66, weightModel: "fraction" },
];
const ids = new Set(CATEGORIES.map(c => c[0]));
let bad = [];
for (const p of cases) {
  const w = resultWarnings({ params: p, R: size(p) });
  for (const i of w.items) {
    if (!ids.has(i.cat) || !i.text || !i.impact || !["error", "warning", "info"].includes(i.severity)) bad.push(`${p.configType}:${i.cat}:${i.text?.slice(0, 40)}`);
  }
  if (!w.items.some(i => i.cat === "e") || !w.items.some(i => i.cat === "g")) bad.push(`${p.configType}: missing standing e/g`);
}
check("every item has a known category, a severity, text and an impact; e and g always present", bad.length === 0, bad.slice(0, 3).join(" | "));
check("all eight [M&S 32] categories a-h are defined", CATEGORIES.map(c => c[0]).join("") === "abcdefgh");

/* ── 2. domains ─────────────────────────────────────────────────── */
console.log("\n2. [M&S 26] domain placards");
for (const c of LAYOUTS) {
  const p = { ...DEFAULT_PARAMS, configType: c };
  const d = assessDomain(p, size(p));
  const expectValidated = Array.isArray(DOMAIN.validation.layouts[c]);
  check(`default ${c}: inside the verified domain; ${expectValidated ? "inside" : "OUTSIDE"} the validated one`,
        d.insideVerification && d.insideValidation === expectValidated,
        d.excursions.map(x => `${x.domain}:${x.key}`).join(", ") || "no excursions");
}
{
  const p = { ...DEFAULT_PARAMS, payload: 900, range: 250 };
  const R = size(p);
  const d = assessDomain(p, R);
  const pay = d.excursions.find(x => x.domain === "validation" && x.key === "payload");
  const hi = DOMAIN.validation.envelope.payload.max;
  check("a payload above the validated envelope is placarded with its extent",
        pay && Math.abs(pay.extentPct - 100 * (900 - hi) / hi) < 1e-9 && pay.side === "above",
        pay ? `${pay.extentPct.toFixed(1)}% above ${hi} kg` : "not placarded");
  const w = resultWarnings({ params: p, R });
  const c = w.items.filter(i => i.cat === "c" && /validated range/.test(i.text));
  check("…and the consequence says the error there is unknown", c.length > 0 && c.every(i => /unknown/.test(i.impact)));
  const low = { ...DEFAULT_PARAMS, LD: 4 };
  check("an input below the verified sweep is placarded as a verification excursion",
        assessDomain(low, size(low)).excursions.some(x => x.domain === "verification" && x.key === "LD"));
}
{
  const p = { ...DEFAULT_PARAMS, configType: "hybrid", powertrain: "turboelectric" };
  const d = assessDomain(p, size(p));
  check("a turboelectric hybrid is outside the validated domain (only a turboelectric lift+cruise was compared)",
        !d.insideValidation && d.excursions.some(x => x.key === "configType" && /turboelectric/.test(x.detail)));
  const q = { ...DEFAULT_PARAMS, configType: "liftcruise", powertrain: "turboelectric" };
  const wq = resultWarnings({ params: q, R: size(q) });
  check("its measured shortfall is listed under outstanding defects",
        wq.items.some(i => i.cat === "h" && /turboelectric/.test(i.text)));
}
check("the verified sweep covers every default input it names",
      Object.entries(DOMAIN.verification.sweep).every(([k, [lo, hi]]) => {
        const v = engineInputs(DEFAULT_PARAMS)[k]; return v == null || (v >= lo && v <= hi);
      }));

/* ── 3. execution, acceptance, assumptions ──────────────────────── */
console.log("\n3. [M&S 32] a, b, d fire from what the engine reports");
{
  const p = { ...DEFAULT_PARAMS, payload: 900, range: 250, ewf: 0.66, weightModel: "fraction" };
  const R = size(p);
  const w = resultWarnings({ params: p, R });
  check("a diverged design raises an execution error saying not to use the numbers",
        R.r2Diverged && w.items.some(i => i.cat === "d" && i.severity === "error" && /not converge/.test(i.text) && /Do not use/.test(i.impact)));
  const hard = R.checks.filter(c => !c.ok && !c.kind).length;
  check("every failed hard check becomes an acceptance-criteria error",
        w.items.filter(i => i.cat === "a" && i.severity === "error").length === hard, `${hard} failed`);
  const fake = { ...size(DEFAULT_PARAMS), _stageErrors: { acoustics: "boom" } };
  check("a failed analysis stage becomes an execution error",
        resultWarnings({ params: DEFAULT_PARAMS, R: fake }).items.some(i => i.cat === "d" && /acoustics/.test(i.text)));
  check("no result at all is an execution error",
        resultWarnings({ params: DEFAULT_PARAMS, R: null }).items.some(i => i.cat === "d" && i.severity === "error"));
  const q = { ...DEFAULT_PARAMS, configType: "sideBySide" };
  const Rq = size(q);
  const omissions = Rq.checks.filter(c => !c.ok && c.kind && c.kind !== "advisory").length;
  check("a modelling omission on this layout becomes an assumptions warning",
        omissions > 0 && resultWarnings({ params: q, R: Rq }).items.filter(i => i.cat === "b").length === omissions,
        `${omissions} omission check(s) failing on the side-by-side`);
  const def = resultWarnings({ params: DEFAULT_PARAMS, R: size(DEFAULT_PARAMS) });
  check("the default design raises no errors", def.counts.error === 0, JSON.stringify(def.counts));
  check("a fraction-model run does not claim the build-up fell back",
        !resultWarnings({ params: { ...DEFAULT_PARAMS, weightModel: "fraction" }, R: size({ ...DEFAULT_PARAMS, weightModel: "fraction" }) })
          .items.some(i => /fell back/.test(i.text)));
}

/* ── 4. setup issues from an opened design ───────────────────────── */
console.log("\n4. [M&S 32] f from the opened design's continuity check");
{
  const R = size(DEFAULT_PARAMS);
  const f = (c) => resultWarnings({ params: DEFAULT_PARAMS, R, continuity: c }).items.filter(i => i.cat === "f");
  check("a changed result is a setup warning", f({ status: "changed", moved: [1, 2] }).some(i => /different result/.test(i.text)));
  check("a failed checksum is a setup error", f({ status: "identical", hashOK: false }).some(i => i.severity === "error"));
  check("a legacy design is a setup warning", f({ status: "unchecked", legacy: true, missingInputs: ["a"] }).length === 1);
  check("a reproduced design raises nothing", f({ status: "identical", hashOK: true }).length === 0);
}

/* ── 5. known defects come from measurement ──────────────────────── */
console.log("\n5. [M&S 32] h lists measured shortfalls on the same layout");
for (const c of LAYOUTS) {
  const p = { ...DEFAULT_PARAMS, configType: c };
  const got = resultWarnings({ params: p, R: size(p) }).items.filter(i => i.cat === "h" && i.severity === "warning").length;
  const want = DOMAIN.validation.cases.filter(x => x.configType === c && (x.powertrain ?? "battery") === "battery" && Math.abs(x.errorPct?.MTOW ?? 0) > 5).length;
  check(`${c}: ${want} measured take-off-mass shortfall(s) over 5% listed`, got === want, `listed ${got}`);
}

/* ── 6. uncertainty statements ──────────────────────────────────── */
console.log("\n6. [M&S 33]/[M&S 34] every output has an uncertainty statement");
{
  const missing = Object.keys(OUTPUTS).filter(k => { const u = uncertaintyStatement(k); return !u.text || !u.method; });
  check("every registered output gets a statement and a method", missing.length === 0, missing.slice(0, 5).join(", "));
  const noneStatus = Object.keys(OUTPUTS).filter(k => OUTPUTS[k].status !== "validated" && k !== "MTOW");
  check("outputs never compared with an aircraft say no estimate is available",
        noneStatus.every(k => /No (quantitative )?estimate|No separate estimate|No quantitative estimate/.test(uncertaintyStatement(k).text)));
  const u = uncertaintyStatement("MTOW", { params: DEFAULT_PARAMS });
  const n = DOMAIN.validation.cases.filter(x => (x.powertrain ?? "battery") === "battery").length;
  check("take-off mass states a measured error over the validated aircraft", u.kind === "quantitative" && u.text.includes(`${n} published aircraft`), u.text);
  const te = uncertaintyStatement("MTOW", { params: { ...DEFAULT_PARAMS, configType: "liftcruise", powertrain: "turboelectric" } });
  check("a turboelectric design is judged only against turboelectric aircraft", /Measured against 1 published turboelectric aircraft/.test(te.text), te.text);
  const up = uncertaintyStatement("MTOW", { params: { ...DEFAULT_PARAMS, configType: "hybridPusher" } });
  check("…and says so when no aircraft of the layout exists", /no layout-specific figure/.test(up.text));
}

/* ── 7. the app and the report show them ─────────────────────────── */
console.log("\n7. Both the screen and the report carry the warnings");
{
  const app = src("src/App.jsx");
  check("App renders ResultWarnings", /<ResultWarnings warnings=\{resultWarn\}/.test(app));
  check("the warnings are built from the same state the result was", /resultWarnings\(\{params:deferredParams,R:SR,continuity\}\)/.test(app));
  const iState = app.indexOf("const[openedDesign,setOpenedDesign]"), iUse = app.indexOf("const resultWarn=useMemo");
  check("openedDesign is declared before the memo that reads it (no render-time TDZ)", iState > 0 && iUse > iState);
  const rep = src("src/export/report.js");
  check("the report imports and places the warnings section",
        /from "\.\.\/lib\/warnings\.js"/.test(rep) && /\$\{warnings_sec\}/.test(rep));
  const unc = src("src/tabs/UncertaintyTab.jsx");
  check("the Uncertainty tab uses the screen's transform", /engineInputs\(x, customAFData/.test(unc) && !/0\.76 \* x\.vCruise/.test(unc));
}

console.log("\n" + "═".repeat(72));
console.log(`RESULT WARNINGS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
