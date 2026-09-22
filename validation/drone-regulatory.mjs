/* =====================================================================
   DRONE REGULATORY GATE — thresholds are clauses, not folklore
   =====================================================================
   WHY THIS FILE EXISTS.

   A sizing tool that prints "this is a micro drone, no registration
   needed" is making a legal claim on someone's behalf. The numbers behind
   such a claim are the most confidently misquoted in the field, so each
   one here carries the document and clause that sets it, and this gate
   refuses the specific confusions that were found in the primary texts:

     - 25 kg IS NOT 55 lb. 55 lb = 24.947580 kg and 25 kg = 55.1156 lb.
       Both limits are strict, so a 25.000 kg design fails BOTH. Rounding
       one to the other designs straight into a 52 g band where an
       aircraft is legal in neither place.
     - 250 g IS NOT 0.55 lb. 0.55 lb = 249.4758 g, so a 250.0 g aircraft
       is OVER the US line and ON the EU one.
     - THE US 0.55 lb RULE GATES REGISTRATION, NOT OPERATION, and only for
       recreational flight. There is no sub-250 g commercial registration
       exemption in US law.
     - "NANO" HAS NO LEGAL BASIS anywhere sourced, and NATO's "tactical"
       means 150-600 kg rather than a small drone. A class word with no
       jurisdiction attached is meaningless, so none is emitted.

   The gate also holds the line between two questions that get conflated:
   what the LAW says at a mass, and whether this TOOL can size it. The
   second is set by the measured propeller data and runs out near 25 kg,
   which is a coincidence of engineering and law, not a derivation of one
   from the other.
   ===================================================================== */
import {
  THRESHOLDS, NON_MASS_TRIGGERS, CONVENTION_ONLY, JURISDICTIONS,
  KG_PER_LB, US_PART107_CEILING_KG, EU_OPEN_CEILING_KG, US_REGISTRATION_KG,
} from "../src/data/drone-regulatory.js";
import { classify, ceilingStatus, sizingEnvelope, requiredRotorDiameterIn, ENVELOPE } from "../src/classes/drone/classify.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

console.log("DRONE REGULATORY GATE");
console.log("=".repeat(78));

check("thresholds are present", THRESHOLDS.length > 0,
  `${THRESHOLDS.length} across ${JURISDICTIONS.length} jurisdictions`);

/* ── PROVENANCE ───────────────────────────────────────────────────── */
const noClause = THRESHOLDS.filter((t) => !t.document || !t.clause);
check("every threshold names a document and a clause", noClause.length === 0,
  noClause.slice(0, 3).map((t) => `${t.kg} kg ${t.jurisdiction}`).join(", "));
const noUrl = THRESHOLDS.filter((t) => !/^https?:\/\//.test(t.url ?? ""));
check("every threshold names a source URL", noUrl.length === 0,
  noUrl.slice(0, 3).map((t) => t.clause).join(", "));
const noGates = THRESHOLDS.filter((t) => !t.gates);
check("every threshold says WHAT it gates", noGates.length === 0,
  `registration, operation, certification and airworthiness are different things`);
const noStated = THRESHOLDS.filter((t) => !t.statedValue || !t.statedUnit);
check("every threshold keeps the value in the unit the rule states",
  noStated.length === 0, "so a converted figure is never mistaken for the legislated one");

/* ── THE ARITHMETIC THAT IS ROUTINELY GOT WRONG ───────────────────── */
check("55 lb converts to 24.947580 kg", near(55 * KG_PER_LB, 24.94758035, 1e-6),
  `${(55 * KG_PER_LB).toFixed(6)} kg`);
check("25 kg and 55 lb are DIFFERENT limits", !near(EU_OPEN_CEILING_KG, US_PART107_CEILING_KG, 1e-3),
  `${((EU_OPEN_CEILING_KG - US_PART107_CEILING_KG) * 1000).toFixed(1)} g apart`);
check("0.55 lb converts to 249.4758 g", near(US_REGISTRATION_KG * 1000, 249.4758, 1e-3),
  `a 250.0 g aircraft is OVER the US line and ON the EU one`);

/* A 25.000 kg design must be outside BOTH regimes. This is the check that
   catches someone "simplifying" the two ceilings into one constant. */
const at25 = ceilingStatus(25.0);
check("a 25.000 kg design is outside Part 107 AND outside the EU open category",
  !at25.usPart107.within && !at25.euOpen.within,
  "both limits are strict, so the round number satisfies neither");

const inBand = ceilingStatus(24.96);
check("the 52 g band between the two ceilings is detected",
  inBand.betweenTheTwoCeilings && !inBand.usPart107.within && inBand.euOpen.within,
  "24.96 kg: above 55 lb, below 25 kg — legal in Europe's open category, not under Part 107");

check("just under the US ceiling is inside both", (() => {
  const c = ceilingStatus(24.9);
  return c.usPart107.within && c.euOpen.within && !c.betweenTheTwoCeilings;
})());

/* ── WHAT MASS CANNOT DECIDE ──────────────────────────────────────── */
check("non-mass triggers are carried and explained", NON_MASS_TRIGGERS.length >= 5,
  NON_MASS_TRIGGERS.map((t) => t.label).join("; "));
check("every non-mass trigger names its jurisdiction and what it gates",
  NON_MASS_TRIGGERS.every((t) => t.jurisdiction && t.gates));
check("a classification always reports what it could not decide from mass alone",
  classify(0.3).undecidable.length === NON_MASS_TRIGGERS.length,
  "including the US recreational/commercial split, which decides whether the 0.55 lb relief exists at all");

/* ── CONVENTION IS LABELLED AS CONVENTION ─────────────────────────── */
check("words with no legal force are recorded as such", CONVENTION_ONLY.length >= 3,
  CONVENTION_ONLY.map((c) => c.word).join(", "));
check("\"nano\" is not presented as a regulatory class",
  CONVENTION_ONLY.some((c) => c.word === "nano") &&
  !THRESHOLDS.some((t) => /\bnano\b/i.test(t.gates ?? "")));
check("no threshold emits a bare class word without a jurisdiction",
  THRESHOLDS.every((t) => Boolean(t.jurisdiction)));

/* NATO and ICAO must not be presented as binding law. */
const nato = THRESHOLDS.filter((t) => /NATO/i.test(t.jurisdiction));
check("NATO entries are marked as doctrine or standardization, not civil law",
  nato.length > 0 && nato.every((t) => /doctrine|standardization/i.test(t.jurisdiction)),
  `${nato.length} entries`);
const icao = THRESHOLDS.filter((t) => /ICAO/i.test(t.jurisdiction));
check("ICAO entries are marked non-binding model text",
  icao.every((t) => /model|non-binding/i.test(t.jurisdiction)),
  `${icao.length} entries — ICAO's RPAS CONOPS classifies no aircraft by mass at all`);
const proposed = THRESHOLDS.filter((t) => /propos/i.test(t.jurisdiction) || /propos/i.test(t.status ?? ""));
check("proposed rules are excluded from a default classification",
  proposed.length > 0 && !classify(300).crossed.some((t) => proposed.includes(t)),
  `${proposed.length} proposed thresholds, opt-in only`);

/* ── THE SIZING ENVELOPE IS A SEPARATE QUESTION ───────────────────── */
const small = sizingEnvelope(5, 4);
check("a 5 kg quadcopter is inside the measured-data envelope", small.supported === true,
  small.basis);
const big = sizingEnvelope(100, 4);
check("a 100 kg quadcopter is refused, with what it would require",
  big.supported === false && big.requiredRotorDiameterIn > ENVELOPE.largestMeasuredPropIn,
  `needs ~${big.requiredRotorDiameterIn.toFixed(0)} in rotors vs ${ENVELOPE.largestMeasuredPropIn} in measured`);
check("the gap between the two engines is stated, not hidden",
  typeof big.gap === "string" && /neither/i.test(big.gap),
  `25-620 kg is validated by neither engine`);
check("above the eVTOL engine's floor the refusal names that engine instead",
  sizingEnvelope(1000, 4).evtolEngineApplies === true);
check("more rotors raise the envelope, as thrust summing requires",
  ENVELOPE.maxMassKg[8] > ENVELOPE.maxMassKg[4]);
check("required rotor diameter grows with mass",
  requiredRotorDiameterIn(100, 4) > requiredRotorDiameterIn(25, 4));

/* ── WHAT THE TABLE SAYS, PRINTED ─────────────────────────────────── */
console.log("-".repeat(78));
console.log("  thresholds in force, by mass:");
for (const t of THRESHOLDS.filter((t) => /force/i.test(t.status ?? "")))
  console.log(`    ${String(t.kg).padStart(10)} kg  ${String(t.statedValue).padStart(12)}  ` +
              `${t.jurisdiction.padEnd(34)} ${(t.gates ?? "").slice(0, 46)}`);
console.log("-".repeat(78));
console.log("  measured-data sizing envelope (thrust-to-weight 2):");
for (const [n, m] of Object.entries(ENVELOPE.maxMassKg))
  console.log(`    ${n.padStart(3)} rotors  up to ${String(m).padStart(6)} kg`);
console.log(`    above that: ${ENVELOPE.maxMassKg[8]} kg (8 rotors) to ${ENVELOPE.evtolEngineFloorKg} kg ` +
            `is validated by neither engine.`);

console.log("=".repeat(78));
console.log(fail === 0 ? `DRONE REGULATORY GATE PASSED (${pass} checks)`
                       : `DRONE REGULATORY GATE FAILED: ${fail} check(s)`);
process.exit(fail === 0 ? 0 : 1);
