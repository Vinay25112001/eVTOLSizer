/* =====================================================================
   JET AND TURBOPROP INPUT DOMAIN — THE SAME RULE, IN EVERY CLASS
   =====================================================================
   F-02 was found in the trainer loop and fixed in the trainer loop
   (CHG-006). The defect was never trainer-specific. Measured on the
   shipped code, every input each schema declares non-negative set to -1
   one at a time:

     class       declares min >= 0   accepted -1   converged:true   design moved
     transport          84               83             59              38
     bizjet             85               84             57              29
     turboprop          54               53             27              26

   The single refusal in each class was `numEngines`, caught by a rule
   about engine counts rather than about signs. Everything else sized an
   aeroplane and 143 of those runs reported `converged: true`:

     transport tsfcCruise         = -1  ->  54,340.0 lb  (-68.7 %)
     transport emptyMarginFraction= -1  ->  65,362.0 lb  (-62.4 %)
     bizjet    emptyMarginFraction= -1  ->   4,499.1 lb  (-83.7 %)
     turboprop emptyMarginFraction= -1  ->  19,622.1 lb  (-65.0 %)
     turboprop systemsFactor      = -1  ->  25,272.9 lb  (-54.9 %)

   An engine that burns negative fuel and a structure that weighs less
   than nothing are fixed points the loops are happy to find.

   THE DISCRIMINATOR IS THE SCHEMA, NOT THE SIGN. Section 3 is the check
   that makes this harness mean something: two inputs declare a NEGATIVE
   minimum -- `fieldElevationFt` (-1,500 ft, for aerodromes below sea
   level) and `fieldDeltaIsaC` (-30 C) -- and they must still be accepted.
   A guard that simply banned negative numbers would pass sections 1 and 2
   and fail here.

   ONLY THE SIGN IS POLICED, NOT THE WHOLE DECLARED RANGE (section 4),
   for the reason CHG-006 records: `max` is a slider bound, not a
   statement about where the model is valid, and these loops already
   answer an ambitious but MEANINGFUL request with converged:false and a
   stopReason. 20,000 nm from a transport is a real question with a real
   answer -- "gross weight ran away" -- not an exception.

   Run: node validation/aircraft-domain.mjs
   ===================================================================== */
import { sizeTransport } from "../src/classes/transport/size.js";
import { sizeTurboprop } from "../src/classes/turboprop/size.js";
import { TRANSPORT_INPUTS } from "../src/classes/transport/defaults.js";
import { BIZJET_ALL_INPUTS, BIZJET_DEFAULTS } from "../src/classes/bizjet/defaults.js";
import { TURBOPROP_INPUTS } from "../src/classes/turboprop/defaults.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

/* The business jet is flown by the transport method with its own inputs,
   exactly as src/classes/aircraft/engine.js routes it. */
const stripBizjetExtras = (p) => {
  const { analysisGrossLb, analysisWingAreaFt2, analysisThrustLbf, analysisFuelLb, ...rest } = p;
  return rest;
};
const sizeBizjet = (over) => sizeTransport(stripBizjetExtras({ ...BIZJET_DEFAULTS, ...over }));

const CLASSES = [
  { name: "transport", label: "Transport", inputs: TRANSPORT_INPUTS, size: sizeTransport,
    /* named in neither refusal's worked example, so only the real input
       name can satisfy the "leads with the name" check below */
    witness: "paintPerArea", baseGrossLb: 173724.4 },
  { name: "bizjet", label: "Transport", inputs: BIZJET_ALL_INPUTS, size: sizeBizjet,
    witness: "paintPerArea", baseGrossLb: 27663.7 },
  { name: "turboprop", label: "Turboprop", inputs: TURBOPROP_INPUTS, size: sizeTurboprop,
    witness: "massPerPassenger", baseGrossLb: 55990.5 },
];
const nonNegOf = (INPUTS) => Object.entries(INPUTS)
  .filter(([, s]) => typeof s.value === "number" && Number.isFinite(s.min) && s.min >= 0);

/* ── 1. every non-negative quantity refuses a negative value ──────────── */
console.log("\n-- 1. every input a class declares non-negative refuses a negative --");
for (const c of CLASSES) {
  const nonNeg = nonNegOf(c.inputs);
  const missed = [];
  for (const [k] of nonNeg) {
    try { c.size({ [k]: -1 }); missed.push(k); } catch { /* refused, as required */ }
  }
  check(`${c.name}: every input with min >= 0 refuses -1 (${nonNeg.length - missed.length}/${nonNeg.length})`,
    missed.length === 0, missed.join(", "));
}

/* ── 2. the refusal EXPLAINS, per Phase 18 ────────────────────────────── */
console.log("\n-- 2. the refusal names the input, the value and the declared range --");
for (const c of CLASSES) {
  const s = c.inputs[c.witness];
  let msg = "";
  try { c.size({ [c.witness]: -7 }); } catch (e) { msg = e.message; }
  /* The witness is an input whose name appears NOWHERE in the message's
     own worked example. An earlier trainer check asked only whether the
     message CONTAINED the input's name and passed for the wrong reason,
     because the example text happened to cite that very input. */
  check(`${c.name}: the refusal LEADS with the offending input's name`,
    msg.startsWith(`${c.label} input "${c.witness}"`), msg.slice(0, 80));
  check(`${c.name}:   ...and states the offending value and the declared range`,
    msg.includes("-7") && msg.includes(String(s.min)) && msg.includes(String(s.max)), msg.slice(0, 120));
  /* One rule in one place: src/classes/aircraft/domain.js. Three classes
     producing the same sentence shape is the observable that says so. */
  check(`${c.name}:   ...in the one shape src/classes/aircraft/domain.js writes`,
    /^[A-Z][a-z]+ input "[^"]+" cannot be negative \(got -7[^;]*; the declared range is .+ to .+\)\. \S/.test(msg),
    msg.slice(0, 120));
}

/* ── 3. AN INPUT THE SCHEMA ALLOWS TO BE NEGATIVE STAYS NEGATIVE ──────── */
console.log("\n-- 3. the discriminator: a declared-negative minimum is still honoured --");
{
  const negMin = Object.entries(TRANSPORT_INPUTS).filter(([, s]) => Number.isFinite(s.min) && s.min < 0);
  check(`the transport schema declares ${negMin.length} inputs able to go negative`,
    negMin.length === 2, negMin.map(([k, s]) => `${k} (min ${s.min})`).join(", "));
  for (const [k, s] of negMin) {
    const v = k === "fieldElevationFt" ? -1000 : -10;   /* inside each declared minimum */
    let r = null, threw = null;
    try { r = sizeTransport({ [k]: v }); } catch (e) { threw = e.message; }
    check(`${k} = ${v} (min ${s.min}) is SIZED, not refused`,
      threw === null && r && r.converged === true,
      threw ? `threw: ${threw.slice(0, 80)}` : `converged=${r && r.converged} gross=${r && r.grossLb.toFixed(1)}`);
  }
  /* A below-sea-level aerodrome is a real place: Bar Yehuda (-1,266 ft)
     and Amsterdam Schiphol (-11 ft) are both below datum, and a guard
     that banned the sign rather than reading the schema would refuse
     them. This is the check that a blanket ban cannot pass. */
}

/* ── 4. an ambitious but MEANINGFUL request is answered, not refused ──── */
console.log("\n-- 4. a large positive request is sized and answered, not thrown at --");
for (const [label, run, over, wantConverged] of [
  ["transport designRange = 20,000 nm (2.5x the slider maximum)", sizeTransport, { designRange: 20000 }, false],
  ["transport economyClass = 900 seats (2.3x the maximum)", sizeTransport, { economyClass: 900 }, true],
  ["turboprop designRange = 9,000 nm (3x the maximum)", sizeTurboprop, { designRange: 9000 }, false],
]) {
  let r = null, threw = null;
  try { r = run(over); } catch (e) { threw = e.message; }
  check(`${label} is sized, not refused`, threw === null, threw ? `threw: ${threw.slice(0, 80)}` : "");
  if (wantConverged)
    check("  ...and converges on an answer", r && r.converged === true, r ? `converged=${r.converged}` : "not sized");
  else
    check("  ...and comes back not-converged WITH a reason",
      r && r.converged === false && typeof r.stopReason === "string" && r.stopReason.length > 0,
      r ? `converged=${r.converged} stopReason=${JSON.stringify(r.stopReason).slice(0, 60)}` : "not sized");
}

/* ── 5. the business jet is covered by the transport schema ───────────── */
console.log("\n-- 5. the business jet is flown through the transport entry --");
{
  const shared = Object.keys(TRANSPORT_INPUTS).filter((k) => BIZJET_ALL_INPUTS[k]);
  const signOf = (s) => Number.isFinite(s.min) && s.min >= 0;
  const conflicts = shared.filter((k) => signOf(TRANSPORT_INPUTS[k]) !== signOf(BIZJET_ALL_INPUTS[k]));
  /* src/classes/transport/size.js enforces TRANSPORT_INPUTS on business-jet
     runs too, because bizjet/defaults.js imports transport/defaults.js and
     the reverse import would be a cycle. That is only sound while the two
     schemas agree about which quantities may go below zero. */
  check(`the two jet schemas agree on the sign of all ${shared.length} keys they share`,
    conflicts.length === 0, conflicts.join(", "));
  const bizOnly = Object.keys(BIZJET_ALL_INPUTS).filter((k) => !TRANSPORT_INPUTS[k]);
  check("the business jet adds exactly one key the transport schema does not have",
    bizOnly.length === 1 && bizOnly[0] === "passengersCarried", bizOnly.join(", "));
  /* ...and that one key is guarded explicitly, since no schema this file's
     subject can import declares it. */
  let threw = null;
  try { sizeBizjet({ passengersCarried: -4 }); } catch (e) { threw = e.message; }
  check("passengersCarried = -4 is refused", threw !== null,
    threw ? threw.slice(0, 90) : "STILL ACCEPTED — a negative payload sizes the aeroplane");
  /* ZERO IS NOT NEGATIVE, and the guard must not sweep it up: the schema
     declares min 0, and the bizjet mission deliberately carries fewer
     passengers than there are seats. What the loop then does with a
     zero-payload aeroplane is a separate matter, and it is the F-R01
     behaviour rather than the F-02 one: with the bizjet's default cargo of
     0 lb the payload is 0 lb, nothing closes, and the run says so with
     converged:false and a stopReason instead of certifying it. Measured
     identical at HEAD and with the guard in place, so the guard does not
     cause it; it is recorded here so a future change cannot quietly turn
     that honest non-convergence into a published zero-weight design. */
  let r = null, zeroThrew = null;
  try { r = sizeBizjet({ passengersCarried: 0 }); } catch (e) { zeroThrew = e.message; }
  check("passengersCarried = 0 is NOT refused — zero is not negative", zeroThrew === null,
    zeroThrew ? `threw: ${zeroThrew.slice(0, 80)}` : "");
  check("  ...and a zero-payload aeroplane is reported unconverged, not certified",
    r && r.converged === false && typeof r.stopReason === "string" && r.stopReason.length > 0,
    r ? `converged=${r.converged} gross=${r.grossLb.toFixed(1)} stopReason=${JSON.stringify(r.stopReason).slice(0, 55)}` : "refused");
}

/* ── 6. the legal designs are untouched ───────────────────────────────── */
console.log("\n-- 6. every legal design sizes exactly as it did before the guard --");
for (const c of CLASSES) {
  const r = c.size({});
  check(`${c.name}: gross weight unchanged at ${c.baseGrossLb} lb`,
    Math.abs(r.grossLb - c.baseGrossLb) < 0.05, `got ${r.grossLb.toFixed(4)}`);
  check(`${c.name}:   ...and still converges with no stopReason`,
    r.converged === true && !r.stopReason, `converged=${r.converged} stopReason=${JSON.stringify(r.stopReason)}`);
  const nonNeg = nonNegOf(c.inputs);
  check(`${c.name}: every default sits inside its own declared bounds (${nonNeg.length} checked)`,
    nonNeg.every(([, s]) => s.value >= s.min && s.value <= s.max),
    nonNeg.filter(([, s]) => s.value < s.min || s.value > s.max).map(([k]) => k).join(", "));
}

console.log("");
console.log(fail ? `AIRCRAFT DOMAIN GATE FAILED: ${fail} check(s)` : `AIRCRAFT DOMAIN GATE PASSED (${pass} checks)`);
process.exit(fail ? 1 : 0);
