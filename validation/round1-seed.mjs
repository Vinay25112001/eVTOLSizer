/* ═══════════════════════════════════════════════════════════════════════
   ROUND 1 — THE SEED MUST NOT BE PUBLISHED AS AN ANSWER
   ═══════════════════════════════════════════════════════════════════════
   Round 1's ceiling test used to sit AFTER the assignment and read MTOW1,
   so the offending iterate was written before anything examined it and the
   break only stopped the NEXT one. Measured on the registry entry path
   (runSizing(engineInputs(...)), which is what the UI uses):

       sedCell = 1 Wh/kg    ->  142,042.75 kg   24.9x the 5,700 kg MCTOM
       range   = 5000 km    ->   16,256.18 kg
       sedCell = 1e-9 Wh/kg ->   1.40e14 kg

   MOVING THE TEST UP IS NOT THE FIX, AND THIS HARNESS EXISTS TO SAY SO.
   The register proposed "move the guard above the assignment". Done
   literally, the test then reads the PREVIOUS, in-range iterate, passes,
   and the runaway is assigned anyway — all three numbers above are
   published unchanged and only itersR1 moves, 1 -> 2. The test has to read
   `mn`, the candidate, before it becomes the answer. Section 2 asserts
   exactly that property, and it is the section a "moved" guard fails.

   THE BOUND IS TWO-SIDED. A one-sided `mn > 5700` never rejects a NEGATIVE
   mass, and these iterates go negative: range = -4938.9 km runs
   2177 -> -12,813.92 -> 78,556.43. Keeping only an upper bound preserves
   -12,813.92 kg as "the last in-range iterate", and an aircraft weighing
   less than nothing reaches componentWeights and throws on a NaN
   nzUltimate. Section 3 pins both sides.

   AND A CONVERGED ROUND 1 IS STILL NOT AN ANSWER. vCruise = 0 publishes
   1,241.58 kg through a different door: Round 1 genuinely converges (its
   recurrence contains no vCruise at all), MTOW is SEEDED from MTOW1, and
   Round 2 breaks on its first pass without ever writing MTOW. No guard
   ordering touches that case, and 1,241.58 kg is PLAUSIBLE for this class,
   which is what makes it the dangerous one. r2Diverged says the design did
   not close; it does not say the number never came from the coupled loop.
   mtowFromR1Seed does. Section 4.

   Section 5 requires every flag asserted here to be observed BOTH true and
   false across the case set. A flag that is constant over every case this
   harness runs is not being tested by it, however many checks name it.

   Run: node validation/round1-seed.mjs
   ═══════════════════════════════════════════════════════════════════════ */
import { runSizing } from "../src/engine.js";
import { engineInputs } from "../src/lib/designfile.js";
import { DEFAULT_PARAMS } from "../src/lib/defaults.js";

const fails = [];
let passes = 0;
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label);
  if (!ok) { fails.push(label + (detail ? " — " + detail : "")); if (detail) console.log("        " + detail); }
  else passes++;
};

/* The certification ceiling Round 1 tests against. Deliberately the literal
   the loop uses: if that literal is changed, this harness must notice. */
const R1_CEILING_KG = 5700;

const CASES = [
  ["default",       {}],
  ["sedCell=1",     { sedCell: 1 }],
  ["range=5000",    { range: 5000 }],
  ["vCruise=0",     { vCruise: 0 }],
  ["sedCell=1e-9",  { sedCell: 1e-9 }],
  ["range=-5000",   { range: -5000 }],
  /* The case that separates mtowFromR1Seed from r2Diverged, and the only one
     here a user can reach: 240 km is inside the UI slider's 50-250. Round 2
     writes MTOW 65 times and never meets tolerance, so the design diverges
     while the published number is genuinely Round 2's work. Without this
     case the two flags are identical over the whole set and the new one
     would be untested by the harness that claims to test it. */
  ["range=240",     { range: 240 }],
];

const R = [];
for (const [label, over] of CASES) {
  const p = engineInputs({ ...DEFAULT_PARAMS, ...over });
  let r = null, threw = null;
  try { r = runSizing(p); } catch (e) { threw = String(e.message); }
  R.push({ label, p, r, threw });
}

/* ── 0. every case must produce a result at all ───────────────────────── */
console.log("\n-- 0. the engine returns, on every case --");
for (const c of R) {
  check(c.threw === null, `${c.label}: runSizing returns`, c.threw);
}
const OK = R.filter((c) => c.r);

/* ── 1. the flags exist ───────────────────────────────────────────────── */
console.log("\n-- 1. Round 1 reports its own outcome --");
for (const k of ["r1Converged", "r1CeilingHit", "r1FloorHit", "mtowFromR1Seed"]) {
  check(OK.every((c) => typeof c.r[k] === "boolean"),
    `${k} is present and boolean on every case`,
    OK.filter((c) => typeof c.r[k] !== "boolean").map((c) => c.label).join(", "));
}
/* itersR1 alone cannot carry this: it is 39 for a converged Round 1 and 1
   for one that bailed on its first pass, and both are just a number. */
check(
  OK.some((c) => c.r.r1Converged && c.r.itersR1 > 1) &&
  OK.some((c) => !c.r.r1Converged && c.r.itersR1 >= 1),
  "itersR1 does not distinguish a converged Round 1 from a bailed one, so a flag must",
  OK.map((c) => `${c.label}:${c.r.itersR1}/${c.r.r1Converged}`).join(" "));

/* ── 2. THE GUARD READS THE CANDIDATE, NOT THE PREVIOUS ITERATE ───────── */
console.log("\n-- 2. an out-of-category iterate is never published --");
/* This is the section a guard that was merely MOVED fails: it publishes the
   runaway and only delays the break by one iteration. */
for (const c of OK) {
  if (c.r.r1Converged) continue;
  check(c.r.MTOW1 <= R1_CEILING_KG,
    `${c.label}: a non-converged Round 1 publishes no mass above ${R1_CEILING_KG} kg`,
    `MTOW1 = ${c.r.MTOW1}`);
}
/* The three documented runaways, by name and by number. */
for (const [label, before] of [["sedCell=1", 142042.75], ["range=5000", 16256.18], ["sedCell=1e-9", 1.4049925282275262e14]]) {
  const c = OK.find((x) => x.label === label);
  check(c && c.r.MTOW1 < before,
    `${label}: no longer publishes its pre-fix value ${before}`,
    c ? `MTOW1 = ${c.r.MTOW1}` : "case missing");
}

/* ── 3. the bound is two-sided ────────────────────────────────────────── */
console.log("\n-- 3. the bound has a floor as well as a ceiling --");
for (const c of OK) {
  if (c.r.r1Converged) continue;
  check(c.r.MTOW1 >= c.p.payload,
    `${c.label}: a non-converged Round 1 publishes no mass below its own payload`,
    `MTOW1 = ${c.r.MTOW1}, payload = ${c.p.payload}`);
}
{
  const c = OK.find((x) => x.label === "range=-5000");
  check(c && c.r.r1FloorHit === true,
    "range=-5000 trips the FLOOR, not the ceiling — the iterate it rejects is -12,813.92 kg",
    c ? `r1FloorHit=${c.r.r1FloorHit} r1CeilingHit=${c.r.r1CeilingHit} MTOW1=${c.r.MTOW1}` : "case missing");
}

/* ── 4. a converged Round 1 is still not a Round 2 answer ─────────────── */
console.log("\n-- 4. the published MTOW says whether Round 2 produced it --");
for (const c of OK) {
  if (!c.r.mtowFromR1Seed) continue;
  check(Math.abs(c.r.MTOW - c.r.MTOW1) < 1e-9,
    `${c.label}: mtowFromR1Seed means the published MTOW *is* Round 1's`,
    `MTOW = ${c.r.MTOW}, MTOW1 = ${c.r.MTOW1}`);
}
{
  const c = OK.find((x) => x.label === "vCruise=0");
  check(c && c.r.r1Converged === true && c.r.mtowFromR1Seed === true,
    "vCruise=0: Round 1 CONVERGED and the answer is still only a seed — no guard ordering reaches this case",
    c ? `r1Converged=${c.r.r1Converged} mtowFromR1Seed=${c.r.mtowFromR1Seed} MTOW=${c.r.MTOW}` : "case missing");
  check(c && c.r.MTOW < R1_CEILING_KG,
    "vCruise=0: and it is PLAUSIBLE, which is why a flag and not a magnitude test is required",
    c ? `MTOW = ${c.r.MTOW}` : "case missing");
}

/* ── 5. the flags are falsifiable ─────────────────────────────────────── */
console.log("\n-- 5. every flag is observed both true and false --");
for (const k of ["r1Converged", "r1CeilingHit", "r1FloorHit", "mtowFromR1Seed", "r2Diverged"]) {
  const t = OK.filter((c) => c.r[k] === true).map((c) => c.label);
  const f = OK.filter((c) => c.r[k] === false).map((c) => c.label);
  check(t.length > 0 && f.length > 0,
    `${k} is not constant over the case set`,
    `true: [${t.join(", ")}]  false: [${f.join(", ")}]`);
}
/* mtowFromR1Seed must not be a second name for r2Diverged. */
check(OK.some((c) => c.r.r2Diverged !== c.r.mtowFromR1Seed),
  "mtowFromR1Seed is not a duplicate of r2Diverged",
  OK.map((c) => `${c.label}:${c.r.r2Diverged}/${c.r.mtowFromR1Seed}`).join(" "));

/* ── 6. converged designs did not move ────────────────────────────────── */
console.log("\n-- 6. the design that closes is untouched --");
{
  const c = OK.find((x) => x.label === "default");
  for (const [field, want] of [["MTOW", 2772.06], ["MTOW1", 1597.2], ["itersR1", 50]]) {
    check(c && Math.abs(c.r[field] - want) < 5e-3,
      `default: ${field} unchanged at ${want}`,
      c ? `got ${c.r[field]}` : "case missing");
  }
  check(c && c.r.r1Converged === true && c.r.r2Converged === true && c.r.mtowFromR1Seed === false,
    "default: converged in both rounds, and its MTOW is Round 2's",
    c ? `r1=${c.r.r1Converged} r2=${c.r.r2Converged} seed=${c.r.mtowFromR1Seed}` : "case missing");
}

console.log(`\n${fails.length ? "FAIL" : "PASS"}: ${passes} checks passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
