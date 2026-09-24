/* =====================================================================
   TRIAGE OF THE UNVERIFIED OUTPUTS
   =====================================================================
   validation/unverified-leverage.mjs reads as though it triages "the
   unverified". It does not: it sweeps INPUTS, and it covers 13 of the 27.
   The unverified OUTPUTS -- the larger group -- had no measurement of any
   kind. This gate is the other half.

   AN OUTPUT'S LEVERAGE IS NOT AN INPUT'S. Sweeping an output is meaningless:
   nothing downstream of the engine feeds back into MTOW. The question that
   matters for an output is CONSEQUENCE -- if this number is wrong, what
   breaks? So the measurements here are reach and kind, not sensitivity.

   THE RULE THIS GATE ENFORCES, and why it is worth a gate:

     An `unverified` entry must say WHY it is unverified.

   Every other status proves itself by construction. `sourced` carries its
   citation; `validated` carries the aircraft and the error; `calibrated`
   states its fit set. `unverified` carries nothing unless someone writes it
   down -- and it is the one status where the reader most needs it, because a
   bare "unverified" cannot distinguish

       "nobody has looked at this yet"                  (a work queue item)
   from
       "this was investigated and NO published data exists anywhere"
                                                        (a permanent state)

   Those are opposite instructions to the next reader, and the registry's own
   header promises that "the honest answer to 'is this number real?' is a
   lookup, not an opinion". A bare unverified breaks that promise.

   MEASURED WHEN THIS GATE WAS WRITTEN: the project is rigorous everywhere
   else -- validated 0% bare, calibrated 0%, sourced 1%, derived 23% (pure
   algebra is largely self-documenting) -- and unverified was 50% bare, the
   worst of every status, at 35 of 70. `derived` is deliberately NOT gated
   here: "MAC = 2/3 Cr (1+t+t^2)/(1+t)" needs no note.
   ===================================================================== */
import { runSizing } from "../src/engine.js";
import * as CFG from "../src/engine/configuration.js";
import { INPUTS, OUTPUTS } from "../src/lib/provenance.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label);
};

console.log("UNVERIFIED-OUTPUT TRIAGE GATE");
console.log("=".repeat(78));

/* ── 1. THE RULE: AN UNVERIFIED ENTRY MUST SAY WHY ───────────────────── */
const bareOf = (set) => Object.entries(set)
  .filter(([, v]) => v.status === "unverified" && !v.note && !v.src)
  .map(([k]) => k);
const bareIn = bareOf(INPUTS), bareOut = bareOf(OUTPUTS);

console.log("\n1. Every `unverified` entry carries a reason:\n");
check(bareIn.length === 0,
  "no unverified INPUT is bare",
  bareIn.length ? `${bareIn.length} with no note and no src: ${bareIn.join(", ")}`
                : `all ${Object.values(INPUTS).filter(v => v.status === "unverified").length} say why`);
check(bareOut.length === 0,
  "no unverified OUTPUT is bare",
  bareOut.length ? `${bareOut.length} with no note and no src: ${bareOut.join(", ")}`
                 : `all ${Object.values(OUTPUTS).filter(v => v.status === "unverified").length} say why`);

/* The justification for the rule above, kept measured rather than asserted.
   If `unverified` ever stops being the worst-documented status, this line
   stops being true and should be re-read rather than silently updated. */
const byStatus = {};
for (const v of Object.values(OUTPUTS)) {
  const s = (byStatus[v.status] ??= { n: 0, bare: 0 });
  s.n++; if (!v.note && !v.src) s.bare++;
}
console.log("\n   bare-ness by status (outputs), the evidence for the rule:");
for (const [s, c] of Object.entries(byStatus).sort((a, b) => b[1].bare / b[1].n - a[1].bare / a[1].n))
  console.log(`     ${s.padEnd(11)} ${String(c.n).padStart(3)} total  ${String(c.bare).padStart(3)} bare  ${(100 * c.bare / c.n).toFixed(0)}%`);

/* ── 2. WHAT KIND OF THING IS EACH ONE ───────────────────────────────────
   An unverified NUMBER is an unchecked quantity. An unverified BOOLEAN is an
   unchecked DECISION, and an unverified STRUCTURE is a container whose
   elements each have their own status. Counting them together overstates the
   number of unchecked quantities, which is what made this group look like one
   undifferentiated pile. Types are read from real runs, not guessed by name. */
const unvOut = Object.entries(OUTPUTS).filter(([, v]) => v.status === "unverified").map(([k]) => k);
const LAYOUTS = ["liftcruise", "hybrid", "hybridPusher", "tiltrotor", "multicopter", "sideBySide"];
const base = { payload: 455, range: 161, vCruise: 50.4, cruiseAlt: 1000, hoverHeight: 15.24,
  reserveMinutes: 20, LD: 5.8, AR: 9, eOsw: 0.85, taper: 0.45, tc: 0.15, wingLoadingNm2: 1371,
  clCruiseMax: 0.9, clDesign: 0.55, twRatio: 1.3, convTolExp: -6, etaHov: 0.70, tipSpeed: 167.64,
  etaSys: 0.8, rateOfClimb: 5.08, climbAngle: 5, descentAngle: 6, climbLDPenalty: 0.13,
  deltaISA: 0, sedCell: 300, etaBat: 0.9, socMin: 0.19, ewf: 0.5, weightModel: "buildup",
  fusLen: 5.87, fusDiam: 1.65, vtCh: 0.45, vtCv: 0.032, vtGamma: 45, vtAR: 2.5 };
const build = (k) => {
  const d = CFG.CONFIG_DEFAULTS[k];
  const p0 = { ...base, configType: k, nPropHover: d.nRotors, vCruise: d.vCruise_ms ?? base.vCruise,
    tipSpeed: d.tipSpeed_ms ?? base.tipSpeed, LD: d.LD_target ?? base.LD, etaHov: d.etaHov ?? base.etaHov };
  return { ...p0, propDiam: CFG.solveRotorDiameter(k, p0, runSizing)?.propDiam };
};
const runs = LAYOUTS.map((k) => runSizing(build(k))).filter(Boolean);
const kindOf = (key) => {
  for (const R of runs) {
    const v = R[key];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) return "structure";
    if (typeof v === "object") return "structure";
    if (typeof v === "boolean") return "boolean";
    if (typeof v === "number") return "number";
    return typeof v;
  }
  return "absent";
};
const kinds = {};
for (const k of unvOut) (kinds[kindOf(k)] ??= []).push(k);
console.log("\n2. What kind of thing each unverified output is:\n");
for (const [t, ks] of Object.entries(kinds).sort((a, b) => b[1].length - a[1].length))
  console.log(`   ${t.padEnd(10)} ${String(ks.length).padStart(3)}   ${ks.join(" ")}`);

check((kinds.number?.length ?? 0) > 0 && runs.length === LAYOUTS.length,
  "every layout sized, so the kinds are read from real runs",
  `${runs.length} of ${LAYOUTS.length} layouts`);
check((kinds.absent?.length ?? 0) === 0,
  "every unverified output is actually produced by some layout",
  kinds.absent ? `absent on all six: ${kinds.absent.join(", ")}`
               : "none registered but never emitted");

/* ── 3. REACH — if this number is wrong, how far does it travel ───────────
   Named use only. The provenance registry itself is excluded, and so is the
   generic plumbing (Provenance.jsx, warnings.js) which keys on STATUS rather
   than on any particular name and so would flatten every row identically. */
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const f = join(d, e);
    if (statSync(f).isDirectory()) walk(f);
    else if (/\.(js|jsx|mjs)$/.test(f)) files.push(f);
  }
})("src");
for (const e of readdirSync("validation"))
  if (/\.(mjs|js)$/.test(e)) files.push(join("validation", e));

const corpus = files
  .filter((f) => !/provenance\.js$|unverified-triage\.mjs$/.test(f))
  .map((f) => ({ f, t: readFileSync(f, "utf8") }));
const bucket = (f) =>
  /^validation/.test(f) ? "gate"
  : /src[\\/]export[\\/]/.test(f) ? "export"
  : /\.jsx$/.test(f) ? "ui"
  : "engine";

const reach = unvOut.map((k) => {
  const re = new RegExp("\\b" + k + "\\b", "g");
  const hit = { engine: 0, ui: 0, export: 0, gate: 0 };
  for (const { f, t } of corpus) if (re.test(t)) hit[bucket(f)]++;
  return { k, ...hit, tot: hit.engine + hit.ui + hit.export + hit.gate };
});
reach.sort((a, b) => b.tot - a.tot);
console.log("\n3. Reach of each unverified output (files naming it):\n");
console.log("   output                        eng   ui  exp gate  total");
for (const r of reach)
  console.log("   " + r.k.padEnd(28) + String(r.engine).padStart(4) + String(r.ui).padStart(5)
    + String(r.export).padStart(5) + String(r.gate).padStart(5) + String(r.tot).padStart(7));

const ungated = reach.filter((r) => r.gate === 0);
console.log(`\n   ${ungated.length} of ${reach.length} are named by NO validation harness:`);
console.log("   " + (ungated.map((r) => r.k).join(" ") || "(none)"));
check(reach.every((r) => r.tot > 0),
  "every unverified output is reachable from somewhere",
  "an output nobody names is dead weight in the registry");

/* ── 4. THE ONES THAT TRAVEL FURTHEST ──────────────────────────────────
   Not a pass/fail: a ranking, so the next person sources in the order that
   buys the most. Exported and gate-bearing outputs come first because a
   wrong number that leaves the tool or decides a check is worse than a
   wrong number on one panel. */
const consequential = reach.filter((r) => r.export > 0 || r.gate > 0);
console.log(`\n4. Leaves the tool or decides a check (${consequential.length}):`);
console.log("   " + consequential.map((r) => r.k).join(" "));

console.log("\n" + "=".repeat(78));
if (fails.length) {
  console.log(`UNVERIFIED TRIAGE GATE FAILED — ${fails.length} check(s):`);
  for (const f of fails) console.log("   - " + f);
  process.exit(1);
}
console.log("UNVERIFIED TRIAGE GATE PASSED");
