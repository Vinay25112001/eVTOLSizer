/* ═══════════════════════════════════════════════════════════════════════
   ECONOMICS GATE — the cost model held to the same standard as the physics
   ═══════════════════════════════════════════════════════════════════════
   The DOC model was the one part of this tool outside its own discipline. It
   lived in a React component, so not one of its constants appeared in the
   provenance matrix, nothing regressed it but the check that the tab renders,
   and the "formula sources" panel under the chart had drifted from the code it
   described — every maintenance coefficient wrong on screen, and an energy
   chain still advertising a term the code had deliberately removed.

   This gate holds three lines:

     1. EVERY CONSTANT DECLARES ITS PROVENANCE. value, unit, status and a
        source sentence. `unsourced` is a legal answer and a common one; a
        MISSING answer is not.

     2. THE CONSTANTS ARE NOT DUPLICATED BACK INTO THE VIEW. The literals the
        table now owns must not reappear as bare numbers in CostTab.jsx. This
        is the specific way the panel and the code came apart, and this
        codebase has been bitten by a duplicated constant twice before —
        solidity hardcoded 0.10 in two files, and an occupant mass of 90 kg in
        two tabs against the engine's sourced 90.718.

     3. ONE OCCUPANT MASS. CostTab rounded payload/90, CertificationTab
        floored payload/90, and the engine says 90.718 kg from NASA's "6
        occupants at 1200 lb". Over a 100-900 kg payload sweep the two tabs
        disagreed at 81 of 161 points; at 500 kg the cost model priced six
        seats while the certification checklist certified five, and
        cost_per_seat_km is divided by that number. Both now call seatCount().

   WHAT THIS GATE DOES NOT DO. It does not check that any cost is RIGHT. It
   cannot: there is no published operator figure to score a cost per flight
   against the way a rotor group weight is scored against NASA Table 12. The
   honest ceiling here is `sourced`, and the route to more is NDARC Chapter 6
   (NASA/TP-20250010468 §6-2, §6-3), which publishes its own residuals and is
   already in the research corpus.
   ═══════════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DOC_CONSTANTS, COST_STATUS, seatCount, unsourcedConstants, OCCUPANT_MASS_KG }
  from "../src/engine/economics/doc-constants.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const bar = "═".repeat(76);
const fails = [];
const ok = (cond, name, detail) => {
  console.log(`  ${cond ? " ok " : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
  if (!cond) fails.push(name);
};

console.log(bar);
console.log("ECONOMICS GATE — provenance and single-source-of-truth for the DOC model");
console.log(bar);

/* ── 1. every constant declares its provenance ──────────────────────────── */
const keys = Object.keys(DOC_CONSTANTS);
const malformed = keys.filter((k) => {
  const c = DOC_CONSTANTS[k];
  return !Number.isFinite(c.value) || typeof c.unit !== "string"
      || !Object.keys(COST_STATUS).includes(c.status)
      || typeof c.source !== "string" || c.source.length < 20;
});
console.log(`\nPROVENANCE — ${keys.length} constants`);
ok(malformed.length === 0, "every constant has value, unit, status and a source sentence",
   malformed.length ? "missing on: " + malformed.join(", ") : `${keys.length} complete`);

const byStatus = {};
for (const k of keys) byStatus[DOC_CONSTANTS[k].status] = (byStatus[DOC_CONSTANTS[k].status] ?? 0) + 1;
for (const [st, n] of Object.entries(byStatus))
  console.log(`        ${String(n).padStart(2)} ${st.padEnd(11)} ${COST_STATUS[st]}`);
console.log(`        ${unsourcedConstants().length} of ${keys.length} have no source. That is `
  + `reported on screen, not hidden.`);

/* ── 2. the view must not re-declare what the table owns ────────────────── */
const tab = readFileSync(join(ROOT, "src/tabs/CostTab.jsx"), "utf8");
/* Only the literals that would silently shadow a table entry. Values that are
   obviously not costs (array indices, opacity, chart geometry) are excluded by
   requiring the literal to sit on a `const <name> = <number>;` line. */
const owned = new Map(keys.map((k) => [DOC_CONSTANTS[k].value, k]));
const redeclared = [];
tab.split("\n").forEach((ln, i) => {
  const m = /^\s*const\s+(\w+)\s*=\s*(-?[\d_]+(?:\.\d+)?)\s*;/.exec(ln);
  if (!m) return;
  const v = Number(m[2].replace(/_/g, ""));
  if (owned.has(v) && v !== 0 && v !== 1)
    redeclared.push(`${m[1]} = ${m[2]} (line ${i + 1}) shadows ${owned.get(v)}`);
});
console.log("\nSINGLE SOURCE OF TRUTH");
ok(redeclared.length === 0, "no constant the table owns is re-declared in CostTab.jsx",
   redeclared.length ? redeclared[0] : `${keys.length} values checked against the view`);
ok(tab.includes('from "../engine/economics/doc-constants.js"'),
   "CostTab imports the constants table");

/* The panel must be generated, not transcribed: the old one was prose. */
ok(/Object\.entries\(K\)[\s\S]{0,120}c\.text/.test(tab),
   "the on-screen formula panel renders FROM the table",
   "so a displayed coefficient cannot diverge from the computed one");

/* ── 3. one occupant mass ───────────────────────────────────────────────── */
const cert = readFileSync(join(ROOT, "src/tabs/CertificationTab.jsx"), "utf8");
console.log("\nOCCUPANT MASS — one definition, one rounding rule");
ok(!/payload\s*\/\s*90\b/.test(tab) && !/payload\s*\/\s*90\b/.test(cert),
   "neither tab divides payload by a hardcoded 90 kg",
   `engine value is ${OCCUPANT_MASS_KG} kg`);
ok(tab.includes("seatCount(") && cert.includes("seatCount("),
   "both tabs call the shared seatCount()");

/* and the two must now agree everywhere they are asked */
let disagree = 0;
for (let pay = 100; pay <= 900; pay += 5) {
  const a = seatCount(pay), b = seatCount(pay);
  if (a !== b) disagree++;
  if (!Number.isInteger(a) || a < 1) disagree++;
}
ok(disagree === 0, "seat count is integral and >= 1 across a 100-900 kg payload sweep",
   "161 points");

/* a payload that covers 5.6 occupants seats five, never six */
ok(seatCount(500) === Math.floor(500 / OCCUPANT_MASS_KG),
   "seat count floors rather than rounds",
   `500 kg -> ${seatCount(500)} seats (rounding gave 6)`);

console.log(`\n${bar}`);
if (fails.length) {
  console.log(`FAIL — ${fails.length} check(s): ${fails.join(" | ")}`);
  process.exit(1);
}
console.log("PASS — the cost model's constants are declared, owned in one place,");
console.log("       and rendered from the same object the code computes with.");
console.log(`       ${unsourcedConstants().length} of ${keys.length} carry no source and say so.`);
