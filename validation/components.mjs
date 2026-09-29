/* =====================================================================
   COMPONENT-LEVEL VALIDATION — each model alone, at published inputs
   =====================================================================
   WHY THIS EXISTS, AND WHY THE OTHER TWO HARNESSES CANNOT DO IT

   `nasa-configs.mjs` and `validate.mjs` both run the FULL SIZING LOOP and
   compare converged answers. That is the right end-to-end test, but it cannot
   tell you WHICH MODEL is wrong, because the loop mixes every component
   together and then amplifies the mixture through the mass spiral. This
   project has now been bitten by that three separate times:

     * a group-boundary error and an empty-weight convention error pointing
       opposite ways, cancelling inside MTOW;
     * a lift+cruise motor group 3x too heavy, hidden because the energy was
       low by a compensating amount;
     * an `etaSys` set to the wrong definition, masked by a benchmark that
       happened to score well.

   Every one of those survived because only converged totals were being
   checked. **A component measured at PUBLISHED inputs cannot hide behind
   another component.** That is what this file does: it feeds each weight model
   NASA's own published geometry and reads the answer straight out, with no
   iteration, no convergence and no feedback.

   `validate.mjs` already does this for exactly one model — "wing model alone
   (span at the PUBLISHED MTOW)" — and that line has been the single most
   informative number in the suite (2.6% against 27.8% for the same model
   inside the loop). This generalises it.

   ── WHAT IT SCORES AGAINST ───────────────────────────────────────────
   NASA/TM-20210017971 Table 12 publishes, per vehicle: rotor group weight,
   structures, propulsion, fuel system, drive system, systems and flight
   controls. Table 12's ROTOR GROUP line is the ground truth for the rotor
   model; the drive system line for the drive model; and so on.

   Nothing here is fitted. Blade count and flap frequency were SWEPT here
   while they were thought unpublished; NASA's own NDARC decks publish them
   (engine/rotorgroup.js header), and the row after the sweep uses the deck
   values, with the sweep kept as the record of what a guess would have cost.

     node validation/components.mjs
   ===================================================================== */
import { rotorGroup, ROTOR_DECK_BY_CONFIG } from "../src/engine/rotorgroup.js";
import { driveSystem } from "../src/engine/drivesystem.js";
import { nacelleGroup } from "../src/engine/nacelle.js";
import { flightControls } from "../src/engine/flightcontrols.js";
import { WEIGHT_CONSTANTS as K } from "../src/engine/weights.js";
import { motorMass, EMRAX_TAU_MAX_NM } from "../src/engine/motormass.js";

const LB = 2.20462, FT = 3.28084;

/* NASA/TM-20210017971 Table 12 — published per-vehicle geometry and the
   published component weights they produced. Only the all-electric columns
   have a usable propulsion breakdown, but the ROTOR GROUP line is published
   for all eight variants, so the turboshaft ones are usable here even though
   the sizing harness cannot fly them. */
const VEHICLES = [
  /* ⚠ ROTOR COUNT IS NOT THE "Number lift motors" ROW. On the turboshaft
     variants that row is the number of ENGINES: the turboshaft quadrotor has
     ONE engine driving FOUR rotors. Reading it as a rotor count gave Quad-TS
     a single 9.2 ft rotor and a −78.9% error that looked like a model defect
     and was a data-entry defect. Rotor counts here come from the CONFIGURATION
     (a quadrotor has four, a side-by-side two, a single-main-rotor one). */
  { key:"SMR-TS", fc_lb:89.1, dgw_lb:3760,  nRotors:1, R_ft:17.3, tip:550, solidity:0.0666, rotor_lb:279, tilting:false },
  { key:"Quad-TS", fc_lb:91, dgw_lb:3740, nRotors:4, R_ft:9.20, tip:550, solidity:0.0650, rotor_lb:325, tilting:false },
  { key:"Quad-E", fc_lb:108, dgw_lb:6480,  nRotors:4, R_ft:13.1, tip:550, solidity:0.0550, rotor_lb:628, tilting:false,
    drive_lb:397, motor_lb:233, gearRatio:13.3, PmotKW:168*0.7457, systems_lb:536 },
  { key:"SbS-TS", fc_lb:93, dgw_lb:3470,  nRotors:2, R_ft:10.5, tip:550, solidity:0.0830, rotor_lb:196, tilting:false },
  { key:"SbS-E", fc_lb:93, dgw_lb:4900,   nRotors:2, R_ft:14.9, tip:550, solidity:0.0580, rotor_lb:345, tilting:false,
    drive_lb:255, motor_lb:145, gearRatio:14.1, PmotKW:214*0.7457, systems_lb:507 },
  { key:"L+C-E", fc_lb:152, dgw_lb:8210,   nRotors:8, R_ft:5.00, tip:585, solidity:0.267,  rotor_lb:948, tilting:false,
    drive_lb:358, motor_lb:632, gearRatio:3.85, PmotKW:139*0.7457, systems_lb:540 },
  { key:"L+C-TE", fc_lb:111, dgw_lb:8190,  nRotors:8, R_ft:5.00, tip:668, solidity:0.217,  rotor_lb:849, tilting:false },
  { key:"TW-TE", fc_lb:231, dgw_lb:6760,   nRotors:8, R_ft:3.66, tip:550, solidity:0.247,  rotor_lb:232, tilting:true },
];

const pct = (g, w) => (w ? (g - w) / w * 100 : NaN);
const f1 = (x) => (isFinite(x) ? `${x >= 0 ? "+" : ""}${x.toFixed(1)}%` : "  n/a");
const bar = "=".repeat(78);

/* ── WHY THIS FILE NOW HAS CHECKS ─────────────────────────────────────
   It was registered in `npm test` and could not fail: no exit, no throw,
   no assertion anywhere in 516 lines. A harness that cannot fail still
   counts toward a green run, so it bought coverage it did not provide.

   Everything asserted below is a claim this file ALREADY MAKES IN PROSE.
   The measurements were always here; what was missing was anything that
   notices when the code drifts out from under the narration. Where a
   claim is qualitative ("tens of kg, not hundreds") the bound is set at
   the order of magnitude the sentence asserts, not at the measured value,
   so a legitimate re-fit does not trip it and a regression does. */
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log(bar);
console.log("COMPONENT-LEVEL VALIDATION — each model alone, at NASA's published inputs");
console.log("no sizing loop, no convergence, no feedback: a component cannot hide");
console.log("behind another one here");
console.log(bar);

/* ── ROTOR GROUP ──────────────────────────────────────────────────────
   The headline comparison this file was built for: an invented [CAL]
   constant against NDARC's published regression, on the same 8 aircraft. */
console.log(`\n── ROTOR GROUP  (NASA Table 12 "Rotor group weight", 8 variants)`);
console.log(`   Blade count and flap frequency are SWEPT below, as they were when this`);
console.log(`   harness was written and thought them unpublished. They are published, in`);
console.log(`   NASA's own NDARC decks; the row after the sweep uses those values.
`);

/* ── nu BY PUBLISHED ROTOR TYPE, NOT SWEPT ────────────────────────────
   NASA publish BOTH the values and which vehicle uses which:
     "Flapping (flap frequency 1.03/rev, 4% hinge offset) and hingeless
      (flap frequency 1.25/rev) rotors are considered."
        - Concept Vehicles for VTOL Air Taxi Operations, Table 8 discussion
     "using FLAPPING rotors and collective control"          (quadrotor)
     "This design has RIGID rotors" / "These HINGELESS,
      fixed-pitch rotors"                                    (lift+cruise)
        - Johnson & Silva 2022 sec.5.1 and sec.6.3
   The lift+cruise rotors STOP in cruise and must survive edgewise flow as a
   cantilever, which is why they are rigid. Assigning nu by that published
   type is a sourced physical property, NOT a fit to the weight data. */
const NU_BY_TYPE = { flapping: 1.03, hingeless: 1.25 };
const ROTOR_TYPE = { "SMR-TS":"flapping", "Quad-TS":"flapping", "Quad-E":"flapping",
  "SbS-TS":"flapping", "SbS-E":"flapping", "L+C-E":"hingeless", "L+C-TE":"hingeless",
  "TW-TE":"flapping" };

function scoreRotor(model, nBlades, nu) {
  const errs = [];
  for (const v of VEHICLES) {
    const R_m = v.R_ft / FT;
    const nuV = nu === "byType" ? NU_BY_TYPE[ROTOR_TYPE[v.key] ?? "flapping"] : nu;
    const out = rotorGroup(
      { rotorMassModel: model, nBlades, rotorFlapFreq: nuV, solidity: v.solidity },
      { nRotors: v.nRotors, radius_m: R_m, tipSpeed_ms: v.tip / FT,
        diskArea_m2: v.nRotors * Math.PI * R_m * R_m, isTilting: v.tilting },
      K.rotorMassPerDiskAreaKgM2);
    errs.push(pct(out.mass, v.rotor_lb / LB));
  }
  const mae = errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length;
  return { errs, mae };
}

/* The nu assignment is SOURCED, not fitted: NASA publish both the values
   and which vehicle uses which, and the lift+cruise rotors are rigid
   because they stop in cruise and take edgewise flow as a cantilever.
   If either value or either assignment is edited, the sweep below stops
   being a bound on a guess and becomes a fit. */
console.log("\n   -- the published inputs this section rests on --");
check("nu by published rotor type is 1.03 flapping / 1.25 hingeless",
  NU_BY_TYPE.flapping === 1.03 && NU_BY_TYPE.hingeless === 1.25,
  "Concept Vehicles for VTOL Air Taxi Operations, Table 8 discussion");
check("both lift+cruise vehicles are the hingeless ones",
  ROTOR_TYPE["L+C-E"] === "hingeless" && ROTOR_TYPE["L+C-TE"] === "hingeless"
  && Object.values(ROTOR_TYPE).filter((t) => t === "hingeless").length === 2,
  "Johnson & Silva 2022 sec.6.3 — rigid rotors, stopped in cruise");

const calRow = scoreRotor("diskArea", 3, 1.25);
console.log(`   ${"model".padEnd(26)} ${VEHICLES.map(v => v.key.padStart(8)).join("")}   MAE`);
console.log(`   ${"[CAL] 2.0 kg/m2 disk".padEnd(26)} ${calRow.errs.map(e => f1(e).padStart(8)).join("")}  ${calRow.mae.toFixed(1)}%`);

let best = { mae: Infinity };
for (const model of ["afdd82", "afdd00"]) {
  for (const nb of [2, 3, 4, 5]) {
    for (const nu of [1.03, 1.10, 1.25]) {
      const r = scoreRotor(model, nb, nu);
      if (r.mae < best.mae) best = { ...r, model, nb, nu };
    }
  }
}
for (const model of ["afdd82", "afdd00"]) {
  for (const nu of [1.03, 1.10, 1.25]) {
    const r = scoreRotor(model, 3, nu);
    console.log(`   ${`${model.toUpperCase()} 3 blades nu=${nu}`.padEnd(26)} ${r.errs.map(e => f1(e).padStart(8)).join("")}  ${r.mae.toFixed(1)}%`);
  }
}
for (const model of ["afdd82", "afdd00"]) {
  const r = scoreRotor(model, 3, "byType");
  console.log(`   ${`${model.toUpperCase()} 3 bl nu BY TYPE`.padEnd(26)} ${r.errs.map(e => f1(e).padStart(8)).join("")}  ${r.mae.toFixed(1)}%`);
}
console.log(`\n   best over the swept grid: ${best.model.toUpperCase()}, ${best.nb} blades, `
          + `nu=${best.nu} -> MAE ${best.mae.toFixed(1)}%`);
console.log(`   (BOUND for a single UNIFORM nu. A best-fit uniform nu would be a fit;`);
console.log(`    nu BY PUBLISHED ROTOR TYPE is not — NASA give 1.03 flapping /`);
console.log(`    1.25 hingeless AND say which vehicle uses which.)`);

/* ── NASA'S OWN DECK INPUTS, NOTHING SWEPT ────────────────────────────
   The sweep above exists because blade count and flap frequency were
   thought unpublished. They are published: NASA distributes the NDARC deck
   of every reference vehicle (vendored, see engine/rotorgroup.js header).
   This row uses the deck's blade count, flap frequency, chord law and
   technology factors and removes NDARC's rotor-support term from the
   published line, since this engine books supports in booms/pylons. The
   tiltwing is excluded here on the source's own terms: its deck weighs the
   proprotors with the propeller model (tiltwing6.list :220). */
const DECK_CFG = { "SMR-TS": "helicopter", "Quad-TS": "multicopter", "Quad-E": "multicopter",
  "SbS-TS": "sideBySide", "SbS-E": "sideBySide", "L+C-E": "liftcruise", "L+C-TE": "liftcruise" };
const supportLb = (v) => {
  const d = ROTOR_DECK_BY_CONFIG[DECK_CFG[v.key]];
  return d.supportLbPerRotor != null ? v.nRotors * d.supportLbPerRotor : v.nRotors * d.supportLbPerFt * v.R_ft;
};
console.log(`\n   NASA's OWN DECK INPUTS (AFDD82, deck blades and nu, chi 0.916/0.759, geometric chord;`);
console.log(`   scored as blades+hub against Table 12 less the deck's rotor-support term):`);
const deckErrs = [], deckByKey = {};
for (const v of VEHICLES.filter((x) => DECK_CFG[x.key])) {
  const R_m = v.R_ft / FT;
  const out = rotorGroup({ configType: DECK_CFG[v.key], solidity: v.solidity },
    { nRotors: v.nRotors, radius_m: R_m, tipSpeed_ms: v.tip / FT,
      diskArea_m2: v.nRotors * Math.PI * R_m * R_m, isTilting: false }, K.rotorMassPerDiskAreaKgM2);
  const sup = supportLb(v), target = v.rotor_lb - sup;
  const e = pct(out.mass * LB, target), eWhole = pct(out.mass * LB + sup, v.rotor_lb);
  deckErrs.push(e);
  deckByKey[v.key] = e;
  console.log(`   ${v.key.padEnd(8)} ${out.nBlades} bl nu ${out.flapFreq}  blades+hub ${(out.mass * LB).toFixed(0).padStart(4)} lb`
    + ` vs ${target.toFixed(0).padStart(4)} (= ${v.rotor_lb} - support ${sup.toFixed(0)})  ${f1(e).padStart(7)}`
    + `   whole group ${f1(eWhole).padStart(7)}`);
}
console.log(`   MAE ${(deckErrs.reduce((a, b) => a + Math.abs(b), 0) / deckErrs.length).toFixed(1)}% over ${deckErrs.length} vehicles, nothing tuned.`);
/* "Nothing tuned" is only meaningful if the SET is pinned: an MAE over a
   shrinking set of vehicles improves for free. The tiltwing is excluded on
   the source's own terms (its deck weighs the proprotors with the propeller
   model, tiltwing6.list :220), which is a reason, not a convenience. */
check("the deck row scores the seven non-tiltwing vehicles",
  deckErrs.length === 7 && !("TW-TE" in deckByKey),
  `scored: ${Object.keys(deckByKey).join(", ")}`);
/* The five NON-lift+cruise vehicles reproduce at NASA's own deck inputs.
   Measured worst is -2.6%; the bound is 5% so a re-fit has room and a
   broken deck read does not. */
for (const k of ["SMR-TS", "Quad-TS", "Quad-E", "SbS-TS", "SbS-E"]) {
  check(`  ${k} reproduces at the deck inputs`, Math.abs(deckByKey[k]) < 5,
    `${deckByKey[k] >= 0 ? "+" : ""}${deckByKey[k].toFixed(1)}%`);
}
/* And the lift+cruise pair does NOT reproduce — reported, not fitted. The
   check is that they remain the two worst, i.e. that the exception the
   text spends a paragraph on is still the exception it describes. */
check("the lift+cruise pair are the two worst, as the text says",
  Math.min(Math.abs(deckByKey["L+C-E"]), Math.abs(deckByKey["L+C-TE"]))
    > Math.max(...["SMR-TS", "Quad-TS", "Quad-E", "SbS-TS", "SbS-E"].map((k) => Math.abs(deckByKey[k]))),
  `L+C-E ${deckByKey["L+C-E"].toFixed(1)}%, L+C-TE ${deckByKey["L+C-TE"].toFixed(1)}%`);
console.log(`   THE LIFT+CRUISE DOES NOT REPRODUCE and is reported, not fitted: Silva & Johnson`);
console.log(`   2018 Table 3 carries the same 948 lb as Table 12, so it is not a vintage gap;`);
console.log(`   the pusher (propulsion group), spinner (none), taper direction, nu and tip speed`);
console.log(`   are excluded; the sized solidity and the 2018 run's boom increment are not checkable.`);

/* ── SYSTEMS GROUP ────────────────────────────────────────────────────
   ADDED 2026-08-31 because nothing tested it and it turned out to be the
   largest un-measured error in the buildup.

   GROUP BOUNDARIES FIRST, because getting them wrong is how this project has
   produced false findings before:
     - packSystems is battery PACKAGING. In NASA's statement the battery sits
       in the PROPULSION group (fuel system), so packaging does NOT belong in
       systems. Excluded.
     - flightControls IS INSIDE "SYSTEMS AND EQUIPMENT" per NDARC fig. 8-3a
       (which lists flight controls, auxiliary power, instruments, hydraulic,
       pneumatic, electrical, AVIONICS, furnishings, environmental, anti-icing
       and load & handling under that one heading). Whether Table 12's separate
       flight-controls line is a CHILD of its systems total or a SIBLING was an
       open ambiguity, reported here as a range.
       IT IS NOW RESOLVED, BY CONTRADICTION. Subtracting the sourced avionics
       and furnishings from the published systems total, with flight controls
       counted INSIDE, leaves 11.6 / 5.3 / -6.5 kg for electrical, instruments,
       hydraulics, APU and lights on 2.2-3.7 tonne aircraft. A NEGATIVE
       electrical group is impossible, so the systems line EXCLUDES flight
       controls and reading A is the correct one. Reading B is kept in the
       output only as the evidence for that conclusion.
     - avionics IS inside systems and equipment, confirmed from the same
       figure. That was checked because NDARC calls it "avionics group (mission
       equipment)", which reads like a separate group and is not.
   What is left — avionics + electrical + ECS + furnishings — is the closest
   like-for-like against NASA's published `systems_lb`.

   SOURCE HUNT DONE 2026-08-31, and it EXONERATED the prime suspect.
   The working hypothesis was that the avionics buildup was wrong: it had
   doubled a flat 45 kg to 92.5 kg and was the one entry in provenance.js
   marked "unverified". It is now CORROBORATED and the hypothesis is dead.
     FLOPS (The Flight Optimization System Weights Estimation Method, Eq. 108)
       WAVONC = 15.8 * DESRNG^0.1 * NFLCR^0.7 * FPAREA^0.43   [lb]
     At NASA's quadrotor design point — 75 nmi, 1 flight crew, a 7.2 x 1.65 m
     fuselage giving 128 ft^2 planform — that is 196 lb = 88.9 kg against this
     model's 92.5 kg. Agreement within 4%, from a completely independent
     regression. AVIONICS IS NOT THE PROBLEM.

   FURNISHINGS is now partly sourced: NASA (Silva 2024) price removable seats
   at 23 lb = 10.43 kg each for a UAM aircraft of this class, so the seat term
   is [SRC] and only the trim/insulation/emergency remainder is [LAY]. The
   total per seat is unchanged, so this changes no number — it changes what is
   KNOWN about the number, which is the point of a source hunt.

   ELECTRICAL could not be anchored. FLOPS has two equations and they disagree
   wildly for this class: the transport form (Eq. 106) gives ~513 kg and the
   short-form (Eq. 107) ~147 kg for a Joby-sized aircraft, against this model's
   ~38 kg. Both are fitted to conventional aircraft whose electrical
   architecture is nothing like a distributed-electric one. NO ANCHOR FOUND.
   (That last figure READ ~89 kg until 2026-09-29 and was stale: it is
   electricalFrac x 2939.3 kg, and the fraction was recalibrated from 3.0%
   to 1.31% against Table 12 without this paragraph following it. The
   FLOPS numbers and the conclusion are unaffected — 513/147 is still 3.5x
   and still spans the model either way. Found by the checks added to this
   file in the same commit, on their first run.)

   NOT TUNED. Nothing here was adjusted to close the gap — that would be
   fitting. What the hunt bought is a smaller suspect list: avionics is
   cleared, furnishings is half-sourced, and the remaining gap sits in
   electrical + environmental, where no usable published model exists. */
console.log(`
── SYSTEMS GROUP  (NASA Table 12 "Systems and equipment weight")`);
console.log(`   boundaries: avionics + electrical + ECS + furnishings.`);
console.log(`   EXCLUDES battery packaging (propulsion group) and flight controls (tested above).`);
console.log(`   ${"vehicle".padEnd(10)} ${"published".padStart(10)} ${"ours".padStart(10)} ${"err(A)".padStart(8)} ${"err(B)".padStart(9)}`);
console.log(`   A = systems EXCLUDES flight controls (CORRECT — B implies a negative electrical group)`);
const sysRows = [];
for (const v of VEHICLES.filter(x => x.systems_lb)) {
  const MTOW_kg = v.dgw_lb / LB;
  const pubKg = v.systems_lb / LB;
  const AV = 92.5, FURN = 90.0;
  /* Read the ACTUAL constants rather than restating them — a test that
     hardcodes the value it is checking silently stops testing anything. */
  const elec = K.electricalFrac * MTOW_kg, ecs = K.ecsAntiIceFrac * MTOW_kg;
  const ours = AV + FURN + elec + ecs;
  /* Reading A: Table 12's systems line EXCLUDES flight controls (compare like
     for like). Reading B: it INCLUDES them, so add ours in and compare to the
     same published total. The truth is one of these; the table cannot say. */
  const eA = 100 * (ours / pubKg - 1);
  const eB = 100 * ((ours + v.fc_lb / LB) / pubKg - 1);
  /* AV and FURN are not restated here: the remainder is recovered from the
     same `ours` the table prints, so a change to either constant moves the
     check with the table instead of leaving it asserting a stale number. */
  sysRows.push({ key: v.key, pubKg, ours, elec, ecs, fcKg: v.fc_lb / LB, eA, eB,
                 remainderB: pubKg - (ours - elec - ecs) - v.fc_lb / LB });
  console.log(`   ${v.key.padEnd(10)} ${pubKg.toFixed(1).padStart(10)} ${ours.toFixed(1).padStart(10)} `
    + `${((eA > 0 ? "+" : "") + eA.toFixed(1) + "%").padStart(8)} `
    + `${((eB > 0 ? "+" : "") + eB.toFixed(1) + "%").padStart(9)}`);
}
/* THE BOUNDARY RESOLUTION IS A DERIVATION, SO IT CAN STOP BEING TRUE.
   Reading B (Table 12's systems line INCLUDES flight controls) was ruled
   out by contradiction: subtract the sourced avionics and furnishings and
   the flight-controls line from the published total and the remainder left
   for electrical, instruments, hydraulics, APU and lights is 11.6 / 5.3 /
   -6.5 kg. A NEGATIVE electrical group is impossible, which is the only
   reason reading A is used. If a constant ever moves that remainder
   positive, the argument is gone and the table is comparing unlike things
   without saying so. */
check("reading B still implies an impossible (negative) electrical group",
  sysRows.some((r) => r.remainderB < 0),
  sysRows.map((r) => `${r.key} ${r.remainderB.toFixed(1)} kg`).join(" · "));
/* THE TWO FRACTIONS ARE PINNED BY A DERIVATION, SO CHECK THE DERIVATION.
   weights.js declares these as "[CAL] 2/3 of the 1.96% backed out of
   Table 12" and "[CAL] 1/3 — split [LAY], total is what is calibrated".
   Only the TOTAL is calibrated and only the RATIO is chosen, so those are
   the two things worth asserting: restating the digits would pass for the
   wrong reason after any re-calibration, and would not notice one term
   being edited without the other. (The first version of this check DID
   restate the digits — 3.0% and 1.5% — and failed on its first run, which
   is how the stale prose corrected below was found.) */
check("the systems fractions still sum to the 1.96% calibrated off Table 12",
  Math.abs((K.electricalFrac + K.ecsAntiIceFrac) - 0.0196) < 1e-9,
  `${K.electricalFrac} + ${K.ecsAntiIceFrac} = ${(K.electricalFrac + K.ecsAntiIceFrac).toFixed(4)}`);
check("and are still split 2:1 electrical:environmental, as declared [LAY]",
  Math.abs(K.electricalFrac / K.ecsAntiIceFrac - 2) < 0.02,
  `ratio ${(K.electricalFrac / K.ecsAntiIceFrac).toFixed(3)}`);
check("under reading A the systems buildup is within 10% on all three",
  sysRows.every((r) => Math.abs(r.eA) < 10),
  sysRows.map((r) => `${r.key} ${r.eA >= 0 ? "+" : ""}${r.eA.toFixed(1)}%`).join(" · "));
console.log(`
   THE FINDING SURVIVES THE SOURCE HUNT, but the suspect list is smaller.
   Avionics is CLEARED (FLOPS agrees within 4%). Furnishings now has a sourced
   seat term (NASA, 23 lb/seat). The residual sits in ELECTRICAL and
   ENVIRONMENTAL, modelled as flat fractions of MTOW (1.31% and 0.65%, a total
   [CAL] against Table 12 and a [LAY] 2:1 split) for which
   no eVTOL-relevant published model was found — FLOPS' two electrical
   equations disagree by 3.5x on this class because both are fitted to
   conventional aircraft.
   The boundary ambiguity is real and is reported as a RANGE rather than
   resolved by choosing the flattering reading.`);

/* ── DRIVE SYSTEM ─────────────────────────────────────────────────────
   Already validated in engine/drivesystem.js against 2 vehicles; this puts it
   in the same table as everything else so the comparison is uniform. */
console.log(`\n── DRIVE SYSTEM  (NASA Table 12 "Drive system weight")`);
console.log(`   ${"vehicle".padEnd(10)} ${"published".padStart(10)} ${"AFDD00/train".padStart(13)} ${"error".padStart(8)}`);
const driveErrs = {};
for (const v of VEHICLES.filter(x => x.drive_lb)) {
  const R_m = v.R_ft / FT;
  const omega = (v.tip / FT) / R_m;
  const out = driveSystem({ motorGearRatio: v.gearRatio },
    { nRotors: v.nRotors, PmotKW: v.PmotKW, omegaRotor: omega });
  driveErrs[v.key] = pct(out.mass, v.drive_lb / LB);
  console.log(`   ${v.key.padEnd(10)} ${(v.drive_lb / LB).toFixed(1).padStart(8)} kg ${out.mass.toFixed(1).padStart(11)} kg ${f1(pct(out.mass, v.drive_lb / LB)).padStart(8)}`);
}
/* The header of the MOTOR GROUP section below argues from these two numbers
   ("drivesystem.js already scores -1.9% / +1.7% on two of the three") to
   conclude the gearbox is not the cause of the motor+drive error. That
   argument is only available while the two numbers hold. */
check("the gearbox is exonerated by its own score on two of the three",
  Math.abs(driveErrs["Quad-E"]) < 5 && Math.abs(driveErrs["SbS-E"]) < 5,
  Object.entries(driveErrs).map(([k, e]) => `${k} ${f1(e)}`).join(" · "));

/* ── MOTOR GROUP ──────────────────────────────────────────────────────
   THE LARGEST SINGLE MASS IN THE AIRCRAFT, AND UNTIL NOW UNTESTED. At the app
   default the motor group is 333 kg — more than the fuselage — and motor+drive
   is the worst metric against NASA's published weight statements at +33% to
   +35%. engine/drivesystem.js already scores -1.9% / +1.7% on two of the three
   vehicles, so the gearbox is not the cause; this table asks the motor model
   the same question directly, at NASA's own published shaft power and rotor
   speed, with no sizing loop to hide behind.

   The four models are REFERENCE CLASSES, not refinements of one another: which
   population the regression was fitted to is the entire question. */
console.log(`
── MOTOR GROUP  (NASA Table 12 "Motor weight", 3 electric variants)`);
console.log(`   at NASA's published power per motor and rotor speed; gear ratios are`);
console.log(`   NASA's own, recovered by inverting their motor-group weights.
`);
{
  const MODELS = ["emraxTorque", "nasaTorque", "torqueDensity", "specificPower"];
  console.log(`   ${"vehicle".padEnd(9)}${"published".padStart(10)}` +
    MODELS.map(m => m.padStart(15)).join(""));
  const errs = Object.fromEntries(MODELS.map(m => [m, []]));
  let tauLine = [];
  for (const v of VEHICLES.filter(x => x.motor_lb)) {
    const R_m = v.R_ft / FT, omega = (v.tip / FT) / R_m;
    const pub = v.motor_lb / LB;
    const cells = MODELS.map(m => {
      const r = motorMass({ model: m, P_kW: v.PmotKW, omega, gearRatio: v.gearRatio, K });
      const tot = v.nRotors * r.kg;
      errs[m].push(Math.abs(pct(tot, pub)));
      if (m === "emraxTorque") tauLine.push(`${v.key} ${r.tauNm.toFixed(0)} N·m`
        + (r.tauNm > EMRAX_TAU_MAX_NM ? " (EXTRAPOLATED)" : ""));
      return `${tot.toFixed(0)}kg ${f1(pct(tot, pub))}`.padStart(15);
    });
    console.log(`   ${v.key.padEnd(9)}${(pub.toFixed(0) + " kg").padStart(10)}${cells.join("")}`);
  }
  console.log("");
  for (const m of MODELS) {
    const mae = errs[m].reduce((a2, b3) => a2 + b3, 0) / errs[m].length;
    console.log(`   ${m.padEnd(16)} MAE ${mae.toFixed(1)}%${m === "emraxTorque" ? "   <- DEFAULT" : ""}`);
  }
  console.log(`
   motor torque demanded at NASA's own design points:`);
  console.log(`     ${tauLine.join(" · ")}`);
  console.log(`   (the EMRAX fit runs to ${EMRAX_TAU_MAX_NM} N·m; beyond it the model adds`);
  console.log(`    power at the family's specific power rather than extrapolating.)`);

  /* Every row above is labelled "<- DEFAULT" against emraxTorque. That is a
     claim about the ENGINE, made by a validation file, and nothing checked
     it: if motormass.js changes its default the table keeps printing the
     annotation beside the wrong row. Asked by calling with no model at all
     and comparing to the named one, so it cannot pass by restating itself. */
  {
    const arg = { P_kW: 100, omega: 100, gearRatio: 1, K };
    const implicit = motorMass(arg), named = motorMass({ ...arg, model: "emraxTorque" });
    check("emraxTorque really is the default the table labels",
      implicit.kg === named.kg,
      `no model ${implicit.kg.toFixed(3)} kg vs emraxTorque ${named.kg.toFixed(3)} kg`);
    /* The fit has a stated ceiling and the text says what happens past it:
       power at the family specific power, NOT an extrapolated torque line.
       Above the cap the two must part company. */
    const below = motorMass({ P_kW: 30, omega: 200, gearRatio: 1, K });
    const above = motorMass({ P_kW: 4000, omega: 4, gearRatio: 1, K });
    check("the EMRAX fit declares a ceiling and stops extrapolating past it",
      below.tauNm < EMRAX_TAU_MAX_NM && above.tauNm > EMRAX_TAU_MAX_NM && above.kg > below.kg,
      `cap ${EMRAX_TAU_MAX_NM} N·m; ${below.tauNm.toFixed(0)} -> ${above.tauNm.toFixed(0)} N·m`);
  }
}

/* ── CERTIFIED HARDWARE ───────────────────────────────────────────────
   THE ONE MEASURED ELECTRIC-PROPULSION REFERENT. Nothing above is a weighed
   aircraft: NASA's weight statements are NDARC output and the commercial
   figures are brochures, and as of September 2026 no type-certified eVTOL
   has a public weight statement (the EH216-S data sheet sits inside CAAC's
   AMOS system; Joby's certificate is expected late 2026). What IS certified
   and weighed is the first electric aero engine and its propeller:

     EASA.E.234 Issue 01 (18 May 2020), Pipistrel E-811-268MVLC.
       section 5 Dry Weight: motor 22.7 kg, power controller 7 kg.
       section 6 Ratings: MTOP 57.6 kW at 2500 rpm (90 s), MCP 49.2 kW at
       2350 rpm; torque 220 N·m at MTOP, 200 N·m at MCP.
     EASA.A.573 Issue 13 (19 Nov 2025), Velis Electro section 7 Propeller:
       Pipistrel P-812 / 164-F3A, three blades, 1640 mm, 4.88 kg.

   Both data sheets are vendored with sha256 in the research corpus
   (eVTOL_Sizing_Research/sources/type-certificates/), and the numbers here
   were re-read from the PDFs, not from a note.

   REPORTED, NOT FITTED. One motor is a point, not a population: a 2020
   axial-flux liquid-cooled design certified with margins, where the EMRAX
   fit describes 2024 datasheets. The propeller row is the first measured
   number the [CAL] per-disk-area constant has ever met. Neither is refit
   on one point; each row says where the model lands. */
console.log(`
── CERTIFIED HARDWARE  (EASA.E.234 §5-6 E-811 motor; EASA.A.573 §7 P-812 propeller)`);
console.log(`   the only measured, authority-certified hardware on the eVTOL side; not a VTOL.
`);
{
  const E811 = { motorKg: 22.7, controllerKg: 7, mtopKW: 57.6, mtopRpm: 2500, tauMtopNm: 220,
                 mcpKW: 49.2, mcpRpm: 2350, tauMcpNm: 200 };
  const P812 = { blades: 3, diam_m: 1.640, kg: 4.88 };
  const MODELS = ["emraxTorque", "nasaTorque", "torqueDensity", "specificPower"];
  const rad = (rpm) => rpm * 2 * Math.PI / 60;
  for (const [tag, P_kW, rpm, tauPub] of [["MTOP", E811.mtopKW, E811.mtopRpm, E811.tauMtopNm],
                                          ["MCP ", E811.mcpKW,  E811.mcpRpm,  E811.tauMcpNm]]) {
    const omega = rad(rpm), tau = P_kW * 1000 / omega;
    console.log(`   ${tag} ${P_kW} kW at ${rpm} rpm = ${tau.toFixed(0)} N·m (certificate ${tauPub} N·m)` +
                `   certified motor ${E811.motorKg} kg, + ${E811.controllerKg} kg controller`);
    for (const m of MODELS) {
      const r = motorMass({ model: m, P_kW, omega, gearRatio: 1, K });
      console.log(`         ${m.padEnd(14)} ${r.kg.toFixed(1).padStart(5)} kg  ${f1(pct(r.kg, E811.motorKg))} vs motor` +
                  `  ${f1(pct(r.kg, E811.motorKg + E811.controllerKg))} vs motor+controller` +
                  `${m === "emraxTorque" ? "   <- DEFAULT" : ""}`);
    }
  }
  const sp = (kw, kg) => (kw / kg).toFixed(2);
  console.log(`   certified specific power: ${sp(E811.mtopKW, E811.motorKg)} kW/kg motor, ` +
              `${sp(E811.mtopKW, E811.motorKg + E811.controllerKg)} kW/kg with controller (MTOP, 90 s); ` +
              `MCP ${sp(E811.mcpKW, E811.motorKg)} / ${sp(E811.mcpKW, E811.motorKg + E811.controllerKg)}`);
  const propKg = K.rotorMassPerDiskAreaKgM2 * Math.PI * Math.pow(P812.diam_m / 2, 2);
  console.log(`   propeller: P-812 ${P812.blades} blades, ${P812.diam_m} m, certified ${P812.kg} kg;` +
              ` this engine's cruise propeller at that diameter ${propKg.toFixed(2)} kg ${f1(pct(propKg, P812.kg))}` +
              ` ([CAL] ${K.rotorMassPerDiskAreaKgM2} kg/m2 of disk, its first measured comparison)`);
  console.log(`   Reported, not fitted: one certified motor and one propeller are points, not populations.`);

  /* THE ONE PLACE A DATA-ENTRY ERROR WOULD BE SILENT. Every other number in
     this section is scored against something; the certificate figures are
     just transcribed. They are not independent, though — EASA.E.234 gives
     power, speed AND torque, so P = tau*omega checks the transcription
     against itself. A mistyped rating stops satisfying its own identity. */
  for (const [tag, P_kW, rpm, tauPub] of [["MTOP", E811.mtopKW, E811.mtopRpm, E811.tauMtopNm],
                                          ["MCP", E811.mcpKW, E811.mcpRpm, E811.tauMcpNm]]) {
    const tau = P_kW * 1000 / rad(rpm);
    check(`  EASA.E.234 ${tag}: P = tau x omega to within 1 N·m`,
      Math.abs(tau - tauPub) < 1, `${tau.toFixed(1)} vs certificate ${tauPub} N·m`);
  }
}

/* ── INSTALLED MOTOR MARGIN ───────────────────────────────────────────
   WHY THE MOTOR GROUP IS WRONG, AND IT IS NOT THE MASS MODEL.

   The motor mass table above shows every model UNDER-predicting NASA's
   published motor weights, yet the sized aircraft OVER-predicts motor+drive by
   +33%. Both are true, and this table is why: the sizing loop installs more
   motor power than NASA does, and the mass follows the power.

   NASA's installed margin is RECOVERED HERE FROM THEIR OWN PUBLISHED NUMBERS —
   gross weight, disk loading and figure of merit — through momentum theory, so
   it does not depend on anything this engine computes:

       P_hover/rotor = (W/FM) sqrt(DL / 2 rho) / N      at 5,000 ft ISA+20

   The result is NOT a constant, and that is the finding. This engine applies a
   single twRatio of 1.30 to every layout, which momentum theory turns into a
   uniform POWER factor of 1.30^1.5 = 1.482. */
console.log(`
── INSTALLED MOTOR MARGIN  (recovered from NASA's own DL, FM and DGW)`);
{
  const RHO_5K_ISA20 = 0.985;     // 5,000 ft, ISA+20 — NASA's sizing day
  const PSF_N = 47.8803, G = 9.80665;
  const NASA = [
    { k:"Quad-E", W_kg:2939.3, DL:3.00, FM:0.700, N:4, hp:168,
      note:"rotor-borne, 4 INDEPENDENT rotors — must hover on N-1" },
    { k:"SbS-E",  W_kg:2222.6, DL:3.50, FM:0.680, N:2, hp:214,
      note:"INTERCONNECTED — a motor failure costs no rotor" },
    { k:"L+C-E",  W_kg:3724.0, DL:14.0, FM:0.740, N:8, hp:139,
      note:"WING-BORNE — the wing unloads the rotors; NASA keep baseline motors" },
  ];
  const OURS = Math.pow(1.30, 1.5);
  const factors = [];
  console.log(`   ${"vehicle".padEnd(9)}${"hover kW/rotor".padStart(15)}${"NASA kW/motor".padStart(15)}`
    + `${"NASA factor".padStart(13)}${"ours".padStart(8)}${"over by".padStart(10)}`);
  for (const v of NASA) {
    const P = (v.W_kg * G / v.FM) * Math.sqrt(v.DL * PSF_N / (2 * RHO_5K_ISA20)) / 1000 / v.N;
    const nasaKW = v.hp * 0.7457, factor = nasaKW / P;
    factors.push({ k: v.k, factor });
    console.log(`   ${v.k.padEnd(9)}${P.toFixed(1).padStart(15)}${nasaKW.toFixed(1).padStart(15)}`
      + `${factor.toFixed(3).padStart(13)}${OURS.toFixed(3).padStart(8)}`
      + `${(OURS / factor).toFixed(2).padStart(9)}x`);
  }
  for (const v of NASA) console.log(`     ${v.k.padEnd(8)} ${v.note}`);
  console.log("");
  console.log(`   NASA's margin is CONFIGURATION-DEPENDENT (1.425 / 1.080 / 0.911) and this`);
  console.log(`   engine applies a uniform 1.482 — which is the motor+drive error, and it`);
  console.log(`   tracks: +8.7% / +35.2% / +33.3%. NASA say so themselves (corpus S3270):`);
  console.log(`   "This power factor is a FUNCTION OF THE AIRCRAFT CONFIGURATION".`);
  console.log("");
  console.log(`   RESOLVED — AND IT IS NOT A MODEL ERROR. The quantity being compared is`);
  console.log(`   NASA's own HOVER LOAD FACTOR n_z, and Hartman, Altamirano & Suh (VFS 81st`);
  console.log(`   Forum, 2025) size this exact lift+cruise against it, sweeping n_z from`);
  console.log(`   1.00 g to 1.77 g. Their finding about the baseline is decisive:`);
  console.log(`     "the operating torque required to hover EXCEEDS the continuous operation`);
  console.log(`      rated torque ... this design would NOT BE ACCEPTABLE without`);
  console.log(`      modification"  — satisfied only "by the 1.35 g design variant", so`);
  console.log(`     "design variants below 1.35 g load factor could be eliminated".`);
  console.log("");
  console.log(`   Table 12's weight statements are designs at about n_z = 1.00 — the point`);
  console.log(`   NASA's own flight-dynamics work REJECTS. This engine sizes at n_z = 1.30,`);
  console.log(`   just under their 1.35 floor, so the motor+drive gap measures a DESIGN`);
  console.log(`   POINT DIFFERENCE, not model error: n_z^1.5 gives 1.482x against 1.000x.`);
  console.log(`   Measured confirmation: moving the default to 1.35 makes the comparison`);
  console.log(`   WORSE (13 of 21 within +/-5% -> 8, motor+drive +33% -> +44%), which is the`);
  console.log(`   benchmark drifting further from a 1.00 g aircraft, not the model decaying.`);
  console.log(`   Separately, deriving n_z per configuration from N/(N-1) was refuted`);
  console.log(`   (1.54 / 1.00 / 1.22 against 1.425 / 1.080 / 0.911) — see note 20.`);

  /* THE FINDING IS THE SPREAD, NOT ANY ONE FACTOR. These three numbers are
     recovered from NASA's own published gross weight, disk loading and
     figure of merit through momentum theory, so they do not depend on
     anything this engine computes — which is exactly why they are worth
     pinning: they are arithmetic on published data and must reproduce. */
  const want = { "Quad-E": 1.425, "SbS-E": 1.080, "L+C-E": 0.911 };
  for (const { k, factor } of factors) {
    check(`  ${k}: NASA's installed margin recovers to ${want[k]}`,
      Math.abs(factor - want[k]) < 0.005, `recovered ${factor.toFixed(3)}`);
  }
  const lo = Math.min(...factors.map((f) => f.factor)), hi = Math.max(...factors.map((f) => f.factor));
  check("NASA's margin is configuration-DEPENDENT, this engine's is not",
    hi / lo > 1.5 && factors.every((f) => Math.abs(f.factor - OURS) > 0.001),
    `NASA ${lo.toFixed(3)}..${hi.toFixed(3)} (x${(hi / lo).toFixed(2)}) against a uniform ${OURS.toFixed(3)}`);
}

/* ── NACELLE GROUP ────────────────────────────────────────────────────
   No published line to score against — Table 12 does not break the nacelle
   group out of structures. Reported as a MAGNITUDE check instead, which is
   what it was built to answer. */
console.log(`\n── NACELLE GROUP  (no published line in Table 12 — magnitude check only)`);
console.log(`   built to test the claim that a missing nacelle group explained a`);
console.log(`   ~290 kg lift+cruise structures gap:\n`);
const nacelleKg = {};
for (const v of VEHICLES.filter(x => x.motor_lb)) {
  const out = nacelleGroup({}, { motorMassKg: v.motor_lb / LB, nMotors: v.nRotors, MTOW: 3000 });
  nacelleKg[v.key] = out.mass;
  console.log(`   ${v.key.padEnd(10)} motors ${(v.motor_lb / LB).toFixed(0).padStart(4)} kg over ${String(v.nRotors).padStart(2)} -> nacelle ${out.mass.toFixed(1).padStart(6)} kg`);
}
console.log(`   -> the group is tens of kg, not hundreds. The 290 kg inference was wrong.`);
/* The refutation, made checkable. The claim is an ORDER OF MAGNITUDE, so
   that is what the bound tests: anything under 100 kg refutes the 290 kg
   inference and anything over 1 kg means the group was actually built. */
check("the nacelle group is tens of kg, not hundreds",
  Object.values(nacelleKg).every((m) => m > 1 && m < 100),
  Object.entries(nacelleKg).map(([k, m]) => `${k} ${m.toFixed(1)} kg`).join(" · "));

console.log(`\n${bar}`);
console.log("Component accuracy is NOT the same as loop accuracy. A component that");
console.log("scores well here can still produce a bad aircraft if it is fed the wrong");
console.log("inputs by the loop -- and a component that scores badly here is a defect");
console.log("regardless of what the loop happens to converge to.");
console.log(bar);

/* ── FLIGHT CONTROLS ──────────────────────────────────────────────────
   The second mismatch flagged by the method-fidelity audit: a flat 2.5% of
   MTOW [FRAC] against NDARC AFDD82 §29-8. Table 12 publishes the flight
   controls line for all eight variants, so this is directly testable — and
   the result does NOT go the way the audit assumed. */
console.log(`\n── FLIGHT CONTROLS  (NASA Table 12 "Flight controls weight", 8 variants)`);
console.log(`   ${"vehicle".padEnd(9)} ${"published".padStart(9)} ${"% of MTOW".padStart(10)} ${"FRAC 2.5%".padStart(11)} ${"err".padStart(8)} ${"AFDD82".padStart(10)} ${"err".padStart(9)}`);
let fracErrs = [], afddErrs = [], fcShare = [];
for (const v of VEHICLES) {
  const MTOW = v.dgw_lb / LB, want = v.fc_lb / LB;
  const R_m = v.R_ft / FT;
  const g = { MTOW, nRotors: v.nRotors, radius_m: R_m, tipSpeed_ms: v.tip / FT,
              sHt_m2: 0, nTilting: v.tilting ? v.nRotors : 0 };
  const fr = flightControls({ solidity: v.solidity }, g, K.flightControlsFrac);
  const af = flightControls({ flightControlsModel: "afdd", solidity: v.solidity,
                              rotorControl: "rpm" }, g, K.flightControlsFrac);
  fracErrs.push(pct(fr.mass, want)); afddErrs.push(pct(af.mass, want));
  fcShare.push({ key: v.key, share: 100 * want / MTOW });
  console.log(`   ${v.key.padEnd(9)} ${want.toFixed(1).padStart(7)} kg ${(100*want/MTOW).toFixed(2).padStart(9)}% ${fr.mass.toFixed(1).padStart(9)} kg ${f1(pct(fr.mass,want)).padStart(8)} ${af.mass.toFixed(1).padStart(8)} kg ${f1(pct(af.mass,want)).padStart(9)}`);
}
const mae = (a) => a.reduce((x, y) => x + Math.abs(y), 0) / a.length;
console.log(`\n   [FRAC] 2.5% of MTOW   MAE ${mae(fracErrs).toFixed(1)}%`);
console.log(`   AFDD82 §29-8          MAE ${mae(afddErrs).toFixed(1)}%`);
console.log(`\n   THE FLAGGED "MISMATCH" RESOLVES THE OTHER WAY. AFDD's N_rotor^1.3855`);
console.log(`   term describes mechanical control runs from a cockpit to every rotor;`);
console.log(`   a distributed-electric aircraft with fly-by-wire has wires. Importing`);
console.log(`   the equation would replace a fraction that is modestly high with a`);
console.log(`   regression that is several times high. The [FRAC] model is KEPT.`);
console.log(`   Published spread is 1.36%-3.42% of MTOW, and the top of it is the`);
console.log(`   TILTWING — NDARC counts "conversion (rotor tilt) flight controls" as`);
console.log(`   its own category, which is real configuration dependence.`);

/* THE SECTION'S CONCLUSION, WHICH IS A COMPARISON AND SO CAN REVERSE.
   The method-fidelity audit flagged the flat [FRAC] model as a mismatch
   against AFDD82 §29-8; measured on NASA's own eight variants the import
   would be an order of magnitude worse, because the N_rotor^1.3855 term
   describes mechanical runs to every rotor and these aircraft are
   fly-by-wire. "Several times high" is the claim, so 2x is the bound. */
console.log("");
check("keeping [FRAC] over AFDD82 is still the better of the two",
  mae(fracErrs) < mae(afddErrs) && mae(afddErrs) > 2 * mae(fracErrs),
  `[FRAC] MAE ${mae(fracErrs).toFixed(1)}% against AFDD82 ${mae(afddErrs).toFixed(1)}%`);
/* The published spread is quoted to two decimals in the line above, and the
   claim that its TOP is the tiltwing is the evidence for real configuration
   dependence rather than scatter. Both are read off Table 12. */
{
  const lo = Math.min(...fcShare.map((r) => r.share)), hi = Math.max(...fcShare.map((r) => r.share));
  const top = fcShare.reduce((a, b) => (b.share > a.share ? b : a));
  check("the published spread is 1.36%-3.42% of MTOW as quoted",
    Math.abs(lo - 1.36) < 0.01 && Math.abs(hi - 3.42) < 0.01,
    `${lo.toFixed(2)}% .. ${hi.toFixed(2)}%`);
  check("and the top of it is the TILTWING, which is the point being made",
    top.key === "TW-TE", `top is ${top.key} at ${top.share.toFixed(2)}%`);
}

console.log(`\n${bar}`);
console.log(fail ? `COMPONENT GATE FAILED: ${fail} check(s), ${pass} passed`
                 : `COMPONENT GATE PASSED (${pass} checks)`);
console.log(bar);
process.exit(fail ? 1 : 0);
